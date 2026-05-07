create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  type text not null,
  title text not null,
  message text not null,
  status text not null default 'unread',
  severity text not null default 'info',
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'notifications_status_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      drop constraint notifications_status_check;
  end if;
end;
$$;

alter table public.notifications
  add constraint notifications_status_check
  check (status in ('unread', 'read'));

create index if not exists idx_notifications_company_created_at on public.notifications(company_id, created_at desc);
create index if not exists idx_notifications_company_status on public.notifications(company_id, status);
create index if not exists idx_notifications_user_id on public.notifications(user_id);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_access" on public.notifications;
drop policy if exists "notifications_insert_access" on public.notifications;
drop policy if exists "notifications_update_access" on public.notifications;
drop policy if exists "notifications_delete_access" on public.notifications;

create policy "notifications_select_access"
on public.notifications
for select
to authenticated
using (
  public.user_has_company_access(company_id)
);

create policy "notifications_insert_access"
on public.notifications
for insert
to authenticated
with check (
  public.user_can_write_company(company_id)
);

create policy "notifications_update_access"
on public.notifications
for update
to authenticated
using (
  public.user_has_company_access(company_id)
)
with check (
  public.user_has_company_access(company_id)
);

create policy "notifications_delete_access"
on public.notifications
for delete
to authenticated
using (
  public.user_can_delete_company(company_id)
);
