import Fastify from "fastify";
import { readEnv } from "../infra/config/env.js";
import { createDb } from "../infra/db/client.js";
import { runMigrations } from "../infra/db/migrate.js";
import { createLogger } from "../infra/logger/logger.js";
import { errorBody, AppError } from "../shared/errors.js";
import { registerRoutes } from "./routes.js";

const env = readEnv();
const logger = createLogger();
const db = createDb(env);
const app = Fastify({
  logger: false,
  bodyLimit: 25 * 1024 * 1024
});

app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
  done(null, body);
});

app.setErrorHandler((error, _request, reply) => {
  const body = errorBody(error);
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  logger.error("request.failed", {
    statusCode,
    code: body.code,
    message: body.message,
    error
  });
  reply.status(statusCode).send(body);
});

async function start(): Promise<void> {
  await runMigrations(db);
  await registerRoutes(app, env, db, logger);
  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info("server.started", { host: env.HOST, port: env.PORT });
}

start().catch((error) => {
  logger.error("server.crashed", { message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
