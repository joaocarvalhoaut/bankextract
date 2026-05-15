-- ─────────────────────────────────────────────────────────────────────────────
-- Hardening Final: forensic audit, queue management, PDF validation metadata
-- All changes are additive (ADD COLUMN IF NOT EXISTS / CREATE IF NOT EXISTS)
-- Safe to run on existing data — no destructive operations
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Forensic audit trail for automation dispatches ────────────────────────
create table if not exists public.automation_audit_logs (
  id                   uuid        primary key default gen_random_uuid(),
  company_id           uuid        not null,
  request_id           text,
  correlation_id       text,
  action               text        not null,
  registro_id          uuid,
  charge_id            text,
  telefone             text,
  boleto_file_id       text,
  boleto_score         numeric,
  boleto_strategy      text,
  boleto_second_score  numeric,
  template_used        text,
  pdf_hash             text,
  zapi_status          text,
  provider_message_id  text,
  request_payload      jsonb,
  response_payload     jsonb,
  duration_ms          integer,
  blocked_reason       text,
  ocr_used             boolean     not null default false,
  ocr_source           text,
  pdf_validation_reason text,
  user_id              uuid,
  created_at           timestamptz not null default now()
);

alter table public.automation_audit_logs
  add column if not exists company_id            uuid,
  add column if not exists request_id            text,
  add column if not exists correlation_id        text,
  add column if not exists action                text,
  add column if not exists registro_id           uuid,
  add column if not exists charge_id             text,
  add column if not exists telefone              text,
  add column if not exists boleto_file_id        text,
  add column if not exists boleto_score          numeric,
  add column if not exists boleto_strategy       text,
  add column if not exists boleto_second_score   numeric,
  add column if not exists template_used         text,
  add column if not exists pdf_hash              text,
  add column if not exists zapi_status           text,
  add column if not exists provider_message_id   text,
  add column if not exists request_payload       jsonb,
  add column if not exists response_payload      jsonb,
  add column if not exists duration_ms           integer,
  add column if not exists blocked_reason        text,
  add column if not exists ocr_used              boolean     not null default false,
  add column if not exists ocr_source            text,
  add column if not exists pdf_validation_reason text,
  add column if not exists user_id               uuid,
  add column if not exists created_at            timestamptz not null default now();

create index if not exists idx_aal_company_created
  on public.automation_audit_logs(company_id, created_at desc);

create index if not exists idx_aal_registro
  on public.automation_audit_logs(registro_id)
  where registro_id is not null;

create index if not exists idx_aal_action
  on public.automation_audit_logs(action, company_id);

comment on table public.automation_audit_logs is
  'Forensic audit trail: every boleto match decision, block, OCR usage, and Z-API send recorded here';

-- RLS: only service role can write; users can read their own company
alter table public.automation_audit_logs enable row level security;

do $$ begin
  create policy "aal_company_read" on public.automation_audit_logs
    for select using (
      company_id in (
        select company_id from public.usuarios_empresas where user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

-- ── 2. Queue / retry management on automation_dispatches ─────────────────────
alter table public.automation_dispatches
  add column if not exists queue_status        text        not null default 'pending',
  add column if not exists next_retry_at       timestamptz,
  add column if not exists last_error          text,
  add column if not exists retry_count         integer     not null default 0,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_by       text,
  add column if not exists circuit_open        boolean     not null default false;

create index if not exists idx_ad_next_retry
  on public.automation_dispatches(company_id, next_retry_at)
  where next_retry_at is not null and queue_status = 'retrying';

-- ── 3. PDF validation and OCR metadata on registros_financeiros ───────────────
alter table public.registros_financeiros
  add column if not exists pdf_validation_reason text,
  add column if not exists boleto_ocr_used       boolean not null default false,
  add column if not exists boleto_ocr_source     text;

comment on column public.registros_financeiros.pdf_validation_reason is
  'Reason PDF was rejected or accepted: empty, invalid_header, no_eof, truncated, ok';
comment on column public.registros_financeiros.boleto_ocr_used is
  'Whether Google Vision OCR was used to extract text from this boleto';
comment on column public.registros_financeiros.boleto_ocr_source is
  'OCR source: google_vision or tesseract';

-- ── 4. Live search score blocking — track last live search result ─────────────
alter table public.registros_financeiros
  add column if not exists live_search_score       numeric,
  add column if not exists live_search_strategy    text,
  add column if not exists live_search_blocked_at  timestamptz,
  add column if not exists live_search_block_reason text;

-- ── 5. Circuit breaker state per company (Z-API health) ──────────────────────
create table if not exists public.zapi_circuit_state (
  company_id            uuid        primary key,
  consecutive_failures  integer     not null default 0,
  circuit_open          boolean     not null default false,
  circuit_opened_at     timestamptz,
  last_failure_at       timestamptz,
  last_success_at       timestamptz,
  updated_at            timestamptz not null default now()
);

alter table public.zapi_circuit_state
  add column if not exists consecutive_failures integer     not null default 0,
  add column if not exists circuit_open         boolean     not null default false,
  add column if not exists circuit_opened_at    timestamptz,
  add column if not exists last_failure_at      timestamptz,
  add column if not exists last_success_at      timestamptz,
  add column if not exists updated_at           timestamptz not null default now();

comment on table public.zapi_circuit_state is
  'Per-company Z-API circuit breaker state: opens after 3 consecutive failures';

alter table public.zapi_circuit_state enable row level security;

do $$ begin
  create policy "zcs_service_role_all" on public.zapi_circuit_state
    for all using (true) with check (true);
exception when duplicate_object then null;
end $$;
