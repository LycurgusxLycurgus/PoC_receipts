import { z } from "zod";

const userSchema = z.object({
  id: z.number(),
  is_bot: z.boolean().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional()
});

const photoSchema = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  file_size: z.number().optional()
});

const documentSchema = z.object({
  file_id: z.string(),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
  file_size: z.number().optional()
});

const messageSchema = z.object({
  message_id: z.number(),
  date: z.number(),
  chat: z.object({
    id: z.number(),
    type: z.string()
  }),
  from: userSchema.optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  photo: z.array(photoSchema).optional(),
  document: documentSchema.optional()
});

export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: messageSchema.optional()
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

export type InboundMessage = {
  updateId: number;
  messageId: number;
  chatId: number;
  telegramUserId: number | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  languageCode: string | null;
  text: string;
  photoFileId: string | null;
  photoSize: number | null;
  documentFileId: string | null;
  documentName: string | null;
  documentMimeType: string | null;
  documentSize: number | null;
  raw: TelegramUpdate;
};

export function normalizeUpdate(update: TelegramUpdate): InboundMessage {
  const message = update.message;
  if (!message) {
    throw new Error("Unsupported Telegram update without message");
  }

  const largestPhoto = message.photo?.slice().sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];

  return {
    updateId: update.update_id,
    messageId: message.message_id,
    chatId: message.chat.id,
    telegramUserId: message.from?.id ?? null,
    firstName: message.from?.first_name ?? null,
    lastName: message.from?.last_name ?? null,
    username: message.from?.username ?? null,
    languageCode: message.from?.language_code ?? null,
    text: message.text ?? message.caption ?? "",
    photoFileId: largestPhoto?.file_id ?? null,
    photoSize: largestPhoto?.file_size ?? null,
    documentFileId: message.document?.file_id ?? null,
    documentName: message.document?.file_name ?? null,
    documentMimeType: message.document?.mime_type ?? null,
    documentSize: message.document?.file_size ?? null,
    raw: update
  };
}
