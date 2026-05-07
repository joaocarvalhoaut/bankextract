create table if not exists public.production_checklist_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  item_key text not null,
  status text not null default 'pendente',
  owner_name text,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (company_id, item_key)
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'production_checklist_items_status_check'
      and conrelid = 'public.production_checklist_items'::regclass
  ) then
    alter table public.production_checklist_items
      drop constraint production_checklist_items_status_check;
  end if;
end;
$$;

alter table public.production_checklist_items
  add constraint production_checklist_items_status_check
  check (status in ('pendente', 'em_andamento', 'concluido'));

create index if not exists idx_production_checklist_items_company_status
  on public.production_checklist_items(company_id, status);

create index if not exists idx_production_checklist_items_company_updated_at
  on public.production_checklist_items(company_id, updated_at desc);

alter table public.production_checklist_items enable row level security;

drop policy if exists "production_checklist_items_select_access" on public.production_checklist_items;
drop policy if exists "production_checklist_items_insert_access" on public.production_checklist_items;
drop policy if exists "production_checklist_items_update_access" on public.production_checklist_items;
drop policy if exists "production_checklist_items_delete_access" on public.production_checklist_items;

create policy "production_checklist_items_select_access"
on public.production_checklist_items
for select
to authenticated
using (
  public.user_has_company_access(company_id)
);

create policy "production_checklist_items_insert_access"
on public.production_checklist_items
for insert
to authenticated
with check (
  public.user_can_write_company(company_id)
);

create policy "production_checklist_items_update_access"
on public.production_checklist_items
for update
to authenticated
using (
  public.user_can_write_company(company_id)
)
with check (
  public.user_can_write_company(company_id)
);

create policy "production_checklist_items_delete_access"
on public.production_checklist_items
for delete
to authenticated
using (
  public.user_can_delete_company(company_id)
);

drop trigger if exists trg_production_checklist_items_updated_at on public.production_checklist_items;
create trigger trg_production_checklist_items_updated_at
before update on public.production_checklist_items
for each row
execute function public.set_updated_at();
