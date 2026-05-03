-- ============================================================
-- BankExtract Pro — WhatsApp / Z-API: tabelas e RLS
-- Executar no Supabase SQL Editor
-- ============================================================

-- Tabela de configuração WhatsApp por empresa
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ativo           boolean     NOT NULL DEFAULT true,
  sender_name     text        NOT NULL DEFAULT '',
  mensagem_template text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id)
);

-- Tabela de histórico de cobranças enviadas via WhatsApp
CREATE TABLE IF NOT EXISTS public.cobrancas_whatsapp (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid        NOT NULL,
  registro_id      uuid        REFERENCES public.registros_financeiros(id) ON DELETE SET NULL,
  telefone         text        NOT NULL,
  mensagem         text        NOT NULL,
  status           text        NOT NULL DEFAULT 'preparado'
                                CHECK (status IN ('preparado', 'enviado', 'erro')),
  zapi_message_id  text,
  erro             text,
  enviado_por      uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Trigger updated_at para whatsapp_config
CREATE OR REPLACE FUNCTION public.set_whatsapp_config_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_config_updated_at ON public.whatsapp_config;
CREATE TRIGGER trg_whatsapp_config_updated_at
  BEFORE UPDATE ON public.whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION public.set_whatsapp_config_updated_at();

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_cobrancas_whatsapp_empresa  ON public.cobrancas_whatsapp (empresa_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_whatsapp_registro ON public.cobrancas_whatsapp (registro_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_whatsapp_created  ON public.cobrancas_whatsapp (created_at DESC);

-- ============================================================
-- RLS — whatsapp_config
-- ============================================================
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

-- Admin geral: acesso total
CREATE POLICY wc_select_admin ON public.whatsapp_config FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.system_admins sa WHERE sa.user_id = auth.uid()));

CREATE POLICY wc_insert_admin ON public.whatsapp_config FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.system_admins sa WHERE sa.user_id = auth.uid()));

CREATE POLICY wc_update_admin ON public.whatsapp_config FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.system_admins sa WHERE sa.user_id = auth.uid()));

CREATE POLICY wc_delete_admin ON public.whatsapp_config FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.system_admins sa WHERE sa.user_id = auth.uid()));

-- Membro: acessa apenas empresa vinculada
CREATE POLICY wc_select_member ON public.whatsapp_config FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    WHERE ue.user_id = auth.uid() AND ue.company_id = whatsapp_config.empresa_id
  ));

CREATE POLICY wc_insert_member ON public.whatsapp_config FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    WHERE ue.user_id = auth.uid() AND ue.company_id = whatsapp_config.empresa_id
  ));

CREATE POLICY wc_update_member ON public.whatsapp_config FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    WHERE ue.user_id = auth.uid() AND ue.company_id = whatsapp_config.empresa_id
  ));

-- ============================================================
-- RLS — cobrancas_whatsapp
-- ============================================================
ALTER TABLE public.cobrancas_whatsapp ENABLE ROW LEVEL SECURITY;

-- Admin geral: acesso total
CREATE POLICY cw_select_admin ON public.cobrancas_whatsapp FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.system_admins sa WHERE sa.user_id = auth.uid()));

CREATE POLICY cw_insert_admin ON public.cobrancas_whatsapp FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.system_admins sa WHERE sa.user_id = auth.uid()));

-- Membro: acessa apenas cobranças da própria empresa
CREATE POLICY cw_select_member ON public.cobrancas_whatsapp FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    WHERE ue.user_id = auth.uid() AND ue.company_id = cobrancas_whatsapp.empresa_id
  ));

CREATE POLICY cw_insert_member ON public.cobrancas_whatsapp FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    WHERE ue.user_id = auth.uid() AND ue.company_id = cobrancas_whatsapp.empresa_id
  ));
