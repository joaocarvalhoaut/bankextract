-- =============================================================================
-- Migration: Adicionar batch_id nas tabelas importacoes e registros_financeiros
--
-- Execute no Supabase Dashboard > SQL Editor.
-- Idempotente — seguro rodar múltiplas vezes.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. registros_financeiros.batch_id (uuid, nullable — vincula ao lote)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.registros_financeiros
  add column if not exists batch_id uuid;

-- Índice para filtro por empresa + lote
create index if not exists idx_registros_financeiros_company_batch_id
  on public.registros_financeiros(company_id, batch_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. importacoes.batch_id (uuid, not null, único — identidade semântica do lote)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.importacoes
  add column if not exists batch_id uuid;

-- Backfill: linhas já existentes que estejam com batch_id = null
update public.importacoes
set    batch_id = gen_random_uuid()
where  batch_id is null;

-- Tornar NOT NULL após backfill
alter table public.importacoes
  alter column batch_id set default gen_random_uuid();

alter table public.importacoes
  alter column batch_id set not null;

-- Constraint UNIQUE (verifica antes de criar para não duplicar)
do $$
begin
  if not exists (
    select 1
    from   pg_constraint
    where  conname = 'importacoes_batch_id_key'
      and  conrelid = 'public.importacoes'::regclass
  ) then
    alter table public.importacoes
      add constraint importacoes_batch_id_key unique (batch_id);
  end if;
end;
$$;

-- Índice composto para consultas por empresa + lote
create index if not exists idx_importacoes_company_batch_id
  on public.importacoes(company_id, batch_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Forçar reload do schema cache do PostgREST
--    (resolve o erro "column not found in schema cache" sem reiniciar o projeto)
-- ─────────────────────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificação final (opcional — confira o resultado abaixo)
-- ─────────────────────────────────────────────────────────────────────────────
select
  table_name,
  column_name,
  data_type,
  column_default,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name   in ('importacoes', 'registros_financeiros')
  and column_name  = 'batch_id'
order by table_name;
