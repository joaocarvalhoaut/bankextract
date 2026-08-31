create table if not exists public.platform_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  instance_id text not null default '',
  token text not null default '',
  client_token text not null default '',
  connected boolean not null default false,
  phone_number text,
  connected_at timestamptz,
  last_healthcheck_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint platform_integrations_provider_key unique (provider),
  constraint platform_integrations_provider_check check (provider in ('zapi'))
);

create index if not exists idx_platform_integrations_provider
  on public.platform_integrations(provider);

drop trigger if exists trg_platform_integrations_updated_at on public.platform_integrations;
create trigger trg_platform_integrations_updated_at
before update on public.platform_integrations
for each row
execute function public.set_updated_at();

alter table public.platform_integrations enable row level security;

drop policy if exists "platform_integrations_select_system_admin" on public.platform_integrations;
create policy "platform_integrations_select_system_admin"
on public.platform_integrations
for select
using (
  exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

drop policy if exists "platform_integrations_insert_system_admin" on public.platform_integrations;
create policy "platform_integrations_insert_system_admin"
on public.platform_integrations
for insert
with check (
  exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

drop policy if exists "platform_integrations_update_system_admin" on public.platform_integrations;
create policy "platform_integrations_update_system_admin"
on public.platform_integrations
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

drop policy if exists "platform_integrations_delete_system_admin" on public.platform_integrations;
create policy "platform_integrations_delete_system_admin"
on public.platform_integrations
for delete
using (
  exists (
    select 1
    from public.system_admins sa
    where sa.user_id = auth.uid()
  )
);

insert into public.platform_integrations (
  provider,
  instance_id,
  token,
  client_token,
  connected,
  phone_number,
  connected_at,
  metadata
)
select
  'zapi',
  coalesce(ci.instance_id, ''),
  coalesce(ci.token, ''),
  coalesce(ci.client_token, ''),
  coalesce(ci.connected, false),
  nullif(ci.phone_number, ''),
  case when coalesce(ci.connected, false) then timezone('utc', now()) else null end,
  jsonb_build_object(
    'migrated_from_company_id', ci.company_id,
    'migrated_at', timezone('utc', now())
  )
from public.company_integrations ci
where ci.provider = 'zapi'
  and nullif(ci.instance_id, '') is not null
  and nullif(ci.token, '') is not null
  and nullif(ci.client_token, '') is not null
  and not exists (
    select 1
    from public.platform_integrations pi
    where pi.provider = 'zapi'
  )
order by coalesce(ci.connected, false) desc, ci.updated_at desc nulls last, ci.created_at desc nulls last
limit 1;
