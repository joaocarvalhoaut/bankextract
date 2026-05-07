alter table public.audit_logs
  add column if not exists title text;

alter table public.audit_logs
  add column if not exists description text;

alter table public.audit_logs
  add column if not exists severity text not null default 'info';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'audit_logs_severity_check'
      and conrelid = 'public.audit_logs'::regclass
  ) then
    alter table public.audit_logs
      drop constraint audit_logs_severity_check;
  end if;
end;
$$;

alter table public.audit_logs
  add constraint audit_logs_severity_check
  check (severity in ('info', 'success', 'warning', 'danger'));

create index if not exists idx_audit_logs_severity on public.audit_logs(severity);
