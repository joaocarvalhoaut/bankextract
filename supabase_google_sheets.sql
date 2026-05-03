-- =============================================================
-- BankExtract Pro — Google Sheets Integration
-- Execute no SQL Editor do Supabase Dashboard
-- =============================================================

-- -------------------------------------------------------------
-- 1. CRIAR TABELA google_sheets_config
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_sheets_config (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  spreadsheet_id  TEXT        NOT NULL,
  sheet_name      TEXT        NOT NULL DEFAULT 'Página1',
  ativo           BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id)
);

-- Comentários de documentação
COMMENT ON TABLE  public.google_sheets_config                IS 'Configuração de integração Google Sheets por empresa';
COMMENT ON COLUMN public.google_sheets_config.spreadsheet_id IS 'ID da planilha Google Sheets (retirado da URL)';
COMMENT ON COLUMN public.google_sheets_config.sheet_name     IS 'Nome da aba dentro da planilha onde os dados serão escritos';
COMMENT ON COLUMN public.google_sheets_config.ativo          IS 'Se false, sincronização está pausada para esta empresa';

-- -------------------------------------------------------------
-- 2. TRIGGER updated_at (padrão do projeto)
-- -------------------------------------------------------------
-- Criar função genérica de updated_at caso não exista
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Aplicar trigger na tabela
DROP TRIGGER IF EXISTS trg_google_sheets_config_updated_at ON public.google_sheets_config;
CREATE TRIGGER trg_google_sheets_config_updated_at
  BEFORE UPDATE ON public.google_sheets_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------
-- 3. HABILITAR RLS
-- -------------------------------------------------------------
ALTER TABLE public.google_sheets_config ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- 4. POLÍTICAS RLS
-- Regras:
--   - Admin geral acessa todas as configs
--   - Usuário comum acessa apenas config da empresa vinculada
-- -------------------------------------------------------------

-- Remover políticas antigas
DROP POLICY IF EXISTS "gsc_select_admin"    ON public.google_sheets_config;
DROP POLICY IF EXISTS "gsc_select_member"   ON public.google_sheets_config;
DROP POLICY IF EXISTS "gsc_insert_admin"    ON public.google_sheets_config;
DROP POLICY IF EXISTS "gsc_insert_member"   ON public.google_sheets_config;
DROP POLICY IF EXISTS "gsc_update_admin"    ON public.google_sheets_config;
DROP POLICY IF EXISTS "gsc_update_member"   ON public.google_sheets_config;
DROP POLICY IF EXISTS "gsc_delete_admin"    ON public.google_sheets_config;

-- SELECT: admin vê todas; usuário vê apenas a da própria empresa vinculada
CREATE POLICY "gsc_select_admin" ON public.google_sheets_config
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.system_admins sa
      WHERE sa.user_id = auth.uid()
         OR sa.email   = auth.email()
    )
  );

CREATE POLICY "gsc_select_member" ON public.google_sheets_config
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_empresas ue
      WHERE ue.user_id    = auth.uid()
        AND ue.company_id = google_sheets_config.empresa_id
    )
  );

-- INSERT: admin pode criar para qualquer empresa; usuário só para empresa vinculada
CREATE POLICY "gsc_insert_admin" ON public.google_sheets_config
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.system_admins sa
      WHERE sa.user_id = auth.uid()
         OR sa.email   = auth.email()
    )
  );

CREATE POLICY "gsc_insert_member" ON public.google_sheets_config
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios_empresas ue
      WHERE ue.user_id    = auth.uid()
        AND ue.company_id = google_sheets_config.empresa_id
    )
  );

-- UPDATE: admin atualiza qualquer; usuário só atualiza a da empresa vinculada
CREATE POLICY "gsc_update_admin" ON public.google_sheets_config
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.system_admins sa
      WHERE sa.user_id = auth.uid()
         OR sa.email   = auth.email()
    )
  );

CREATE POLICY "gsc_update_member" ON public.google_sheets_config
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_empresas ue
      WHERE ue.user_id    = auth.uid()
        AND ue.company_id = google_sheets_config.empresa_id
    )
  );

-- DELETE: apenas admin geral pode remover configurações
CREATE POLICY "gsc_delete_admin" ON public.google_sheets_config
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.system_admins sa
      WHERE sa.user_id = auth.uid()
         OR sa.email   = auth.email()
    )
  );

-- -------------------------------------------------------------
-- 5. GRANT para usuários autenticados
-- -------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_sheets_config TO authenticated;

-- -------------------------------------------------------------
-- 6. VERIFICAÇÃO
-- SELECT * FROM public.google_sheets_config;
-- -------------------------------------------------------------
