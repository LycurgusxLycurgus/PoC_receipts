import { AppError } from "../../shared/errors.js";
import type { Logger } from "../../infra/logger/logger.js";
import type { InboundMessage } from "./contract.js";
import type { ReturnTypeOfFactories } from "../../app/routes.js";

const MAX_TELEGRAM_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export function createTelegramService(deps: ReturnTypeOfFactories, logger: Logger) {
  return {
    async handleInbound(inbound: InboundMessage): Promise<string> {
      const auditId = `telegram-update-${inbound.updateId}`;
      const seen = await deps.db`
        select id
        from audit_events
        where external_id = ${auditId}
        limit 1
      `;
      if (seen[0]) {
        logger.info("telegram.duplicate", { updateId: inbound.updateId });
        return "Duplicate update ignored.";
      }

      const conversation = await deps.conversations.resolve(inbound);
      await deps.db`
        insert into audit_events (id, tenant_id, user_id, conversation_id, event_type, external_id, payload_json)
        values (${crypto.randomUUID()}, ${conversation.tenantId}, ${conversation.userId}, ${conversation.conversationId}, 'telegram.inbound', ${auditId}, ${deps.db.json(inbound.raw)})
      `;

      const userMessageId = await deps.conversations.saveMessage(
        conversation.conversationId,
        "user",
        inbound.text || (inbound.photoFileId ? "[photo]" : inbound.documentName ? `[document:${inbound.documentName}]` : "[message]"),
        inbound.raw,
        `telegram-message-${inbound.messageId}`
      );

      const openTask = await deps.clarifications.getOpen(conversation.conversationId);
      if (openTask && inbound.text && inbound.text !== "/login") {
        await deps.clarifications.answer(openTask.id, inbound.text);
        const text = "Thanks. Saved and marked ready.";
        await deps.conversations.saveMessage(conversation.conversationId, "assistant", text, { taskId: openTask.id });
        await deps.telegramApi.sendMessage(inbound.chatId, text);
        return text;
      }

      if (inbound.text === "/start") {
        const nextQuestion = await deps.onboarding.getNextQuestion(conversation.userId);
        const text = nextQuestion ?? "Setup complete. Send me your first receipt!";
        await deps.conversations.saveMessage(conversation.conversationId, "assistant", text, { kind: "onboarding" });
        await deps.telegramApi.sendMessage(inbound.chatId, text);
        return text;
      }

      if (inbound.text === "/login") {
        const token = deps.auth.createLoginToken(conversation.userId);
        const text = `Open your inbox: ${deps.env.APP_BASE_URL}/auth/telegram?token=${token}`;
        await deps.conversations.saveMessage(conversation.conversationId, "assistant", text, { kind: "login" });
        await deps.telegramApi.sendMessage(inbound.chatId, text);
        return text;
      }

      const onboardingQuestion = await deps.onboarding.getNextQuestion(conversation.userId);
      if (onboardingQuestion && inbound.text) {
        const nextQuestion = await deps.onboarding.saveAnswer(conversation.userId, inbound.text);
        const text = nextQuestion ?? "Perfect. Setup complete. Send me your first receipt!";
        await deps.conversations.saveMessage(conversation.conversationId, "assistant", text, { kind: "onboarding-answer" });
        await deps.telegramApi.sendMessage(inbound.chatId, text);
        return text;
      }

      if (!inbound.photoFileId && !inbound.documentFileId) {
        const text = "Send a receipt photo or invoice PDF. Use /login if you need the web inbox.";
        await deps.conversations.saveMessage(conversation.conversationId, "assistant", text, { kind: "hint" });
        await deps.telegramApi.sendMessage(inbound.chatId, text);
        return text;
      }

      const candidateSize = inbound.documentSize ?? inbound.photoSize ?? 0;
      if (candidateSize > MAX_TELEGRAM_DOWNLOAD_BYTES) {
        const text = "This file is larger than Telegram bot download limits. Please use the web upload fallback in the next phase.";
        await deps.conversations.saveMessage(conversation.conversationId, "assistant", text, { kind: "file-too-large" });
        await deps.telegramApi.sendMessage(inbound.chatId, text);
        return text;
      }

      const telegramFileId = inbound.documentFileId ?? inbound.photoFileId;
      if (!telegramFileId) {
        throw new AppError(400, "TELEGRAM_FILE_MISSING", "No Telegram file found");
      }

      const file = await deps.telegramApi.getFile(telegramFileId);
      const uploadInput = {
        bytes: file.bytes,
        mimeType: inbound.documentMimeType ?? file.mimeType,
        fileName: inbound.documentName ?? file.fileName,
        sizeBytes: file.sizeBytes
      };
      const stored = await deps.storage.save(conversation.userId, uploadInput.fileName, file.bytes);
      const uploadId = await deps.records.createUpload(conversation.userId, conversation.conversationId, telegramFileId, stored, uploadInput);

      const context = await deps.context.compose(conversation.userId, conversation.conversationId, "full");
      const extraction = await deps.gemini.extractRecord(context, uploadInput, inbound.text);

      const recordId = await deps.records.saveDraft({
        tenantId: conversation.tenantId,
        userId: conversation.userId,
        conversationId: conversation.conversationId,
        sourceMessageId: userMessageId,
        uploadId,
        extraction
      });

      let responseText = extraction.assistantMessage;
      if (extraction.missingFields[0]) {
        const question = extraction.missingFields[0] === "attendee"
          ? "Got it. Since this looks like a restaurant receipt, who was the client or attendee?"
          : `What is the ${extraction.missingFields[0]}?`;
        await deps.clarifications.setNextQuestion(recordId, conversation.conversationId, extraction.missingFields[0], question);
        responseText = question;
      }

      await deps.db`
        insert into audit_events (id, tenant_id, user_id, conversation_id, event_type, payload_json)
        values (${crypto.randomUUID()}, ${conversation.tenantId}, ${conversation.userId}, ${conversation.conversationId}, 'record.saved', ${deps.db.json({ recordId, uploadId, extraction })})
      `;
      await deps.conversations.saveMessage(conversation.conversationId, "assistant", responseText, { recordId });
      await deps.telegramApi.sendMessage(inbound.chatId, responseText);
      return responseText;
    }
  };
}
