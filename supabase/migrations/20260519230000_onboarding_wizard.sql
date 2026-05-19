-- ─────────────────────────────────────────────────────────────────────────────
-- ETAPA 11 — Wizard de onboarding SaaS automatizado
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. onboarding_wizard_progress ────────────────────────────────────────────
-- Armazena o estado do wizard por empresa: passo atual, passos concluídos,
-- metadados de validação e timestamp de conclusão.
create table if not exists public.onboarding_wizard_progress (
  id               uuid        primary key default gen_random_uuid(),
  company_id       uuid        not null unique references public.empresas(id) on delete cascade,
  current_step     text        not null default 'welcome',
  completed_steps  text[]      not null default '{}',
  completed_at     timestamptz,
  metadata         jsonb       not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.onboarding_wizard_progress is
  'Progresso do wizard de onboarding SaaS por empresa — passo atual, passos concluídos e metadados de validação.';

create index if not exists idx_owp_company
  on public.onboarding_wizard_progress(company_id);

create index if not exists idx_owp_completed
  on public.onboarding_wizard_progress(completed_at)
  where completed_at is not null;

alter table public.onboarding_wizard_progress enable row level security;

-- Empresas lêem e escrevem seu próprio progresso
do $$ begin
  create policy "owp_company_rw" on public.onboarding_wizard_progress
    for all
    using (
      company_id in (
        select company_id from public.usuarios_empresas where user_id = auth.uid()
      )
    )
    with check (
      company_id in (
        select company_id from public.usuarios_empresas where user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

-- Admins podem ler todos os registros
do $$ begin
  create policy "owp_admin_read" on public.onboarding_wizard_progress
    for select
    using (
      exists (select 1 from public.system_admins where user_id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

-- ── 2. Trigger updated_at ─────────────────────────────────────────────────────
-- Garante que updated_at seja atualizado automaticamente a cada mudança.
create or replace function public.set_onboarding_wizard_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_owp_updated_at on public.onboarding_wizard_progress;
create trigger trg_owp_updated_at
  before update on public.onboarding_wizard_progress
  for each row execute function public.set_onboarding_wizard_updated_at();
