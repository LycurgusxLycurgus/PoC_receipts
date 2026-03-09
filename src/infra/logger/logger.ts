export type Logger = ReturnType<typeof createLogger>;

export function createLogger() {
  return {
    info(event: string, payload: Record<string, unknown> = {}) {
      console.log(JSON.stringify({ level: "info", event, ...payload }));
    },
    error(event: string, payload: Record<string, unknown> = {}) {
      console.error(JSON.stringify({ level: "error", event, ...payload }));
    }
  };
}
