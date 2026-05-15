create table if not exists public.automation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid null,
  module text not null,
  action text not null,
  status text not null default 'ok',
  entity text null,
  entity_id text null,
  request_id text null,
  correlation_id text null,
  message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.automation_audit_logs
  drop constraint if exists automation_audit_logs_status_check;

alter table public.automation_audit_logs
  add constraint automation_audit_logs_status_check
  check (status in ('ok', 'warning', 'error', 'processing', 'skipped'));

create index if not exists idx_automation_audit_logs_company_created_at
  on public.automation_audit_logs(company_id, created_at desc);
create index if not exists idx_automation_audit_logs_status
  on public.automation_audit_logs(status);
create index if not exists idx_automation_audit_logs_request_id
  on public.automation_audit_logs(request_id);
create index if not exists idx_automation_audit_logs_correlation_id
  on public.automation_audit_logs(correlation_id);

alter table public.automation_audit_logs enable row level security;

drop policy if exists "automation_audit_logs_select_access" on public.automation_audit_logs;
drop policy if exists "automation_audit_logs_insert_access" on public.automation_audit_logs;
drop policy if exists "automation_audit_logs_update_access" on public.automation_audit_logs;
drop policy if exists "automation_audit_logs_delete_access" on public.automation_audit_logs;

create policy "automation_audit_logs_select_access"
on public.automation_audit_logs
for select
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.company_id = automation_audit_logs.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "automation_audit_logs_insert_access"
on public.automation_audit_logs
for insert
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.company_id = automation_audit_logs.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "automation_audit_logs_update_access"
on public.automation_audit_logs
for update
using (
  exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "automation_audit_logs_delete_access"
on public.automation_audit_logs
for delete
using (
  exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create table if not exists public.zapi_circuit_state (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  provider text not null default 'zapi',
  state text not null default 'closed',
  failure_count integer not null default 0,
  success_count integer not null default 0,
  last_error text null,
  request_id text null,
  correlation_id text null,
  opened_at timestamptz null,
  retry_after timestamptz null,
  last_failure_at timestamptz null,
  last_success_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.zapi_circuit_state
  drop constraint if exists zapi_circuit_state_state_check;

alter table public.zapi_circuit_state
  add constraint zapi_circuit_state_state_check
  check (state in ('closed', 'open', 'half_open'));

create unique index if not exists idx_zapi_circuit_state_company_provider
  on public.zapi_circuit_state(company_id, provider);
create index if not exists idx_zapi_circuit_state_state
  on public.zapi_circuit_state(state);
create index if not exists idx_zapi_circuit_state_created_at
  on public.zapi_circuit_state(created_at desc);
create index if not exists idx_zapi_circuit_state_retry_after
  on public.zapi_circuit_state(retry_after);
create index if not exists idx_zapi_circuit_state_correlation_id
  on public.zapi_circuit_state(correlation_id);
create index if not exists idx_zapi_circuit_state_updated_at
  on public.zapi_circuit_state(updated_at desc);

alter table public.zapi_circuit_state enable row level security;

drop policy if exists "zapi_circuit_state_select_access" on public.zapi_circuit_state;
drop policy if exists "zapi_circuit_state_insert_access" on public.zapi_circuit_state;
drop policy if exists "zapi_circuit_state_update_access" on public.zapi_circuit_state;
drop policy if exists "zapi_circuit_state_delete_access" on public.zapi_circuit_state;

create policy "zapi_circuit_state_select_access"
on public.zapi_circuit_state
for select
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.company_id = zapi_circuit_state.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "zapi_circuit_state_insert_access"
on public.zapi_circuit_state
for insert
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.company_id = zapi_circuit_state.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "zapi_circuit_state_update_access"
on public.zapi_circuit_state
for update
using (
  exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "zapi_circuit_state_delete_access"
on public.zapi_circuit_state
for delete
using (
  exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create table if not exists public.collection_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  registro_id uuid null references public.registros_financeiros(id) on delete set null,
  user_id uuid null,
  event_type text not null,
  status text not null default 'recorded',
  channel text not null default 'whatsapp',
  request_id text null,
  correlation_id text null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.collection_events
  drop constraint if exists collection_events_status_check;

alter table public.collection_events
  add constraint collection_events_status_check
  check (status in ('recorded', 'processing', 'success', 'warning', 'error', 'duplicate', 'skipped'));

create index if not exists idx_collection_events_company_created_at
  on public.collection_events(company_id, created_at desc);
create index if not exists idx_collection_events_status
  on public.collection_events(status);
create index if not exists idx_collection_events_correlation_id
  on public.collection_events(correlation_id);
create index if not exists idx_collection_events_request_id
  on public.collection_events(request_id);
create index if not exists idx_collection_events_registro_id
  on public.collection_events(registro_id);

alter table public.collection_events enable row level security;

drop policy if exists "collection_events_select_access" on public.collection_events;
drop policy if exists "collection_events_insert_access" on public.collection_events;
drop policy if exists "collection_events_update_access" on public.collection_events;
drop policy if exists "collection_events_delete_access" on public.collection_events;

create policy "collection_events_select_access"
on public.collection_events
for select
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.company_id = collection_events.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "collection_events_insert_access"
on public.collection_events
for insert
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.company_id = collection_events.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "collection_events_update_access"
on public.collection_events
for update
using (
  exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "collection_events_delete_access"
on public.collection_events
for delete
using (
  exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create table if not exists public.collection_intelligence_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  registro_id uuid null references public.registros_financeiros(id) on delete set null,
  score numeric(5,2) not null default 0,
  score_band text not null default 'unknown',
  model text null,
  reason_summary text null,
  input_hash text null,
  request_id text null,
  correlation_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.collection_intelligence_scores
  drop constraint if exists collection_intelligence_scores_score_band_check;

alter table public.collection_intelligence_scores
  add constraint collection_intelligence_scores_score_band_check
  check (score_band in ('low', 'medium', 'high', 'unknown'));

create index if not exists idx_collection_intelligence_scores_company_created_at
  on public.collection_intelligence_scores(company_id, created_at desc);
create index if not exists idx_collection_intelligence_scores_registro_id
  on public.collection_intelligence_scores(registro_id);
create index if not exists idx_collection_intelligence_scores_correlation_id
  on public.collection_intelligence_scores(correlation_id);
create unique index if not exists idx_collection_intelligence_scores_company_input_hash
  on public.collection_intelligence_scores(company_id, input_hash)
  where input_hash is not null;

alter table public.collection_intelligence_scores enable row level security;

drop policy if exists "collection_intelligence_scores_select_access" on public.collection_intelligence_scores;
drop policy if exists "collection_intelligence_scores_insert_access" on public.collection_intelligence_scores;
drop policy if exists "collection_intelligence_scores_update_access" on public.collection_intelligence_scores;
drop policy if exists "collection_intelligence_scores_delete_access" on public.collection_intelligence_scores;

create policy "collection_intelligence_scores_select_access"
on public.collection_intelligence_scores
for select
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.company_id = collection_intelligence_scores.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "collection_intelligence_scores_insert_access"
on public.collection_intelligence_scores
for insert
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.company_id = collection_intelligence_scores.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "collection_intelligence_scores_update_access"
on public.collection_intelligence_scores
for update
using (
  exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "collection_intelligence_scores_delete_access"
on public.collection_intelligence_scores
for delete
using (
  exists (
    select 1 from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);
