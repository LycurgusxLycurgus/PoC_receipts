import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Env } from "../infra/config/env.js";
import type { Database } from "../infra/db/client.js";
import { createLoginToken, hashSessionToken, parseLoginToken, verifyTelegramWebhookSecret } from "../infra/auth/telegram-auth.js";
import type { Logger } from "../infra/logger/logger.js";
import { page, escapeHtml } from "../shared/html.js";
import { AppError } from "../shared/errors.js";
import { telegramUpdateSchema, normalizeUpdate } from "../features/telegram/contract.js";
import { createTelegramApi } from "../features/telegram/telegram-api.js";
import { createConversationService } from "../features/conversations/service.js";
import { createContextService } from "../features/agent-context/compose-context.js";
import { createOnboardingService } from "../features/onboarding/service.js";
import { createClarificationService } from "../features/clarifications/service.js";
import { createRecordService } from "../features/records/service.js";
import { createExportService } from "../features/exports/service.js";
import { createSettingsService } from "../features/settings/service.js";
import { createStorage } from "../infra/storage/storage.js";
import { createGeminiRuntime } from "../infra/gemini/runtime.js";
import { createTelegramService } from "../features/telegram/service.js";

export type ReturnTypeOfFactories = ReturnType<typeof buildServices>;

export function buildServices(env: Env, db: Database, logger: Logger) {
  const telegramApi = createTelegramApi(env);
  const conversations = createConversationService(db);
  const context = createContextService(db);
  const onboarding = createOnboardingService(db);
  const clarifications = createClarificationService(db);
  const records = createRecordService(db);
  const exportsService = createExportService(db);
  const settings = createSettingsService(db);
  const storage = createStorage(env);
  const gemini = createGeminiRuntime(env);

  const auth = {
    createLoginToken(userId: string) {
      return createLoginToken(userId, env);
    },
    hashSessionToken
  };

  return {
    env,
    db,
    logger,
    telegramApi,
    conversations,
    context,
    onboarding,
    clarifications,
    records,
    exports: exportsService,
    settings,
    storage,
    gemini,
    auth
  };
}

