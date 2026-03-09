import { GoogleGenAI, Type } from "@google/genai";
import type { Env } from "../config/env.js";
import type { ComposedContext } from "../../features/agent-context/compose-context.js";
import type { UploadInput } from "../../features/records/service.js";

export type ExtractionResult = {
  recordType: "receipt" | "invoice";
  vendor: string | null;
  issueDate: string | null;
  grossAmount: number | null;
  vatAmount: number | null;
  vatRate: number | null;
  invoiceNumber: string | null;
  category: string | null;
  attendee: string | null;
  notes: string | null;
  missingFields: string[];
  assistantMessage: string;
};

export function createGeminiRuntime(env: Env) {
  const client = env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) : null;

  return {
    async extractRecord(context: ComposedContext, upload: UploadInput | null, textHint: string): Promise<ExtractionResult> {
      if (!client || !upload) {
        return heuristicExtraction(textHint, upload?.mimeType);
      }

      try {
        const response = await client.models.generateContent({
          model: env.GEMINI_MODEL,
          contents: [{
            role: "user",
            parts: [
              { text: buildPrompt(context, textHint) },
              {
                inlineData: {
                  mimeType: upload.mimeType,
                  data: Buffer.from(upload.bytes).toString("base64")
                }
              }
            ]
          }],
          config: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                recordType: { type: Type.STRING },
                vendor: { type: Type.STRING, nullable: true },
                issueDate: { type: Type.STRING, nullable: true },
                grossAmount: { type: Type.NUMBER, nullable: true },
                vatAmount: { type: Type.NUMBER, nullable: true },
                vatRate: { type: Type.NUMBER, nullable: true },
                invoiceNumber: { type: Type.STRING, nullable: true },
                category: { type: Type.STRING, nullable: true },
                attendee: { type: Type.STRING, nullable: true },
                notes: { type: Type.STRING, nullable: true },
                missingFields: { type: Type.ARRAY, items: { type: Type.STRING } },
                assistantMessage: { type: Type.STRING }
              },
              required: ["recordType", "missingFields", "assistantMessage"]
            }
          }
        });

        const parsed = JSON.parse(response.text ?? "{}") as Partial<ExtractionResult>;
        return {
          recordType: parsed.recordType === "invoice" ? "invoice" : "receipt",
          vendor: parsed.vendor ?? null,
          issueDate: parsed.issueDate ?? null,
          grossAmount: parsed.grossAmount ?? null,
          vatAmount: parsed.vatAmount ?? null,
          vatRate: parsed.vatRate ?? null,
          invoiceNumber: parsed.invoiceNumber ?? null,
          category: parsed.category ?? null,
          attendee: parsed.attendee ?? null,
          notes: parsed.notes ?? null,
          missingFields: parsed.missingFields ?? [],
          assistantMessage: parsed.assistantMessage ?? "Saved your document draft."
        };
      } catch {
        return heuristicExtraction(textHint, upload?.mimeType);
      }
    }
  };
}

function buildPrompt(context: ComposedContext, textHint: string): string {
  return [
    context.systemPrefix,
    context.fragmentText,
    `Recent messages:\n${context.recentMessages}`,
    `Settings:\n${context.settingsSummary}`,
    `Incoming message hint:\n${textHint}`,
    "Extract bookkeeping fields for a German freelancer or small business. Ask exactly one next question only if needed."
  ].join("\n\n");
}

function heuristicExtraction(textHint: string, mimeType = "application/octet-stream"): ExtractionResult {
  const lowered = textHint.toLowerCase();
  const restaurant = ["restaurant", "vapiano", "cafe", "meal", "lunch", "dinner"].some((token) => lowered.includes(token));
  const amountMatch = textHint.match(/(\d+[,.]\d{2})/);
  const grossAmount = amountMatch?.[1] ? Number(amountMatch[1].replace(",", ".")) : null;
  const recordType = mimeType.includes("pdf") ? "invoice" : "receipt";
  const missingFields = restaurant ? ["attendee"] : [];

  return {
    recordType,
    vendor: restaurant ? "Restaurant receipt" : mimeType.includes("pdf") ? "Invoice document" : "Receipt upload",
    issueDate: null,
    grossAmount,
    vatAmount: null,
    vatRate: restaurant ? 19 : null,
    invoiceNumber: null,
    category: restaurant ? "business_meal" : recordType,
    attendee: null,
    notes: null,
    missingFields,
    assistantMessage: restaurant
      ? `Got the restaurant receipt${grossAmount ? ` (${grossAmount.toFixed(2)} EUR)` : ""}. Who was the client or attendee?`
      : "I saved a draft and may need one clarification after parsing."
  };
}
