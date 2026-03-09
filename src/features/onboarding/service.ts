import type { Database } from "../../infra/db/client.js";

const questions = [
  {
    label: "setting:business_type",
    prompt: "Hallo! Quick setup: Are you a Freelancer or a GmbH?"
  },
  {
    label: "setting:meals_frequency",
    prompt: "Do you often take clients out for meals? (Yes/No)"
  }
];

export function createOnboardingService(db: Database) {
  return {
    async getNextQuestion(userId: string): Promise<string | null> {
      for (const question of questions) {
        const existing = await db`
          select 1
          from memory_entries
          where user_id = ${userId}
            and label = ${question.label}
          limit 1
        `;
        if (!existing[0]) {
          return question.prompt;
        }
      }
      return null;
    },

    async saveAnswer(userId: string, answer: string): Promise<string | null> {
      for (const question of questions) {
        const existing = await db`
          select 1
          from memory_entries
          where user_id = ${userId}
            and label = ${question.label}
          limit 1
        `;
        if (!existing[0]) {
          await db`
            insert into memory_entries (id, user_id, label, value)
            values (${crypto.randomUUID()}, ${userId}, ${question.label}, ${answer})
          `;
          return this.getNextQuestion(userId);
        }
      }
      return null;
    }
  };
}
