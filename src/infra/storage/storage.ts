import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Env } from "../config/env.js";

export type StoredUpload = {
  path: string;
  sizeBytes: number;
};

export function createStorage(env: Env) {
  return {
    async save(userId: string, fileName: string, data: Uint8Array): Promise<StoredUpload> {
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const relativePath = join(userId, `${Date.now()}-${safeName}`);
      const absolutePath = join(env.STORAGE_ROOT, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, data);
      return {
        path: relativePath.replaceAll("\\", "/"),
        sizeBytes: data.byteLength
      };
    }
  };
}
