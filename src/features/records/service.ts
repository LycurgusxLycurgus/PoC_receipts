import type { Database } from "../../infra/db/client.js";
import type { ExtractionResult } from "../../infra/gemini/runtime.js";

export type UploadInput = {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
};

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createRecordService(db: Database) {
  return {
    async createUpload(userId: string, conversationId: string, telegramFileId: string | null, upload: { path: string; sizeBytes: number }, input: UploadInput): Promise<string> {
      const id = newId("upload");
      await db`
        insert into uploads (id, user_id, conversation_id, telegram_file_id, storage_path, mime_type, file_name, size_bytes, status)
        values (${id}, ${userId}, ${conversationId}, ${telegramFileId}, ${upload.path}, ${input.mimeType}, ${input.fileName}, ${upload.sizeBytes}, 'stored')
      `;
      return id;
    },

    async saveDraft(args: {
      tenantId: string;
      userId: string;
      conversationId: string;
      sourceMessageId: string;
      uploadId: string | null;
      extraction: ExtractionResult;
    }): Promise<string> {
      const id = newId("record");
      await db`
        insert into records (
          id, tenant_id, user_id, conversation_id, source_message_id, upload_id, record_type, vendor,
          issue_date, gross_amount, vat_amount, vat_rate, invoice_number, category, attendee, notes,
          deductibility_status, vat_status, missing_fields_json, status
        )
        values (
          ${id}, ${args.tenantId}, ${args.userId}, ${args.conversationId}, ${args.sourceMessageId}, ${args.uploadId},
          ${args.extraction.recordType}, ${args.extraction.vendor}, ${args.extraction.issueDate},
          ${args.extraction.grossAmount}, ${args.extraction.vatAmount}, ${args.extraction.vatRate},
          ${args.extraction.invoiceNumber}, ${args.extraction.category}, ${args.extraction.attendee},
          ${args.extraction.notes}, ${args.extraction.category === "business_meal" ? "70_percent" : null},
          ${args.extraction.vatRate ? "standard" : null},
          ${db.json(args.extraction.missingFields)},
          ${args.extraction.missingFields.length > 0 ? "needs_clarification" : "ready"}
        )
      `;
      return id;
    },

    async listMonth(userId: string, month: string): Promise<Array<Record<string, unknown>>> {
      const rows = await db`
        select id, vendor, record_type, issue_date, gross_amount, vat_rate, category, status, missing_fields_json
        from records
        where user_id = ${userId}
          and to_char(created_at at time zone 'UTC', 'YYYY-MM') = ${month}
        order by created_at desc
      `;
      return rows;
    }
  };
}
