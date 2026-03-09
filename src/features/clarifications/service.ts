import type { Database } from "../../infra/db/client.js";

export function createClarificationService(db: Database) {
  return {
    async getOpen(conversationId: string): Promise<{ id: string; recordId: string; fieldName: string; question: string } | null> {
      const rows = await db<{ id: string; recordId: string; fieldName: string; question: string }[]>`
        select id, record_id as "recordId", field_name as "fieldName", question
        from clarification_tasks
        where conversation_id = ${conversationId}
          and status = 'open'
        limit 1
      `;
      return rows[0] ?? null;
    },

    async setNextQuestion(recordId: string, conversationId: string, fieldName: string, question: string): Promise<void> {
      await db`
        update clarification_tasks
        set status = 'closed', answered_at = now()
        where conversation_id = ${conversationId}
          and status = 'open'
      `;
      await db`
        insert into clarification_tasks (id, record_id, conversation_id, field_name, question, status)
        values (${crypto.randomUUID()}, ${recordId}, ${conversationId}, ${fieldName}, ${question}, 'open')
      `;
    },

    async answer(taskId: string, answer: string): Promise<void> {
      const taskRows = await db<{ recordId: string; fieldName: string }[]>`
        select record_id as "recordId", field_name as "fieldName"
        from clarification_tasks
        where id = ${taskId}
      `;
      const task = taskRows[0];
      if (!task) {
        return;
      }
      await db`
        update records
        set attendee = case when ${task.fieldName} = 'attendee' then ${answer} else attendee end,
            missing_fields_json = '[]'::jsonb,
            status = 'ready',
            updated_at = now()
        where id = ${task.recordId}
      `;
      await db`
        update clarification_tasks
        set status = 'answered', answered_at = now()
        where id = ${taskId}
      `;
    }
  };
}
