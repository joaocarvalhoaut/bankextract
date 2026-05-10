-- ============================================================
-- NC Finance / NC HUB — Stripe Billing Foundation
-- Migration: 20260508200000
-- Idempotent: yes (safe to rerun after partial failure)
-- ============================================================

-- ------------------------------------------------------------
-- SECTION 0: Ensure empresas has all billing columns
-- (Safe for rerun — uses ADD COLUMN IF NOT EXISTS)
-- These columns may not exist if a previous migration failed
-- or if the remote schema was seeded differently.
-- ------------------------------------------------------------
alter table public.empresas
  add column if not exists subscription_plan text not null default 'starter';

alter table public.empresas
  add column if not exists subscription_status text not null default 'trialing';

alter table public.empresas
  add column if not exists monthly_send_limit integer not null default 200;

alter table public.empresas
  add column if not exists billing_cycle_start date not null default current_date;

alter table public.empresas
  add column if not exists billing_cycle_end date;

alter table public.empresas
  add column if not exists automatic_send_enabled boolean not null default false;

-- Add check constraints idempotently
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'empresas_subscription_plan_check'
      and conrelid = 'public.empresas'::regclass
  ) then
    alter table public.empresas
      add constraint empresas_subscription_plan_check
      check (subscription_plan in ('starter', 'pro', 'business'));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'empresas_subscription_status_check'
      and conrelid = 'public.empresas'::regclass
  ) then
    alter table public.empresas
      add constraint empresas_subscription_status_check
      check (subscription_status in ('active', 'trialing', 'past_due', 'canceled'));
  end if;
end $$;

-- ------------------------------------------------------------
-- SECTION 1: Core billing tables
-- ------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_cents integer not null default 0,
  currency text not null default 'brl',
  billing_period text not null default 'monthly',
  trial_days integer not null default 7,
  stripe_product_id text,
  stripe_price_id text,
  limits_json jsonb not null default '{}'::jsonb,
  features_json jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  highlighted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  plan_code text not null,
  status text not null default 'trialing',
  provider text not null default 'stripe',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_checkout_session_id text,
  stripe_portal_last_url text,
  billing_email text,
  collection_method text,
  trial_starts_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (company_id),
  unique (stripe_customer_id),
  unique (stripe_subscription_id)
);

-- ------------------------------------------------------------
-- SECTION 2: Check constraints (drop-first for idempotency)
-- ------------------------------------------------------------
alter table public.plans
  drop constraint if exists plans_billing_period_check;

alter table public.plans
  add constraint plans_billing_period_check
  check (billing_period in ('monthly', 'yearly'));

alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('trialing', 'active', 'past_due', 'canceled'));

