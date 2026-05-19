create table if not exists public.dispatch_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending',
  total_items integer not null default 0,
  processed_items integer not null default 0,
  success_count integer not null default 0,
  error_count integer not null default 0,
  ignored_count integer not null default 0,
  current_batch_id text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dispatch_jobs
  drop constraint if exists dispatch_jobs_status_check;

alter table public.dispatch_jobs
  add constraint dispatch_jobs_status_check
  check (status in ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled'));

create index if not exists idx_dispatch_jobs_company_status
  on public.dispatch_jobs(company_id, status, created_at desc);

create table if not exists public.dispatch_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.dispatch_jobs(id) on delete cascade,
  company_id uuid not null references public.empresas(id) on delete cascade,
  record_id text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz,
  last_error_code text,
  last_error_message text,
  log_cobranca_id uuid references public.logs_cobranca(id) on delete set null,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dispatch_job_items
  drop constraint if exists dispatch_job_items_status_check;

alter table public.dispatch_job_items
  add constraint dispatch_job_items_status_check
  check (status in ('pending', 'processing', 'success', 'error', 'ignored'));

create index if not exists idx_dispatch_job_items_job_status
  on public.dispatch_job_items(job_id, status, created_at asc);

create index if not exists idx_dispatch_job_items_company_due
  on public.dispatch_job_items(company_id, status, next_attempt_at, locked_at);

create index if not exists idx_dispatch_job_items_record_id
  on public.dispatch_job_items(record_id);

alter table public.dispatch_jobs enable row level security;
alter table public.dispatch_job_items enable row level security;

drop policy if exists "dispatch_jobs_select_access" on public.dispatch_jobs;
drop policy if exists "dispatch_jobs_insert_access" on public.dispatch_jobs;
drop policy if exists "dispatch_jobs_update_access" on public.dispatch_jobs;
drop policy if exists "dispatch_jobs_delete_access" on public.dispatch_jobs;

create policy "dispatch_jobs_select_access"
on public.dispatch_jobs
for select
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.company_id = dispatch_jobs.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "dispatch_jobs_insert_access"
on public.dispatch_jobs
for insert
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.company_id = dispatch_jobs.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "dispatch_jobs_update_access"
on public.dispatch_jobs
for update
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.company_id = dispatch_jobs.company_id
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
    where ue.company_id = dispatch_jobs.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "dispatch_jobs_delete_access"
on public.dispatch_jobs
for delete
using (
  exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

drop policy if exists "dispatch_job_items_select_access" on public.dispatch_job_items;
drop policy if exists "dispatch_job_items_insert_access" on public.dispatch_job_items;
drop policy if exists "dispatch_job_items_update_access" on public.dispatch_job_items;
drop policy if exists "dispatch_job_items_delete_access" on public.dispatch_job_items;

create policy "dispatch_job_items_select_access"
on public.dispatch_job_items
for select
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.company_id = dispatch_job_items.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "dispatch_job_items_insert_access"
on public.dispatch_job_items
for insert
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.company_id = dispatch_job_items.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "dispatch_job_items_update_access"
on public.dispatch_job_items
for update
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.company_id = dispatch_job_items.company_id
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
    where ue.company_id = dispatch_job_items.company_id
      and ue.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

create policy "dispatch_job_items_delete_access"
on public.dispatch_job_items
for delete
using (
  exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);
