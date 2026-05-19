-- ─────────────────────────────────────────────────────────────────────────────
-- ETAPA 9 — Isolamento multi-tenant, quotas e proteção operacional
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. dispatch_company_limits ────────────────────────────────────────────────
-- Quotas e habilitação por empresa. Criada com defaults seguros.
create table if not exists public.dispatch_company_limits (
  id                       uuid        primary key default gen_random_uuid(),
  company_id               uuid        not null unique references public.empresas(id) on delete cascade,
  max_active_jobs          integer     not null default 3,
  max_batch_size           integer     not null default 50,
  max_daily_messages       integer     not null default 500,
  max_concurrent_batches   integer     not null default 2,
  max_retries_per_hour     integer     not null default 30,
  enabled                  boolean     not null default true,
  pause_reason             text,
  paused_at                timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.dispatch_company_limits is
  'Quotas e habilitação por empresa para a fila dispatch_jobs. enabled=false suspende todos os jobs.';

-- Constraints para evitar valores absurdos
alter table public.dispatch_company_limits
  drop constraint if exists dcl_max_active_jobs_check,
  drop constraint if exists dcl_max_batch_size_check,
  drop constraint if exists dcl_max_daily_messages_check,
  drop constraint if exists dcl_max_concurrent_batches_check,
  drop constraint if exists dcl_max_retries_per_hour_check;

alter table public.dispatch_company_limits
  add constraint dcl_max_active_jobs_check         check (max_active_jobs between 1 and 20),
  add constraint dcl_max_batch_size_check           check (max_batch_size between 1 and 100),
  add constraint dcl_max_daily_messages_check       check (max_daily_messages between 1 and 100000),
  add constraint dcl_max_concurrent_batches_check   check (max_concurrent_batches between 1 and 10),
  add constraint dcl_max_retries_per_hour_check     check (max_retries_per_hour between 0 and 500);

create index if not exists idx_dcl_company
  on public.dispatch_company_limits(company_id);

create index if not exists idx_dcl_enabled
  on public.dispatch_company_limits(enabled, company_id)
  where enabled = true;

alter table public.dispatch_company_limits enable row level security;

do $$ begin
  create policy "dcl_company_read" on public.dispatch_company_limits
    for select using (
      company_id in (
        select company_id from public.usuarios_empresas where user_id = auth.uid()
      )
      or exists (select 1 from public.system_admins where user_id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "dcl_admin_write" on public.dispatch_company_limits
    for all using (
      exists (select 1 from public.system_admins where user_id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

-- ── 2. dispatch_audit_events ──────────────────────────────────────────────────
-- Eventos de auditoria da fila dispatch_jobs.
create table if not exists public.dispatch_audit_events (
  id          uuid        primary key default gen_random_uuid(),
  company_id  uuid        references public.empresas(id) on delete set null,
  job_id      uuid        references public.dispatch_jobs(id) on delete set null,
  event_type  text        not null,
  payload     jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

comment on table public.dispatch_audit_events is
  'Auditoria de eventos da fila: quota_exceeded, scheduler_pause, stale_worker, provider_unhealthy, tenant_disabled, manual_cancel, retry_exhausted';

-- event_type constraint
alter table public.dispatch_audit_events
  drop constraint if exists dae_event_type_check;

alter table public.dispatch_audit_events
  add constraint dae_event_type_check check (
    event_type in (
      'quota_exceeded',
      'scheduler_pause',
      'stale_worker',
      'provider_unhealthy',
      'tenant_disabled',
      'manual_cancel',
      'retry_exhausted',
      'batch_circuit_break',
      'tenant_paused',
      'tenant_resumed',
      'rate_limit_pause',
      'job_auto_completed',
      'job_auto_failed'
    )
  );

create index if not exists idx_dae_company_event
  on public.dispatch_audit_events(company_id, event_type, created_at desc);

create index if not exists idx_dae_job
  on public.dispatch_audit_events(job_id, created_at desc)
  where job_id is not null;

create index if not exists idx_dae_created
  on public.dispatch_audit_events(created_at desc);

alter table public.dispatch_audit_events enable row level security;

do $$ begin
  create policy "dae_company_read" on public.dispatch_audit_events
    for select using (
      company_id is null
      or company_id in (
        select company_id from public.usuarios_empresas where user_id = auth.uid()
      )
      or exists (select 1 from public.system_admins where user_id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

-- ── 3. dispatch_provider_health ───────────────────────────────────────────────
-- Saúde do provider WhatsApp por empresa, alimentado pelo dispatch.
create table if not exists public.dispatch_provider_health (
  id                      uuid        primary key default gen_random_uuid(),
  company_id              uuid        not null unique references public.empresas(id) on delete cascade,
  last_success_at         timestamptz,
  last_failure_at         timestamptz,
  last_response_ms        integer,
  avg_response_ms         integer,
  consecutive_failures    integer     not null default 0,
  consecutive_rate_limits integer     not null default 0,
  total_success_24h       integer     not null default 0,
  total_error_24h         integer     not null default 0,
  state                   text        not null default 'healthy',
  unhealthy_since         timestamptz,
  updated_at              timestamptz not null default now()
);

comment on table public.dispatch_provider_health is
  'Monitoramento de saúde do provider WhatsApp por empresa para circuit breaker';

alter table public.dispatch_provider_health
  drop constraint if exists dph_state_check;

alter table public.dispatch_provider_health
  add constraint dph_state_check check (
    state in ('healthy', 'degraded', 'unhealthy')
  );

create index if not exists idx_dph_company
  on public.dispatch_provider_health(company_id);

create index if not exists idx_dph_state
  on public.dispatch_provider_health(state, company_id)
  where state != 'healthy';

alter table public.dispatch_provider_health enable row level security;

do $$ begin
  create policy "dph_company_read" on public.dispatch_provider_health
    for select using (
      company_id in (
        select company_id from public.usuarios_empresas where user_id = auth.uid()
      )
      or exists (select 1 from public.system_admins where user_id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

-- ── 4. Housekeeping: índice em dispatch_audit_events para limpeza ─────────────
-- Índice simples em created_at para suportar deleção eficiente de eventos antigos.
-- O scheduler faz DELETE ... WHERE created_at < NOW() - INTERVAL '30 days'.
create index if not exists idx_dae_cleanup
  on public.dispatch_audit_events(created_at);
