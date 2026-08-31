create table if not exists public.pilot_config (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pilot_enabled boolean not null default false,
  daily_send_limit integer not null default 10,
  business_hours_start time not null default '08:00:00',
  business_hours_end time not null default '18:00:00',
  timezone text not null default 'America/Sao_Paulo',
  internal_owner text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pilot_config_daily_send_limit_check check (daily_send_limit between 1 and 500),
  constraint pilot_config_business_hours_check check (business_hours_end > business_hours_start),
  constraint pilot_config_company_user_key unique (company_id, user_id)
);

create index if not exists idx_pilot_config_company_id on public.pilot_config(company_id);
create index if not exists idx_pilot_config_user_id on public.pilot_config(user_id);
create index if not exists idx_pilot_config_enabled on public.pilot_config(pilot_enabled);

alter table public.pilot_config enable row level security;

drop policy if exists pilot_config_select on public.pilot_config;
create policy pilot_config_select on public.pilot_config
for select
to authenticated
using (
  public.is_system_admin()
  or auth.uid() = user_id
  or public.user_has_company_access(company_id)
);

drop policy if exists pilot_config_insert on public.pilot_config;
create policy pilot_config_insert on public.pilot_config
for insert
to authenticated
with check (
  public.is_system_admin()
  or public.user_can_write_company(company_id)
);

drop policy if exists pilot_config_update on public.pilot_config;
create policy pilot_config_update on public.pilot_config
for update
to authenticated
using (
  public.is_system_admin()
  or public.user_can_write_company(company_id)
)
with check (
  public.is_system_admin()
  or public.user_can_write_company(company_id)
);

drop policy if exists pilot_config_delete on public.pilot_config;
create policy pilot_config_delete on public.pilot_config
for delete
to authenticated
using (
  public.is_system_admin()
  or public.user_can_write_company(company_id)
);

drop trigger if exists trg_pilot_config_set_updated_at on public.pilot_config;
create trigger trg_pilot_config_set_updated_at
before update on public.pilot_config
for each row
execute function public.set_updated_at();
