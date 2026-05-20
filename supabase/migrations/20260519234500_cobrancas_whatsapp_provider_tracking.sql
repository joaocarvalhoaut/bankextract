alter table public.cobrancas_whatsapp
  add column if not exists correlation_id text;

alter table public.cobrancas_whatsapp
  add column if not exists provider_tracking_status text not null default 'resolved';

alter table public.cobrancas_whatsapp
  add column if not exists request_payload jsonb not null default '{}'::jsonb;

alter table public.cobrancas_whatsapp
  add column if not exists response_payload jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'cobrancas_whatsapp_status_check'
      and conrelid = 'public.cobrancas_whatsapp'::regclass
  ) then
    alter table public.cobrancas_whatsapp
      drop constraint cobrancas_whatsapp_status_check;
  end if;
end;
$$;

update public.cobrancas_whatsapp
set provider_tracking_status = 'pending_webhook'
where provider_message_id is null
  and status = 'sent';

update public.cobrancas_whatsapp
set status = 'sent_pending_provider_id'
where provider_message_id is null
  and status = 'sent';

alter table public.cobrancas_whatsapp
  add constraint cobrancas_whatsapp_status_check
  check (
    status in (
      'preparado',
      'queued',
      'sent',
      'sent_pending_provider_id',
      'delivered',
      'read',
      'failed',
      'simulated',
      'enviado',
      'mock_enviado',
      'erro',
      'cancelado'
    )
  );

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
  check (provider_tracking_status in ('resolved', 'pending_webhook'));

create index if not exists idx_cobrancas_whatsapp_tracking_status
  on public.cobrancas_whatsapp(provider_tracking_status, created_at desc);

create index if not exists idx_cobrancas_whatsapp_correlation_id
  on public.cobrancas_whatsapp(correlation_id)
  where correlation_id is not null;
