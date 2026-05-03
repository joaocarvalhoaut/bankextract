-- ============================================================
-- BankExtract Pro — Cobrança Automática WhatsApp
-- Executar no Supabase SQL Editor
-- ============================================================

-- Tabela de configuração de cobrança automática por empresa
CREATE TABLE IF NOT EXISTS public.whatsapp_cobranca_config (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  uuid        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ativo                       boolean     NOT NULL DEFAULT false,
  intervalo_dias              int         NOT NULL DEFAULT 5 CHECK (intervalo_dias >= 1),
  hora_envio                  text        NOT NULL DEFAULT '08:00',
  cobrar_apos_dias_vencido    int         NOT NULL DEFAULT 3 CHECK (cobrar_apos_dias_vencido >= 0),
  limite_cobrancas_por_titulo int         NOT NULL DEFAULT 4 CHECK (limite_cobrancas_por_titulo >= 1),
  mensagem_template           text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id)
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_wcc_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wcc_updated_at ON public.whatsapp_cobranca_config;
CREATE TRIGGER trg_wcc_updated_at
  BEFORE UPDATE ON public.whatsapp_cobranca_config
  FOR EACH ROW EXECUTE FUNCTION public.set_wcc_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_wcc_empresa ON public.whatsapp_cobranca_config (empresa_id);
CREATE INDEX IF NOT EXISTS idx_wcc_ativo   ON public.whatsapp_cobranca_config (ativo) WHERE ativo = true;

-- ============================================================
-- RLS — whatsapp_cobranca_config
-- ============================================================
ALTER TABLE public.whatsapp_cobranca_config ENABLE ROW LEVEL SECURITY;

-- Admin geral: acesso total
CREATE POLICY wcc_select_admin ON public.whatsapp_cobranca_config FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.system_admins sa WHERE sa.user_id = auth.uid()));

CREATE POLICY wcc_insert_admin ON public.whatsapp_cobranca_config FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.system_admins sa WHERE sa.user_id = auth.uid()));

CREATE POLICY wcc_update_admin ON public.whatsapp_cobranca_config FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.system_admins sa WHERE sa.user_id = auth.uid()));

CREATE POLICY wcc_delete_admin ON public.whatsapp_cobranca_config FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.system_admins sa WHERE sa.user_id = auth.uid()));

-- Membro: acessa apenas empresa vinculada (usa company_id — coluna real)
CREATE POLICY wcc_select_member ON public.whatsapp_cobranca_config FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    WHERE ue.user_id = auth.uid() AND ue.company_id = whatsapp_cobranca_config.empresa_id
  ));

CREATE POLICY wcc_insert_member ON public.whatsapp_cobranca_config FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    WHERE ue.user_id = auth.uid() AND ue.company_id = whatsapp_cobranca_config.empresa_id
  ));

CREATE POLICY wcc_update_member ON public.whatsapp_cobranca_config FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    WHERE ue.user_id = auth.uid() AND ue.company_id = whatsapp_cobranca_config.empresa_id
  ));

-- ============================================================
-- Cron automático (pg_cron) — roda a cada hora
--
-- ATENÇÃO: substitua <PROJECT_REF> e <SERVICE_ROLE_KEY> pelos
-- valores reais do seu projeto Supabase antes de executar.
--
-- Para encontrar:
--   PROJECT_REF: Settings → General → Reference ID
--   SERVICE_ROLE_KEY: Settings → API → service_role
--
-- Execute APENAS após criar o secret CRON_SECRET no painel:
--   Edge Functions → Secrets → CRON_SECRET = <qualquer string segura>
--
-- E use o mesmo valor abaixo em x-cron-secret.
-- ============================================================

/*
SELECT cron.schedule(
  'bankextract-whatsapp-auto-charge',
  '0 * * * *',   -- toda hora em ponto (ajuste conforme necessário)
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-scheduled-whatsapp-charges',
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'x-cron-secret',   '<CRON_SECRET_VALUE>'
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
*/

-- Para remover o cron quando necessário:
-- SELECT cron.unschedule('bankextract-whatsapp-auto-charge');