export async function registerRoutes(app: FastifyInstance, env: Env, db: Database, logger: Logger): Promise<void> {
  const services = buildServices(env, db, logger);
  const telegram = createTelegramService(services, logger);

  app.get("/", async (_request, reply) => {
    reply.type("text/html").send(page("Receipt Assistant", `
      <section class="hero">
        <h1>Receipt Assistant PoC</h1>
        <p class="muted">Telegram-first bookkeeping intake for Germany.</p>
      </section>
      <section class="panel">
        <p>Use Telegram <code>/start</code> to onboard and <code>/login</code> to receive a web inbox link.</p>
      </section>
    `));
  });

  app.post("/webhooks/telegram/:secret", async (request, reply) => {
    const secretParam = z.object({ secret: z.string() }).parse(request.params);
    if (secretParam.secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      throw new AppError(401, "UNAUTHORIZED", "Invalid webhook path secret");
    }
    verifyTelegramWebhookSecret(request.headers["x-telegram-bot-api-secret-token"] as string | undefined, env.TELEGRAM_WEBHOOK_SECRET);
    const update = telegramUpdateSchema.parse(request.body);
    const inbound = normalizeUpdate(update);
    const message = await telegram.handleInbound(inbound);
    reply.send({ status: "ok", message });
  });

  app.get("/auth/telegram", async (request, reply) => {
    const query = z.object({ token: z.string() }).parse(request.query);
    const parsed = parseLoginToken(query.token, env);
    const sessionToken = crypto.randomUUID();
    const tokenHash = hashSessionToken(sessionToken);
    await db`
      insert into web_sessions (id, user_id, token_hash, expires_at)
      values (${crypto.randomUUID()}, ${parsed.userId}, ${tokenHash}, now() + interval '7 days')
    `;
    reply.header("set-cookie", `receipt_session=${sessionToken}; HttpOnly; Path=/; SameSite=Lax`);
    reply.redirect("/app/inbox");
  });

  app.get("/app/inbox", async (request, reply) => {
    const userId = await requireUserId(request, db);
    const month = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(request.query).month ?? new Date().toISOString().slice(0, 7);
    const rows = await services.records.listMonth(userId, month);
    const summary = await services.settings.get(userId);

    const body = `
      ${nav()}
      <section class="hero">
        <h1>Inbox / Month View</h1>
        <p class="muted">Month: ${escapeHtml(month)}</p>
      </section>
      <section class="grid two">
        <div class="panel">
          <div class="stat">${rows.length}</div>
          <div class="muted">records this month</div>
        </div>
        <div class="panel">
          <div class="stat">${escapeHtml(summary.business_type ?? "unknown")}</div>
          <div class="muted">business type</div>
        </div>
      </section>
      <section class="panel" style="margin-top:16px;">
        <table>
          <thead>
            <tr><th>Vendor</th><th>Type</th><th>Date</th><th>Amount</th><th>VAT</th><th>Category</th><th>Status</th><th>Missing</th></tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(String(row.vendor ?? ""))}</td>
                <td>${escapeHtml(String(row.record_type ?? ""))}</td>
                <td>${escapeHtml(String(row.issue_date ?? ""))}</td>
                <td>${escapeHtml(String(row.gross_amount ?? ""))}</td>
                <td>${escapeHtml(String(row.vat_rate ?? ""))}</td>
                <td>${escapeHtml(String(row.category ?? ""))}</td>
                <td><span class="badge ${escapeHtml(String(row.status ?? ""))}">${escapeHtml(String(row.status ?? ""))}</span></td>
                <td>${escapeHtml(JSON.stringify(row.missing_fields_json ?? []))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    `;
    reply.type("text/html").send(page("Inbox", body));
  });

  app.get("/app/settings", async (request, reply) => {
    const userId = await requireUserId(request, db);
    const settings = await services.settings.get(userId);
    const body = `
      ${nav()}
      <section class="hero">
        <h1>Settings</h1>
        <p class="muted">These values shape later prompt assembly and classification.</p>
      </section>
      <section class="panel">
        <form method="post" action="/app/settings">
          <label>Business type <input name="business_type" value="${escapeHtml(settings.business_type ?? "")}" /></label>
          <label>Work type <input name="work_type" value="${escapeHtml(settings.work_type ?? "")}" /></label>
          <label>Travel frequency <input name="travel_frequency" value="${escapeHtml(settings.travel_frequency ?? "")}" /></label>
          <label>Has accountant <input name="has_accountant" value="${escapeHtml(settings.has_accountant ?? "")}" /></label>
          <label>Language <input name="language" value="${escapeHtml(settings.language ?? "")}" /></label>
          <label>Default VAT assumptions <input name="default_vat" value="${escapeHtml(settings.default_vat ?? "")}" /></label>
          <label>Export preferences <input name="export_preferences" value="${escapeHtml(settings.export_preferences ?? "")}" /></label>
          <button type="submit">Save settings</button>
        </form>
      </section>
    `;
    reply.type("text/html").send(page("Settings", body));
  });

  app.post("/app/settings", async (request, reply) => {
    const userId = await requireUserId(request, db);
    const body = await parseFormBody(request);
    await services.settings.save(userId, body);
    reply.redirect("/app/settings");
  });

  app.get("/app/exports", async (request, reply) => {
    const userId = await requireUserId(request, db);
    const month = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(request.query).month ?? new Date().toISOString().slice(0, 7);
    const body = `
      ${nav()}
      <section class="hero">
        <h1>Exports</h1>
        <p class="muted">Download monthly CSV for your Steuerberater.</p>
      </section>
      <section class="panel">
        <form method="post" action="/app/exports">
          <label>Month <input name="month" value="${escapeHtml(month)}" /></label>
          <button type="submit">Create CSV export</button>
        </form>
      </section>
    `;
    reply.type("text/html").send(page("Exports", body));
  });

  app.post("/app/exports", async (request, reply) => {
    const userId = await requireUserId(request, db);
    const body = await parseFormBody(request);
    const month = body.month ?? new Date().toISOString().slice(0, 7);
    const file = await services.exports.createMonthlyCsv(userId, month);
    reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename=${file.fileName}`)
      .send(file.content);
  });
}

async function requireUserId(request: FastifyRequest, db: Database): Promise<string> {
  const cookies = Object.fromEntries(String(request.headers.cookie ?? "").split(";").filter(Boolean).map((part) => {
    const [key, value] = part.trim().split("=");
    return [key, value];
  }));
  const sessionToken = cookies.receipt_session;
  if (!sessionToken) {
    throw new AppError(401, "UNAUTHORIZED", "Missing session");
  }
  const rows = await db`
    select user_id
    from web_sessions
    where token_hash = ${hashSessionToken(sessionToken)}
      and expires_at > now()
    limit 1
  `;
  if (!rows[0]) {
    throw new AppError(401, "UNAUTHORIZED", "Session expired");
  }
  return rows[0].user_id;
}

async function parseFormBody(request: FastifyRequest): Promise<Record<string, string>> {
  const raw = request.body;
  if (!raw || typeof raw !== "string") {
    return {};
  }
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

function nav(): string {
  return `<nav>
    <a href="/app/inbox">Inbox</a>
    <a href="/app/settings">Settings</a>
    <a href="/app/exports">Exports</a>
  </nav>`;
}
