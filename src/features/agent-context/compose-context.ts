import type { Database } from "../../infra/db/client.js";

export type ComposedContext = {
  systemPrefix: string;
  fragmentText: string;
  recentMessages: string;
  settingsSummary: string;
};

export function createContextService(db: Database) {
  return {
    async compose(userId: string, conversationId: string, mode: "full" | "minimal"): Promise<ComposedContext> {
      const fragments = await db`
        select kind, title, body_markdown
        from context_fragments
        where active = true
          and (scope_type = 'global' or (scope_type = 'user' and scope_id = ${userId}) or (scope_type = 'conversation' and scope_id = ${conversationId}))
        order by priority desc, updated_at desc
      `;
      const messages = await db`
        select role, content
        from messages
        where conversation_id = ${conversationId}
        order by created_at desc
        limit ${mode === "full" ? 8 : 3}
      `;
      const memory = await db`
        select label, value
        from memory_entries
        where user_id = ${userId}
        order by created_at desc
        limit 10
      `;

      return {
        systemPrefix: "Stable system prefix: you are a cautious German bookkeeping intake assistant. Ask exactly one next question when needed.",
        fragmentText: fragments.map((fragment) => `# ${fragment.kind}: ${fragment.title}\n${fragment.body_markdown}`).join("\n\n"),
        recentMessages: messages.reverse().map((message) => `${message.role}: ${message.content}`).join("\n"),
        settingsSummary: memory.map((entry) => `${entry.label}: ${entry.value}`).join("\n")
      };
    },

    async saveMemoryFact(userId: string, label: string, value: string): Promise<void> {
      await db`
        insert into memory_entries (id, user_id, label, value)
        values (${crypto.randomUUID()}, ${userId}, ${label}, ${value})
      `;
    }
  };
}
