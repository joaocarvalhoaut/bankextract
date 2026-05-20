do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'logs_cobranca_status_envio_check'
      and conrelid = 'public.logs_cobranca'::regclass
  ) then
    alter table public.logs_cobranca
      drop constraint logs_cobranca_status_envio_check;
  end if;
end;
$$;

alter table public.logs_cobranca
  add constraint logs_cobranca_status_envio_check
  check (
    status_envio in (
      'sucesso',
      'sucesso_sem_boleto',
      'sucesso_simulado',
      'simulado',
      'erro',
      'ignorado',
      'preparado_manual'
    )
  );
