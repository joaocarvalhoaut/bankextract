-- ============================================================
-- BankExtract Pro - Cobranca automatica WhatsApp (agendada)
-- Executar no Supabase SQL Editor
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.whatsapp_cobranca_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ativo boolean not null default false,
  intervalo_dias integer not null default 5 check (intervalo_dias >= 1),
  hora_envio time not null default '08:00',
  cobrar_apos_dias_vencido integer not null default 1 check (cobrar_apos_dias_vencido >= 0),
  limite_cobrancas_por_titulo integer not null default 4 check (limite_cobrancas_por_titulo >= 1),
  mensagem_template text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id)
);

create index if not exists idx_whatsapp_cobranca_config_empresa on public.whatsapp_cobranca_config (empresa_id);
create index if not exists idx_whatsapp_cobranca_config_ativo on public.whatsapp_cobranca_config (ativo) where ativo = true;
create index if not exists idx_whatsapp_cobranca_config_hora on public.whatsapp_cobranca_config (hora_envio);

drop trigger if exists trg_whatsapp_cobranca_config_updated_at on public.whatsapp_cobranca_config;
create trigger trg_whatsapp_cobranca_config_updated_at
before update on public.whatsapp_cobranca_config
for each row
execute function public.set_updated_at();

alter table public.whatsapp_cobranca_config enable row level security;

drop policy if exists "wacc_select_admin" on public.whatsapp_cobranca_config;
drop policy if exists "wacc_insert_admin" on public.whatsapp_cobranca_config;
drop policy if exists "wacc_update_admin" on public.whatsapp_cobranca_config;
drop policy if exists "wacc_delete_admin" on public.whatsapp_cobranca_config;
drop policy if exists "wacc_select_member" on public.whatsapp_cobranca_config;
drop policy if exists "wacc_insert_member" on public.whatsapp_cobranca_config;
drop policy if exists "wacc_update_member" on public.whatsapp_cobranca_config;
drop policy if exists "wacc_delete_member" on public.whatsapp_cobranca_config;

create policy "wacc_select_admin"
on public.whatsapp_cobranca_config
for select
to authenticated
using (
  public.is_system_admin(auth.uid())
);

create policy "wacc_insert_admin"
on public.whatsapp_cobranca_config
for insert
to authenticated
with check (
  public.is_system_admin(auth.uid())
);

create policy "wacc_update_admin"
on public.whatsapp_cobranca_config
for update
to authenticated
using (
  public.is_system_admin(auth.uid())
)
with check (
  public.is_system_admin(auth.uid())
);

create policy "wacc_delete_admin"
on public.whatsapp_cobranca_config
for delete
to authenticated
using (
  public.is_system_admin(auth.uid())
);

create policy "wacc_select_member"
on public.whatsapp_cobranca_config
for select
to authenticated
using (
  public.user_has_company_access(whatsapp_cobranca_config.empresa_id)
);

create policy "wacc_insert_member"
on public.whatsapp_cobranca_config
for insert
to authenticated
with check (
  public.user_has_company_access(whatsapp_cobranca_config.empresa_id)
);

create policy "wacc_update_member"
on public.whatsapp_cobranca_config
for update
to authenticated
using (
  public.user_has_company_access(whatsapp_cobranca_config.empresa_id)
)
with check (
  public.user_has_company_access(whatsapp_cobranca_config.empresa_id)
);

create policy "wacc_delete_member"
on public.whatsapp_cobranca_config
for delete
to authenticated
using (
  public.user_has_company_access(whatsapp_cobranca_config.empresa_id)
);

-- ============================================================
-- Scheduler / cron
-- ============================================================
-- A Edge Function send-scheduled-whatsapp-charges pode ser chamada a cada hora.
-- Mesmo rodando toda hora, ela so envia quando bate com hora_envio e regras da empresa.
--
-- Deploy:
--   supabase functions deploy send-scheduled-whatsapp-charges
--
-- Chamada manual:
--   supabase functions invoke send-scheduled-whatsapp-charges --body '{"empresa_id":"UUID","dry_run":true}'
--
-- Cron futuro:
--   agendar a execucao horaria pelo Supabase Scheduler ou pg_cron chamando a function
--   com o header x-cron-secret configurado no secret CRON_SECRET.
