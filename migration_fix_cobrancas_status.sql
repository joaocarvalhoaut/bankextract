-- ============================================================
-- BankExtract Pro — Migration: fix cobrancas_whatsapp status
-- Adiciona 'mock_enviado' ao CHECK constraint de status.
-- Rodar no Supabase SQL Editor antes de ativar o modo mock.
-- ============================================================

-- 1. Remove a constraint antiga (nome gerado automaticamente pelo Postgres)
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.cobrancas_whatsapp'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.cobrancas_whatsapp DROP CONSTRAINT %I', v_constraint);
    RAISE NOTICE 'Constraint % removida.', v_constraint;
  ELSE
    RAISE NOTICE 'Nenhuma constraint de status encontrada — adicionando direto.';
  END IF;
END;
$$;

-- 2. Adiciona nova constraint com mock_enviado incluido
ALTER TABLE public.cobrancas_whatsapp
  ADD CONSTRAINT cobrancas_whatsapp_status_check
  CHECK (status IN ('preparado', 'enviado', 'mock_enviado', 'erro'));

-- 3. Adiciona coluna enviado_por se nao existir (algumas instalacoes podem nao ter)
ALTER TABLE public.cobrancas_whatsapp
  ADD COLUMN IF NOT EXISTS enviado_por uuid;

-- 4. Refresha schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
