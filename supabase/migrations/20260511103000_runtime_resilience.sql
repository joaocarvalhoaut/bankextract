create table if not exists public.automation_dispatches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  operation_hash text not null,
  dispatch_type text not null,
  status text not null default 'pending',
  payload_hash text,
  external_reference text,
  retry_count integer not null default 0,
  last_retry_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.automation_dispatches
  drop constraint if exists automation_dispatches_status_check;

alter table public.automation_dispatches
  add constraint automation_dispatches_status_check
  check (status in ('pending', 'processing', 'completed', 'duplicate', 'failed', 'retrying', 'skipped'));

create unique index if not exists idx_automation_dispatches_company_hash_type
  on public.automation_dispatches(company_id, operation_hash, dispatch_type);
create index if not exists idx_automation_dispatches_status
  on public.automation_dispatches(status);
create index if not exists idx_automation_dispatches_external_reference
  on public.automation_dispatches(external_reference);
create index if not exists idx_automation_dispatches_created_at
  on public.automation_dispatches(created_at desc);

alter table public.automation_dispatches enable row level security;

drop policy if exists "automation_dispatches_select_access" on public.automation_dispatches;
drop policy if exists "automation_dispatches_insert_access" on public.automation_dispatches;
drop policy if exists "automation_dispatches_update_access" on public.automation_dispatches;
drop policy if exists "automation_dispatches_delete_access" on public.automation_dispatches;

create policy "automation_dispatches_select_access"
on public.automation_dispatches
for select
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.company_id = automation_dispatches.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "automation_dispatches_insert_access"
on public.automation_dispatches
for insert
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.company_id = automation_dispatches.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "automation_dispatches_update_access"
on public.automation_dispatches
for update
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.company_id = automation_dispatches.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.company_id = automation_dispatches.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "automation_dispatches_delete_access"
on public.automation_dispatches
for delete
using (
  exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.empresas(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  event_type text not null,
  status text not null default 'pending',
  source text not null default 'stripe',
  external_reference text,
  retry_count integer not null default 0,
  last_retry_at timestamptz,
  next_retry_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.billing_events
  drop constraint if exists billing_events_status_check;

alter table public.billing_events
  add constraint billing_events_status_check
  check (status in ('pending', 'processed', 'failed', 'duplicate', 'retrying'));

create unique index if not exists idx_billing_events_source_reference
  on public.billing_events(source, external_reference)
  where external_reference is not null;
create index if not exists idx_billing_events_company_id
  on public.billing_events(company_id);
create index if not exists idx_billing_events_status
  on public.billing_events(status);
create index if not exists idx_billing_events_created_at
  on public.billing_events(created_at desc);

alter table public.billing_events enable row level security;

drop policy if exists "billing_events_select_access" on public.billing_events;
drop policy if exists "billing_events_insert_access" on public.billing_events;
drop policy if exists "billing_events_update_access" on public.billing_events;
drop policy if exists "billing_events_delete_access" on public.billing_events;

create policy "billing_events_select_access"
on public.billing_events
for select
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.company_id = billing_events.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "billing_events_insert_access"
on public.billing_events
for insert
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.company_id = billing_events.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "billing_events_update_access"
on public.billing_events
for update
using (
  exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "billing_events_delete_access"
on public.billing_events
for delete
using (
  exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);
