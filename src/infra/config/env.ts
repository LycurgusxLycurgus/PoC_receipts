import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.1-flash-lite-preview"),
  GEMINI_FALLBACK_MODEL: z.string().default("gemini-2.5-flash"),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  AUTH_TOKEN_SECRET: z.string().min(1),
  STORAGE_ROOT: z.string().default(".data/uploads")
});

export type Env = z.infer<typeof envSchema>;

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  loadDotEnv(".env", source);
  const env = envSchema.parse(source);
  validateDatabaseUrl(env.DATABASE_URL);
  return env;
}

function loadDotEnv(filePath: string, target: NodeJS.ProcessEnv): void {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || target[key] !== undefined) {
      continue;
    }

    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const normalizedValue =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;

    target[key] = normalizedValue;
  }
}

function validateDatabaseUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }

  if (!parsed.hostname) {
    throw new Error("DATABASE_URL is missing a hostname");
  }

  if (parsed.hash) {
    throw new Error(
      "DATABASE_URL contains an unescaped # in the password. URL-encode special characters in the password segment."
    );
  }

  if (parsed.hostname === "postgres" && parsed.hash) {
    throw new Error(
      "DATABASE_URL is malformed. If your password contains #, %, @, or :, encode it with encodeURIComponent before inserting it into the URL."
    );
  }
}
