do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'logs_cobranca_tipo_cobranca_check'
      and conrelid = 'public.logs_cobranca'::regclass
  ) then
    alter table public.logs_cobranca
      drop constraint logs_cobranca_tipo_cobranca_check;
  end if;
end;
$$;

alter table public.logs_cobranca
  add constraint logs_cobranca_tipo_cobranca_check
  check (tipo_cobranca in ('preventiva', 'vencimento', 'atraso', 'manual_assistido', 'manual'));
