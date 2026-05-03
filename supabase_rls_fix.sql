-- =============================================================
-- BankExtract Pro — Script de correção de RLS e tabela system_admins
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

-- -------------------------------------------------------------
-- 1. CRIAR TABELA system_admins (caso não exista)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_admins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- Habilitar RLS na tabela
ALTER TABLE public.system_admins ENABLE ROW LEVEL SECURITY;

-- Política: qualquer usuário autenticado pode verificar se ele mesmo é admin
-- (necessário para a query no companyService.isSystemAdmin)
DROP POLICY IF EXISTS "system_admins_self_read" ON public.system_admins;
CREATE POLICY "system_admins_self_read" ON public.system_admins
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR auth.email() = email
  );

-- -------------------------------------------------------------
-- 2. INSERIR SEU USUÁRIO ADMIN GERAL
-- Substitua o email abaixo pelo email da conta admin real
-- e o user_id pelo UUID do usuário no Supabase Auth
-- -------------------------------------------------------------
-- Exemplo (substitua pelos dados reais):
-- INSERT INTO public.system_admins (user_id, email)
-- VALUES ('00000000-0000-0000-0000-000000000000', 'seu@email.com')
-- ON CONFLICT (user_id) DO NOTHING;


-- -------------------------------------------------------------
-- 3. POLÍTICAS RLS — TABELA empresas
-- -------------------------------------------------------------
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas que possam existir
DROP POLICY IF EXISTS "empresas_select_admin"        ON public.empresas;
DROP POLICY IF EXISTS "empresas_select_member"       ON public.empresas;
DROP POLICY IF EXISTS "empresas_insert_admin"        ON public.empresas;
DROP POLICY IF EXISTS "empresas_update_admin"        ON public.empresas;
DROP POLICY IF EXISTS "empresas_delete_admin"        ON public.empresas;

-- SELECT: admin geral vê todas; usuário comum vê apenas as vinculadas
CREATE POLICY "empresas_select_admin" ON public.empresas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.system_admins sa
      WHERE sa.user_id = auth.uid()
         OR sa.email   = auth.email()
    )
  );

CREATE POLICY "empresas_select_member" ON public.empresas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_empresas ue
      WHERE ue.company_id = empresas.id
        AND ue.user_id    = auth.uid()
    )
  );

-- INSERT: somente admin geral pode criar empresa
CREATE POLICY "empresas_insert_admin" ON public.empresas
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.system_admins sa
      WHERE sa.user_id = auth.uid()
         OR sa.email   = auth.email()
    )
  );

-- UPDATE: somente admin geral pode editar empresa
CREATE POLICY "empresas_update_admin" ON public.empresas
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.system_admins sa
      WHERE sa.user_id = auth.uid()
         OR sa.email   = auth.email()
    )
  );

-- DELETE: somente admin geral pode excluir empresa
CREATE POLICY "empresas_delete_admin" ON public.empresas
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.system_admins sa
      WHERE sa.user_id = auth.uid()
         OR sa.email   = auth.email()
    )
  );


-- -------------------------------------------------------------
-- 4. POLÍTICAS RLS — TABELA usuarios_empresas
-- -------------------------------------------------------------
ALTER TABLE public.usuarios_empresas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_empresas_select"  ON public.usuarios_empresas;
DROP POLICY IF EXISTS "usuarios_empresas_insert"  ON public.usuarios_empresas;
DROP POLICY IF EXISTS "usuarios_empresas_delete"  ON public.usuarios_empresas;

-- SELECT: usuário vê seus próprios vínculos; admin vê todos
CREATE POLICY "usuarios_empresas_select" ON public.usuarios_empresas
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.system_admins sa
      WHERE sa.user_id = auth.uid()
         OR sa.email   = auth.email()
    )
  );

-- INSERT: usuário pode se vincular a empresa; admin pode vincular qualquer um
CREATE POLICY "usuarios_empresas_insert" ON public.usuarios_empresas
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.system_admins sa
      WHERE sa.user_id = auth.uid()
         OR sa.email   = auth.email()
    )
  );

-- DELETE: usuário pode remover o próprio vínculo; admin pode remover qualquer vínculo
CREATE POLICY "usuarios_empresas_delete" ON public.usuarios_empresas
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.system_admins sa
      WHERE sa.user_id = auth.uid()
         OR sa.email   = auth.email()
    )
  );


-- -------------------------------------------------------------
-- 5. FUNÇÃO RPC — join_empresa_by_invite_code
-- Usada em companyService.joinCompanyByInviteCode
-- Precisa dropar antes pois o Postgres não permite alterar
-- o tipo de retorno via CREATE OR REPLACE
-- -------------------------------------------------------------
DROP FUNCTION IF EXISTS public.join_empresa_by_invite_code(TEXT);

CREATE OR REPLACE FUNCTION public.join_empresa_by_invite_code(p_invite_code TEXT)
RETURNS TABLE (
  id          UUID,
  nome        TEXT,
  cnpj        TEXT,
  invite_code TEXT,
  created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
  v_existing   UUID;
BEGIN
  -- Buscar empresa pelo código de convite
  SELECT e.id INTO v_company_id
  FROM public.empresas e
  WHERE UPPER(TRIM(e.invite_code)) = UPPER(TRIM(p_invite_code))
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Codigo de convite nao encontrado.';
  END IF;

  -- Verificar se já tem vínculo
  SELECT ue.id INTO v_existing
  FROM public.usuarios_empresas ue
  WHERE ue.user_id    = auth.uid()
    AND ue.company_id = v_company_id
  LIMIT 1;

  -- Criar vínculo se não existir
  IF v_existing IS NULL THEN
    INSERT INTO public.usuarios_empresas (user_id, company_id, role)
    VALUES (auth.uid(), v_company_id, 'membro');
  END IF;

  -- Retornar dados da empresa
  RETURN QUERY
  SELECT e.id, e.nome, e.cnpj, e.invite_code, e.created_at
  FROM public.empresas e
  WHERE e.id = v_company_id;
END;
$$;

-- Garantir que qualquer usuário autenticado pode chamar a função
GRANT EXECUTE ON FUNCTION public.join_empresa_by_invite_code(TEXT) TO authenticated;


-- -------------------------------------------------------------
-- 6. VERIFICAÇÃO — listar admin inserido
-- Execute para confirmar que o admin foi cadastrado:
-- SELECT * FROM public.system_admins;
-- -------------------------------------------------------------
