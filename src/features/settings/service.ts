import type { Database } from "../../infra/db/client.js";

export function createSettingsService(db: Database) {
  return {
    async get(userId: string): Promise<Record<string, string>> {
      const rows = await db`
        select distinct on (label) label, value
        from memory_entries
        where user_id = ${userId}
          and label like 'setting:%'
        order by label, created_at desc
      `;
      return Object.fromEntries(rows.map((row) => [row.label.replace("setting:", ""), row.value]));
    },

    async save(userId: string, settings: Record<string, string>): Promise<void> {
      for (const [key, value] of Object.entries(settings)) {
        await db`
          insert into memory_entries (id, user_id, label, value)
          values (${crypto.randomUUID()}, ${userId}, ${`setting:${key}`}, ${value})
        `;
      }
    }
  };
}
