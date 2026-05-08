alter table public.cobrancas_whatsapp
  add column if not exists company_id uuid references public.empresas(id) on delete cascade;

alter table public.cobrancas_whatsapp
  add column if not exists provider text not null default 'zapi';

alter table public.cobrancas_whatsapp
  add column if not exists provider_message_id text;

alter table public.cobrancas_whatsapp
  add column if not exists sent_at timestamptz;

alter table public.cobrancas_whatsapp
  add column if not exists delivered_at timestamptz;

alter table public.cobrancas_whatsapp
  add column if not exists read_at timestamptz;

alter table public.cobrancas_whatsapp
  add column if not exists failed_at timestamptz;

alter table public.cobrancas_whatsapp
  add column if not exists failure_reason text;

alter table public.cobrancas_whatsapp
  add column if not exists simulated boolean not null default false;

alter table public.cobrancas_whatsapp
  add column if not exists force_resend boolean not null default false;

update public.cobrancas_whatsapp
set company_id = empresa_id
where company_id is null;

alter table public.cobrancas_whatsapp
  drop constraint if exists cobrancas_whatsapp_status_check;

alter table public.cobrancas_whatsapp
  add constraint cobrancas_whatsapp_status_check
  check (
    status in (
      'preparado',
      'queued',
      'sent',
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

create index if not exists idx_cobrancas_whatsapp_company_id
  on public.cobrancas_whatsapp(company_id);

create index if not exists idx_cobrancas_whatsapp_provider_message_id
  on public.cobrancas_whatsapp(provider_message_id);

create index if not exists idx_cobrancas_whatsapp_sent_at
  on public.cobrancas_whatsapp(sent_at);

create index if not exists idx_cobrancas_whatsapp_delivered_at
  on public.cobrancas_whatsapp(delivered_at);

create index if not exists idx_cobrancas_whatsapp_read_at
  on public.cobrancas_whatsapp(read_at);

create index if not exists idx_cobrancas_whatsapp_failed_at
  on public.cobrancas_whatsapp(failed_at);
