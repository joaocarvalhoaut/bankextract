alter table public.cobrancas_whatsapp
  add column if not exists webhook_status text not null default 'aguardando_evento';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'cobrancas_whatsapp_provider_tracking_status_check'
      and conrelid = 'public.cobrancas_whatsapp'::regclass
  ) then
    alter table public.cobrancas_whatsapp
      drop constraint cobrancas_whatsapp_provider_tracking_status_check;
  end if;
end;
$$;

alter table public.cobrancas_whatsapp
  add constraint cobrancas_whatsapp_provider_tracking_status_check
  check (provider_tracking_status in ('resolved', 'pending_webhook', 'fallback_indisponivel'));

update public.cobrancas_whatsapp
set webhook_status = case
  when status in ('delivered', 'read') then 'recebido'
  when provider_tracking_status = 'fallback_indisponivel' then 'fallback_indisponivel'
  when provider_message_id is not null then 'aguardando_evento'
  else 'aguardando_evento'
end
where webhook_status is null
   or webhook_status not in ('aguardando_evento', 'recebido', 'fallback_indisponivel');

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'cobrancas_whatsapp_webhook_status_check'
      and conrelid = 'public.cobrancas_whatsapp'::regclass
  ) then
    alter table public.cobrancas_whatsapp
      drop constraint cobrancas_whatsapp_webhook_status_check;
  end if;
end;
$$;

alter table public.cobrancas_whatsapp
  add constraint cobrancas_whatsapp_webhook_status_check
  check (webhook_status in ('aguardando_evento', 'recebido', 'fallback_indisponivel'));

create index if not exists idx_cobrancas_whatsapp_webhook_status
  on public.cobrancas_whatsapp(webhook_status, created_at desc);
