import type { Database } from "./client.js";

export async function runMigrations(db: Database): Promise<void> {
  await db.begin(async () => {
    await db.unsafe(`
      create table if not exists tenants (
        id text primary key,
        name text not null,
        created_at timestamptz not null default now()
      );

      create table if not exists users (
        id text primary key,
        tenant_id text not null references tenants(id),
        telegram_user_id bigint unique,
        first_name text,
        last_name text,
        username text,
        language_code text,
        created_at timestamptz not null default now()
      );

      create table if not exists telegram_bindings (
        id text primary key,
        tenant_id text not null references tenants(id),
        user_id text not null references users(id),
        chat_id bigint not null unique,
        created_at timestamptz not null default now()
      );

      create table if not exists conversations (
        id text primary key,
        tenant_id text not null references tenants(id),
        user_id text not null references users(id),
        chat_id bigint not null unique,
        state_json jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists messages (
        id text primary key,
        conversation_id text not null references conversations(id),
        role text not null,
        external_id text,
        content text not null,
        raw_json jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      create unique index if not exists messages_external_id_idx on messages(external_id) where external_id is not null;

      create table if not exists context_fragments (
        id text primary key,
        scope_type text not null,
        scope_id text,
        kind text not null,
        title text not null,
        body_markdown text not null,
        priority integer not null default 0,
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists memory_entries (
        id text primary key,
        user_id text not null references users(id),
        label text not null,
        value text not null,
        created_at timestamptz not null default now()
      );

      create table if not exists uploads (
        id text primary key,
        user_id text not null references users(id),
        conversation_id text not null references conversations(id),
        telegram_file_id text,
        storage_path text not null,
        mime_type text not null,
        file_name text,
        size_bytes integer not null default 0,
        status text not null,
        created_at timestamptz not null default now()
      );

      create table if not exists records (
        id text primary key,
        tenant_id text not null references tenants(id),
        user_id text not null references users(id),
        conversation_id text not null references conversations(id),
        source_message_id text not null references messages(id),
        upload_id text references uploads(id),
        record_type text not null,
        vendor text,
        issue_date date,
        gross_amount numeric(12, 2),
        net_amount numeric(12, 2),
        vat_amount numeric(12, 2),
        vat_rate numeric(5, 2),
        invoice_number text,
        origin text,
        destination text,
        purpose text,
        business_use text,
        category text,
        client_project text,
        attendee text,
        recurring boolean,
        reimbursable boolean,
        notes text,
        suggested_category text,
        deductibility_status text,
        vat_status text,
        missing_fields_json jsonb not null default '[]'::jsonb,
        review_flag boolean not null default false,
        status text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists clarification_tasks (
        id text primary key,
        record_id text not null references records(id),
        conversation_id text not null references conversations(id),
        field_name text not null,
        question text not null,
        status text not null,
        created_at timestamptz not null default now(),
        answered_at timestamptz
      );
      create unique index if not exists clarification_open_idx on clarification_tasks(conversation_id) where status = 'open';

      create table if not exists audit_events (
        id text primary key,
        tenant_id text,
        user_id text,
        conversation_id text,
        event_type text not null,
        external_id text,
        payload_json jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      create unique index if not exists audit_external_id_idx on audit_events(external_id) where external_id is not null;

      create table if not exists exports (
        id text primary key,
        user_id text not null references users(id),
        month text not null,
        format text not null,
        file_name text not null,
        content text not null,
        created_at timestamptz not null default now()
      );

      create table if not exists web_sessions (
        id text primary key,
        user_id text not null references users(id),
        token_hash text not null unique,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      );
    `);

    await db`
      insert into tenants (id, name)
      values ('tenant-default', 'Default Tenant')
      on conflict (id) do nothing
    `;

    await db`
      insert into context_fragments (id, scope_type, scope_id, kind, title, body_markdown, priority, active)
      values
        ('fragment-global-agents', 'global', null, 'AGENTS', 'Base policy',
         'You are a German bookkeeping intake assistant. Ask exactly one next question when data is missing. Never invent tax certainty. Summaries must be concise.', 10, true),
        ('fragment-global-tools', 'global', null, 'TOOLS', 'Allowed tools',
         'Tools: save_onboarding_answer, save_record_draft, set_next_question, finalize_record, save_memory_fact, create_export.', 9, true)
      on conflict (id) do nothing
    `;
  });
}
