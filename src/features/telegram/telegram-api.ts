import type { Env } from "../../infra/config/env.js";
import { AppError } from "../../shared/errors.js";

export type TelegramFile = {
  filePath: string;
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
};

export function createTelegramApi(env: Env) {
  const base = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

  return {
    async sendMessage(chatId: number, text: string): Promise<void> {
      const response = await fetch(`${base}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text })
      });
      if (!response.ok) {
        throw new AppError(502, "TELEGRAM_SEND_FAILED", "Failed to send Telegram message");
      }
    },

    async getFile(fileId: string): Promise<TelegramFile> {
      const metaResponse = await fetch(`${base}/getFile?file_id=${encodeURIComponent(fileId)}`);
      if (!metaResponse.ok) {
        throw new AppError(502, "TELEGRAM_FILE_FAILED", "Failed to fetch Telegram file metadata");
      }
      const metaJson = await metaResponse.json() as { result?: { file_path?: string; file_size?: number } };
      const filePath = metaJson.result?.file_path;
      if (!filePath) {
        throw new AppError(400, "TELEGRAM_FILE_MISSING", "Telegram file path not found");
      }

      const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) {
        throw new AppError(502, "TELEGRAM_FILE_DOWNLOAD_FAILED", "Failed to download Telegram file");
      }

      const arrayBuffer = await fileResponse.arrayBuffer();
      const fileName = filePath.split("/").at(-1) ?? "upload.bin";
      return {
        filePath,
        bytes: new Uint8Array(arrayBuffer),
        mimeType: detectMimeType(fileName),
        fileName,
        sizeBytes: metaJson.result?.file_size ?? arrayBuffer.byteLength
      };
    }
  };
}

function detectMimeType(fileName: string): string {
  const lowered = fileName.toLowerCase();
  if (lowered.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lowered.endsWith(".jpg") || lowered.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowered.endsWith(".png")) {
    return "image/png";
  }
  return "application/octet-stream";
}
