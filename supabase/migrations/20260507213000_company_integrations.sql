create table if not exists public.company_integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  provider text not null,
  instance_id text,
  token text,
  client_token text,
  phone_number text,
  connected boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (company_id, provider)
);

create index if not exists idx_company_integrations_company_id
  on public.company_integrations(company_id);

create index if not exists idx_company_integrations_provider
  on public.company_integrations(provider);

alter table public.company_integrations enable row level security;

drop policy if exists "company_integrations_select_access" on public.company_integrations;
drop policy if exists "company_integrations_insert_access" on public.company_integrations;
drop policy if exists "company_integrations_update_access" on public.company_integrations;
drop policy if exists "company_integrations_delete_access" on public.company_integrations;

create policy "company_integrations_select_access"
on public.company_integrations
for select
to authenticated
using (
  public.user_has_company_access(company_id)
);

create policy "company_integrations_insert_access"
on public.company_integrations
for insert
to authenticated
with check (
  public.user_can_write_company(company_id)
);

create policy "company_integrations_update_access"
on public.company_integrations
for update
to authenticated
using (
  public.user_can_write_company(company_id)
)
with check (
  public.user_can_write_company(company_id)
);

create policy "company_integrations_delete_access"
on public.company_integrations
for delete
to authenticated
using (
  public.user_can_delete_company(company_id)
);

drop trigger if exists trg_company_integrations_updated_at on public.company_integrations;
create trigger trg_company_integrations_updated_at
before update on public.company_integrations
for each row
execute function public.set_updated_at();