-- ------------------------------------------------------------
-- SECTION 3: Indexes
-- ------------------------------------------------------------
create index if not exists idx_plans_active on public.plans(active);
create index if not exists idx_subscriptions_company_id on public.subscriptions(company_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_subscriptions_stripe_customer_id on public.subscriptions(stripe_customer_id);
create index if not exists idx_subscriptions_stripe_subscription_id on public.subscriptions(stripe_subscription_id);

-- ------------------------------------------------------------
-- SECTION 4: Row Level Security
-- ------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "plans_select_access" on public.plans;
drop policy if exists "plans_manage_admin" on public.plans;

create policy "plans_select_access"
on public.plans
for select
to authenticated
using (true);

create policy "plans_manage_admin"
on public.plans
for all
to authenticated
using (public.is_system_admin(auth.uid()))
with check (public.is_system_admin(auth.uid()));

drop policy if exists "subscriptions_select_access" on public.subscriptions;
drop policy if exists "subscriptions_insert_access" on public.subscriptions;
drop policy if exists "subscriptions_update_access" on public.subscriptions;
drop policy if exists "subscriptions_delete_access" on public.subscriptions;

create policy "subscriptions_select_access"
on public.subscriptions
for select
to authenticated
using (
  public.user_has_company_access(company_id)
);

create policy "subscriptions_insert_access"
on public.subscriptions
for insert
to authenticated
with check (
  public.user_can_write_company(company_id)
);

create policy "subscriptions_update_access"
on public.subscriptions
for update
to authenticated
using (
  public.user_can_write_company(company_id)
)
with check (
  public.user_can_write_company(company_id)
);

create policy "subscriptions_delete_access"
on public.subscriptions
for delete
to authenticated
using (
  public.user_can_delete_company(company_id)
);

-- ------------------------------------------------------------
-- SECTION 5: Updated-at triggers
-- ------------------------------------------------------------
drop trigger if exists trg_plans_updated_at on public.plans;
create trigger trg_plans_updated_at
before update on public.plans
for each row
execute function public.set_updated_at();

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.set_updated_at();

-- ------------------------------------------------------------
-- SECTION 6: Sync functions
-- Mirrors new-style records back to legacy tables so older
-- code (subscriptionService, usage counters, etc.) keeps working.
-- ------------------------------------------------------------
create or replace function public.sync_plan_legacy_tables()
returns trigger
language plpgsql
as $$
begin
  insert into public.subscription_plans (
    code,
    name,
    price_cents,
    billing_period,
    limits_json,
    features_json,
    active
  )
  values (
    new.code,
    new.name,
    new.price_cents,
    new.billing_period,
    new.limits_json,
    new.features_json,
    new.active
  )
  on conflict (code) do update
  set
    name = excluded.name,
    price_cents = excluded.price_cents,
    billing_period = excluded.billing_period,
    limits_json = excluded.limits_json,
    features_json = excluded.features_json,
    active = excluded.active;

  return new;
end;
$$;

create or replace function public.sync_subscription_legacy_tables()
returns trigger
language plpgsql
as $$
declare
  selected_plan public.plans%rowtype;
  monthly_limit integer;
  automatic_send boolean;
begin
  select *
  into selected_plan
  from public.plans
  where id = new.plan_id
     or code = new.plan_code
  limit 1;

  monthly_limit := coalesce((selected_plan.limits_json ->> 'charges_month')::integer, 0);
  automatic_send := coalesce((selected_plan.features_json ? 'advanced_automation'), false);

  -- Mirror to legacy company_subscriptions table
  insert into public.company_subscriptions (
    company_id,
    plan_code,
    status,
    trial_ends_at,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    created_at,
    updated_at
  )
  values (
    new.company_id,
    coalesce(selected_plan.code, new.plan_code),
    new.status,
    new.trial_ends_at,
    new.current_period_start,
    new.current_period_end,
    new.cancel_at_period_end,
    new.created_at,
    new.updated_at
  )
  on conflict (company_id) do update
  set
    plan_code = excluded.plan_code,
    status = excluded.status,
    trial_ends_at = excluded.trial_ends_at,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    updated_at = timezone('utc', now());

  -- Mirror billing fields back to empresas
  -- (all columns guaranteed to exist: added in SECTION 0 above)
  update public.empresas
  set
    subscription_plan = coalesce(selected_plan.code, new.plan_code),
    subscription_status = new.status,
    monthly_send_limit = case
      when monthly_limit > 0 then monthly_limit
      else monthly_send_limit
    end,
    billing_cycle_start = coalesce(new.current_period_start::date, billing_cycle_start, current_date),
    billing_cycle_end = coalesce(new.current_period_end::date, billing_cycle_end),
    automatic_send_enabled = case
      when selected_plan.code in ('pro', 'business') then true
      else false
    end
  where id = new.company_id;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- SECTION 7: Sync triggers
-- ------------------------------------------------------------
drop trigger if exists trg_sync_plan_legacy_tables on public.plans;
create trigger trg_sync_plan_legacy_tables
after insert or update on public.plans
for each row
execute function public.sync_plan_legacy_tables();

drop trigger if exists trg_sync_subscription_legacy_tables on public.subscriptions;
create trigger trg_sync_subscription_legacy_tables
after insert or update on public.subscriptions
for each row
execute function public.sync_subscription_legacy_tables();

-- ------------------------------------------------------------
-- SECTION 8: Seed plan catalogue
-- (on conflict: update so reruns are safe)
-- ------------------------------------------------------------
insert into public.plans (
  code,
  name,
  description,
  price_cents,
  currency,
  billing_period,
  trial_days,
  limits_json,
  features_json,
  active,
  highlighted
)
values
  (
    'starter',
    'Starter',
    'Operacao assistida para empresas em ativacao.',
    19700,
    'brl',
    'monthly',
    7,
    '{"users_count": 2, "companies_count": 1, "charges_month": 500, "automations_month": 100, "integrations_count": 2, "imports_month": 50}'::jsonb,
    '["basic_import", "manual_automation", "basic_dashboard", "billing_center", "google_sheets", "zapi"]'::jsonb,
    true,
    false
  ),
  (
    'pro',
    'Pro',
    'Automacao inteligente com mais volume operacional.',
    39700,
    'brl',
    'monthly',
    7,
    '{"users_count": 3, "companies_count": 1, "charges_month": 2000, "automations_month": 500, "integrations_count": 4, "imports_month": 300}'::jsonb,
    '["basic_import", "manual_automation", "advanced_automation", "billing_center", "analytics", "google_sheets", "zapi"]'::jsonb,
    true,
    true
  ),
  (
    'business',
    'Business',
    'Camada enterprise multiempresa com alto volume.',
    79700,
    'brl',
    'monthly',
    7,
    '{"users_count": 10, "companies_count": 3, "charges_month": 10000, "automations_month": 2000, "integrations_count": 10, "imports_month": 2000}'::jsonb,
    '["basic_import", "manual_automation", "advanced_automation", "billing_center", "analytics", "executive_dashboard", "full_audit", "google_sheets", "zapi"]'::jsonb,
    true,
    false
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  billing_period = excluded.billing_period,
  trial_days = excluded.trial_days,
  limits_json = excluded.limits_json,
  features_json = excluded.features_json,
  active = excluded.active,
  highlighted = excluded.highlighted;

-- ------------------------------------------------------------
-- SECTION 9: Bootstrap subscriptions from existing companies
--
-- FIX (original error): removed e.subscription_status from coalesce.
--   BEFORE: coalesce(cs.status, e.subscription_status, 'trialing')
--   AFTER:  coalesce(cs.status, 'trialing')
--   Reason: empresas.subscription_status may not exist on the remote DB
--           when this migration runs. The column is guaranteed to exist
--           AFTER this migration (see SECTION 0), but reading it in the
--           SELECT before it has been populated is unnecessary — cs.status
--           from company_subscriptions is the authoritative legacy source.
--
-- FIX: e.subscription_plan kept but is now safe because SECTION 0
--      guarantees the column exists before this SELECT runs.
--
-- Skips companies that already have a row in public.subscriptions
-- (idempotent: safe to rerun).
-- ------------------------------------------------------------
insert into public.subscriptions (
  company_id,
  plan_id,
  plan_code,
  status,
  provider,
  trial_starts_at,
  trial_ends_at,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  metadata
)
select
  e.id,
  p.id,
  coalesce(p.code, 'starter'),
  coalesce(cs.status, 'trialing'),
  'stripe',
  coalesce(cs.current_period_start, timezone('utc', now())),
  coalesce(cs.trial_ends_at, timezone('utc', now()) + interval '7 days'),
  coalesce(cs.current_period_start, timezone('utc', now())),
  coalesce(cs.current_period_end, timezone('utc', now()) + interval '7 days'),
  coalesce(cs.cancel_at_period_end, false),
  jsonb_build_object('migrated_from_legacy', true)
from public.empresas e
left join public.company_subscriptions cs on cs.company_id = e.id
left join public.plans p on p.code = coalesce(cs.plan_code, e.subscription_plan, 'starter')
where not exists (
  select 1
  from public.subscriptions s
  where s.company_id = e.id
);
