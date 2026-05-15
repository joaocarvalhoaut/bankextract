-- ─────────────────────────────────────────────────────────────────────────────
-- DRIFT RECOVERY — migration aplicada manualmente ao banco sem arquivo no git
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Timestamp: 2026-05-14 15:30 UTC
-- Detectada em: supabase migration list (coluna Remote, sem par Local)
-- Causa raiz: migration executada diretamente via SQL Editor do Supabase Dashboard
--             durante sprint de hardening Z-API/security_sessions, antes de ser
--             rastreada no repositório.
--
-- Conteúdo original reconstruído via contexto (commit a90ab6f):
-- Versão preliminar da tabela security_sessions (depois substituída por
-- 20260514000000_hardening_final.sql que usa CREATE TABLE IF NOT EXISTS).
-- Qualquer objeto criado aqui já existe no banco — as migrations posteriores
-- usam IF NOT EXISTS e não falharão se esta versão já foi aplicada.
--
-- Para registrar no tracking do CLI sem reaplicar:
--   supabase migration repair --status applied 20260514153000
-- ─────────────────────────────────────────────────────────────────────────────

-- Versão inicial de security_sessions (pré-hardening_final).
-- Todos os objetos usam IF NOT EXISTS para idempotência.

create table if not exists public.security_sessions (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null,
  user_id       uuid,
  session_token text        not null unique,
  module        text,
  ip_address    text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  revoked_at    timestamptz
);

create index if not exists idx_security_sessions_company
  on public.security_sessions(company_id, created_at desc);

create index if not exists idx_security_sessions_token
  on public.security_sessions(session_token);

alter table public.security_sessions enable row level security;

do $$ begin
  create policy "ss_company_read" on public.security_sessions
    for select using (
      company_id in (
        select company_id from public.usuarios_empresas where user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;
