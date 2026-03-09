import type { Database } from "../../infra/db/client.js";
import type { InboundMessage } from "../telegram/contract.js";
import { newId } from "../records/service.js";

export type ConversationContext = {
  tenantId: string;
  userId: string;
  conversationId: string;
  chatId: number;
};

export function createConversationService(db: Database) {
  return {
    async resolve(inbound: InboundMessage): Promise<ConversationContext> {
      const tenantId = "tenant-default";

      const existingUser = inbound.telegramUserId === null
        ? []
        : await db`
            select id
            from users
            where telegram_user_id = ${inbound.telegramUserId}
            limit 1
          `;
      const userId = existingUser[0]?.id ?? newId("user");

      if (!existingUser[0]) {
        await db`
          insert into users (id, tenant_id, telegram_user_id, first_name, last_name, username, language_code)
          values (${userId}, ${tenantId}, ${inbound.telegramUserId}, ${inbound.firstName}, ${inbound.lastName}, ${inbound.username}, ${inbound.languageCode})
        `;
      }

      await db`
        insert into telegram_bindings (id, tenant_id, user_id, chat_id)
        values (${newId("binding")}, ${tenantId}, ${userId}, ${inbound.chatId})
        on conflict (chat_id) do nothing
      `;

      const existingConversation = await db`
        select id
        from conversations
        where chat_id = ${inbound.chatId}
        limit 1
      `;
      const conversationId = existingConversation[0]?.id ?? newId("conversation");

      if (!existingConversation[0]) {
        await db`
          insert into conversations (id, tenant_id, user_id, chat_id)
          values (${conversationId}, ${tenantId}, ${userId}, ${inbound.chatId})
        `;
      } else {
        await db`
          update conversations
          set updated_at = now()
          where id = ${conversationId}
        `;
      }

      return { tenantId, userId, conversationId, chatId: inbound.chatId };
    },

    async saveMessage(conversationId: string, role: "user" | "assistant", content: string, rawJson: unknown, externalId?: string): Promise<string> {
      const id = newId("message");
      await db`
        insert into messages (id, conversation_id, role, external_id, content, raw_json)
        values (${id}, ${conversationId}, ${role}, ${externalId ?? null}, ${content}, ${db.json(rawJson as never)})
        on conflict (external_id) do nothing
      `;
      return id;
    }
  };
}
