import type { Database } from "../../infra/db/client.js";
import { newId } from "../records/service.js";

export function createExportService(db: Database) {
  return {
    async createMonthlyCsv(userId: string, month: string): Promise<{ fileName: string; content: string }> {
      const rows = await db`
        select vendor, record_type, issue_date, gross_amount, vat_rate, category, status
        from records
        where user_id = ${userId}
          and to_char(created_at at time zone 'UTC', 'YYYY-MM') = ${month}
        order by created_at asc
      `;

      const header = ["vendor", "record_type", "issue_date", "gross_amount", "vat_rate", "category", "status"];
      const lines = [
        header.join(","),
        ...rows.map((row) => header.map((key) => csvValue(String(row[key] ?? ""))).join(","))
      ];
      const content = lines.join("\n");
      const fileName = `receipt-export-${month}.csv`;

      await db`
        insert into exports (id, user_id, month, format, file_name, content)
        values (${newId("export")}, ${userId}, ${month}, 'csv', ${fileName}, ${content})
      `;

      return { fileName, content };
    }
  };
}

function csvValue(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
