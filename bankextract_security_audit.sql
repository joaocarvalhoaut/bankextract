-- ============================================================
-- BankExtract Pro — Auditoria de Segurança
-- Executar no Supabase SQL Editor
-- ============================================================
-- Este script:
--   1. Expande os roles possíveis em usuarios_empresas
--   2. Adiciona helper get_user_role_in_company()
--   3. Cria tabela audit_logs + RLS
--   4. Substitui políticas RLS binárias por políticas sensíveis a role
--   5. Corrige políticas excessivamente permissivas em empresas
-- ============================================================

-- ============================================================
-- 1. Expandir roles em usuarios_empresas
-- ============================================================
-- Remover constraint antiga e criar nova com todos os roles
ALTER TABLE public.usuarios_empresas
  DROP CONSTRAINT IF EXISTS usuarios_empresas_role_check;

ALTER TABLE public.usuarios_empresas
  ADD CONSTRAINT usuarios_empresas_role_check
  CHECK (role IN ('owner', 'admin', 'financeiro', 'operador', 'membro', 'member', 'visualizador'));

-- Normalizar 'member' → 'membro' (aliases) — opcional, mantém retrocompatibilidade
-- UPDATE public.usuarios_empresas SET role = 'membro' WHERE role = 'member';

-- ============================================================
-- 2. Helper: role do usuário na empresa (security definer)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_role_in_company(
  p_company_id uuid,
  p_user_id    uuid DEFAULT auth.uid()
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.usuarios_empresas
  WHERE company_id = p_company_id
    AND user_id    = p_user_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_role_in_company(uuid, uuid) TO authenticated;

-- ============================================================
-- 3. Helpers de role para políticas RLS
-- ============================================================

-- Pode importar/editar registros: owner, admin, financeiro, operador
CREATE OR REPLACE FUNCTION public.user_can_write_company(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.system_admins sa WHERE sa.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    WHERE ue.company_id = target_company_id
      AND ue.user_id    = auth.uid()
      AND ue.role IN ('owner', 'admin', 'financeiro', 'operador', 'membro', 'member')
  );
$$;

-- Pode excluir em massa / limpar visão: owner, admin, financeiro
CREATE OR REPLACE FUNCTION public.user_can_delete_company(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.system_admins sa WHERE sa.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    WHERE ue.company_id = target_company_id
      AND ue.user_id    = auth.uid()
      AND ue.role IN ('owner', 'admin', 'financeiro')
  );
$$;

-- Pode gerenciar empresa (update/delete): owner, admin
CREATE OR REPLACE FUNCTION public.user_can_manage_company(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.system_admins sa WHERE sa.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    WHERE ue.company_id = target_company_id
      AND ue.user_id    = auth.uid()
      AND ue.role IN ('owner', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_write_company(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_delete_company(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_manage_company(uuid)  TO authenticated;

-- ============================================================
-- 4. Tabela audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        REFERENCES public.empresas(id) ON DELETE SET NULL,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  action     text        NOT NULL,
  entity     text        NOT NULL,
  entity_id  text,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id  ON public.audit_logs (company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id     ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON public.audit_logs (created_at DESC);

-- RLS em audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: admin geral vê tudo; membros veem apenas seus logs
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.system_admins sa WHERE sa.user_id = auth.uid()));

CREATE POLICY "audit_logs_select_member" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.user_has_company_access(audit_logs.company_id));

-- INSERT: qualquer membro da empresa pode inserir (auto-registro)
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    company_id IS NULL
    OR public.user_has_company_access(audit_logs.company_id)
  );

-- Ninguém atualiza ou exclui logs (imutáveis)
-- (sem políticas UPDATE/DELETE = bloqueado por padrão)

-- ============================================================
-- 5. Corrigir RLS de registros_financeiros (INSERT, UPDATE, DELETE sensíveis a role)
-- ============================================================
DROP POLICY IF EXISTS "registros_financeiros_insert" ON public.registros_financeiros;
DROP POLICY IF EXISTS "registros_financeiros_update" ON public.registros_financeiros;
DROP POLICY IF EXISTS "registros_financeiros_delete" ON public.registros_financeiros;

CREATE POLICY "registros_financeiros_insert"
ON public.registros_financeiros FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_company(registros_financeiros.company_id));

CREATE POLICY "registros_financeiros_update"
ON public.registros_financeiros FOR UPDATE TO authenticated
USING  (public.user_can_write_company(registros_financeiros.company_id))
WITH CHECK (public.user_can_write_company(registros_financeiros.company_id));

CREATE POLICY "registros_financeiros_delete"
ON public.registros_financeiros FOR DELETE TO authenticated
USING (public.user_can_delete_company(registros_financeiros.company_id));

-- ============================================================
-- 6. Corrigir RLS de importacoes (INSERT, DELETE sensíveis a role)
-- ============================================================
DROP POLICY IF EXISTS "importacoes_insert" ON public.importacoes;
DROP POLICY IF EXISTS "importacoes_update" ON public.importacoes;
DROP POLICY IF EXISTS "importacoes_delete" ON public.importacoes;

CREATE POLICY "importacoes_insert"
ON public.importacoes FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_company(importacoes.company_id));

CREATE POLICY "importacoes_update"
ON public.importacoes FOR UPDATE TO authenticated
USING  (public.user_can_write_company(importacoes.company_id))
WITH CHECK (public.user_can_write_company(importacoes.company_id));

CREATE POLICY "importacoes_delete"
ON public.importacoes FOR DELETE TO authenticated
USING (public.user_can_delete_company(importacoes.company_id));

-- ============================================================
-- 7. Corrigir RLS de empresas (UPDATE/DELETE devem exigir role admin/owner)
--    A política anterior usava created_by = auth.uid() sem checar role — muito permissiva.
-- ============================================================
DROP POLICY IF EXISTS "empresas_update_admin"  ON public.empresas;
DROP POLICY IF EXISTS "empresas_delete_admin"  ON public.empresas;

CREATE POLICY "empresas_update_admin"
ON public.empresas FOR UPDATE TO authenticated
USING  (public.user_can_manage_company(empresas.id))
WITH CHECK (public.user_can_manage_company(empresas.id));

CREATE POLICY "empresas_delete_admin"
ON public.empresas FOR DELETE TO authenticated
USING (
  public.is_system_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    WHERE ue.company_id = empresas.id
      AND ue.user_id    = auth.uid()
      AND ue.role = 'owner'
  )
);

-- ============================================================
-- 8. Garantir RLS em tabelas WhatsApp (criadas por scripts anteriores)
--    Reaplicar usando helpers de role para tabelas que só tinham binary check
-- ============================================================

-- cobrancas_whatsapp: INSERT apenas quem pode escrever
DROP POLICY IF EXISTS "cw_insert_member" ON public.cobrancas_whatsapp;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cobrancas_whatsapp') THEN
    EXECUTE $pol$
      CREATE POLICY "cw_insert_member" ON public.cobrancas_whatsapp FOR INSERT TO authenticated
        WITH CHECK (public.user_can_write_company(cobrancas_whatsapp.empresa_id))
    $pol$;
  END IF;
END;
$$;

-- ============================================================
-- Fim da auditoria de segurança
-- ============================================================
