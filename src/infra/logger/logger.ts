export type Logger = ReturnType<typeof createLogger>;

export function createLogger() {
  return {
    info(event: string, payload: Record<string, unknown> = {}) {
      console.log(JSON.stringify({ level: "info", event, ...normalizePayload(payload) }));
    },
    error(event: string, payload: Record<string, unknown> = {}) {
      console.error(JSON.stringify({ level: "error", event, ...normalizePayload(payload) }));
    }
  };
}

function normalizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, normalizeValue(value)])
  );
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  return value;
}
