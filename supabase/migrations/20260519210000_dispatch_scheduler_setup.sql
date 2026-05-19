-- ─────────────────────────────────────────────────────────────────────────────
-- ETAPA 8 — Scheduler automático da fila dispatch_jobs
-- Adiciona health tracking, logs de scheduler e pg_cron
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Colunas de health em dispatch_jobs ─────────────────────────────────────
alter table public.dispatch_jobs
  add column if not exists heartbeat_at        timestamptz,
  add column if not exists last_batch_at       timestamptz,
  add column if not exists worker_version      text,
  add column if not exists stopped_reason      text,
  add column if not exists scheduler_runs      integer not null default 0;

comment on column public.dispatch_jobs.heartbeat_at    is 'Ultimo heartbeat do worker — jobs running sem update há 2+ min são marcados stale';
comment on column public.dispatch_jobs.last_batch_at   is 'Timestamp do ultimo batch executado pelo scheduler';
comment on column public.dispatch_jobs.worker_version  is 'Versao do scheduler que processou o job';
comment on column public.dispatch_jobs.stopped_reason  is 'Razao pela qual o job foi pausado/falhado: stale_worker, rate_limited, soft_time_budget, no_items, completed, cancelled';
comment on column public.dispatch_jobs.scheduler_runs  is 'Quantas vezes o scheduler executou um batch para este job';

-- index para busca eficiente de jobs elegíveis
create index if not exists idx_dispatch_jobs_eligible
  on public.dispatch_jobs(status, updated_at desc)
  where status in ('pending', 'running', 'paused');

create index if not exists idx_dispatch_jobs_stale
  on public.dispatch_jobs(status, heartbeat_at)
  where status = 'running';

-- ── 2. Tabela de logs do scheduler ────────────────────────────────────────────
create table if not exists public.dispatch_scheduler_logs (
  id                 uuid        primary key default gen_random_uuid(),
  tick_at            timestamptz not null default now(),
  scheduler_version  text,
  jobs_found         integer     not null default 0,
  jobs_processed     integer     not null default 0,
  batches_run        integer     not null default 0,
  stale_recovered    integer     not null default 0,
  auto_completed     integer     not null default 0,
  total_success      integer     not null default 0,
  total_error        integer     not null default 0,
  total_ignored      integer     not null default 0,
  duration_ms        integer,
  error_message      text,
  created_at         timestamptz not null default now()
);

comment on table public.dispatch_scheduler_logs is
  'Registro de cada tick do scheduler automático de dispatch_jobs';

create index if not exists idx_dsl_tick_at
  on public.dispatch_scheduler_logs(tick_at desc);

-- Manter somente últimos 7 dias de logs (housekeeping via exclusão manual ou cron)
-- A remoção automática será feita pelo scheduler durante cada tick

alter table public.dispatch_scheduler_logs enable row level security;

-- Somente admins visualizam logs do scheduler
do $$ begin
  create policy "dsl_admin_read" on public.dispatch_scheduler_logs
    for select using (
      exists (
        select 1 from public.system_admins sa
        where sa.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

-- ── 3. pg_cron: chamada automática a cada 1 minuto ────────────────────────────
-- Requer pg_cron e pg_net. Executar apenas se ambos estiverem disponíveis.
--
-- ATENÇÃO: Substituir ${SUPABASE_URL} e ${BILLING_CRON_SECRET} pelos valores
-- reais antes de aplicar esta migration em produção.
--
-- Para ativar o cron job após configurar as variáveis de ambiente:
--
--   select cron.schedule(
--     'dispatch-scheduler-tick',
--     '* * * * *',
--     $$
--       select net.http_post(
--         url        := 'https://SEU-PROJETO.supabase.co/functions/v1/dispatch-scheduler',
--         headers    := '{"Content-Type":"application/json","x-cron-secret":"SEU_BILLING_CRON_SECRET"}'::jsonb,
--         body       := '{}'::jsonb
--       );
--     $$
--   );
--
-- Para verificar o status:
--   select * from cron.job;
--
-- Para remover:
--   select cron.unschedule('dispatch-scheduler-tick');
-- ─────────────────────────────────────────────────────────────────────────────
