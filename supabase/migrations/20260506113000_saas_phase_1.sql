create table if not exists public.onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  step_key text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_cents integer not null default 0,
  billing_period text not null default 'monthly',
  limits_json jsonb not null default '{}'::jsonb,
  features_json jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  plan_code text not null,
  status text not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.usage_counters
  add column if not exists imports_month integer not null default 0;

alter table if exists public.usage_counters
  add column if not exists charges_month integer not null default 0;

alter table if exists public.usage_counters
  add column if not exists automations_month integer not null default 0;

alter table if exists public.usage_counters
  add column if not exists users_count integer not null default 0;

alter table public.onboarding_progress
  drop constraint if exists onboarding_progress_company_step_key;

alter table public.onboarding_progress
  add constraint onboarding_progress_company_step_key unique (company_id, step_key);

alter table public.company_subscriptions
  drop constraint if exists company_subscriptions_company_id_key;

alter table public.company_subscriptions
  add constraint company_subscriptions_company_id_key unique (company_id);

alter table public.company_subscriptions
  drop constraint if exists company_subscriptions_plan_code_fkey;

alter table public.company_subscriptions
  add constraint company_subscriptions_plan_code_fkey
  foreign key (plan_code) references public.subscription_plans(code);

alter table public.company_subscriptions
  drop constraint if exists company_subscriptions_status_check;

alter table public.company_subscriptions
  add constraint company_subscriptions_status_check
  check (status in ('active', 'trialing', 'past_due', 'canceled'));

create index if not exists idx_onboarding_progress_company_id on public.onboarding_progress(company_id);
create index if not exists idx_onboarding_progress_step_key on public.onboarding_progress(step_key);
create index if not exists idx_company_subscriptions_status on public.company_subscriptions(status);
create index if not exists idx_company_subscriptions_plan_code on public.company_subscriptions(plan_code);

alter table public.onboarding_progress enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.company_subscriptions enable row level security;

drop policy if exists "onboarding_progress_select_access" on public.onboarding_progress;
drop policy if exists "onboarding_progress_insert_access" on public.onboarding_progress;
drop policy if exists "onboarding_progress_update_access" on public.onboarding_progress;
drop policy if exists "onboarding_progress_delete_access" on public.onboarding_progress;

create policy "onboarding_progress_select_access"
on public.onboarding_progress
for select
to authenticated
using (
  public.user_has_company_access(company_id)
);

create policy "onboarding_progress_insert_access"
on public.onboarding_progress
for insert
to authenticated
with check (
  public.user_can_write_company(company_id)
);

create policy "onboarding_progress_update_access"
on public.onboarding_progress
for update
to authenticated
using (
  public.user_can_write_company(company_id)
)
with check (
  public.user_can_write_company(company_id)
);

create policy "onboarding_progress_delete_access"
on public.onboarding_progress
for delete
to authenticated
using (
  public.user_can_delete_company(company_id)
);

drop policy if exists "subscription_plans_select_access" on public.subscription_plans;
drop policy if exists "subscription_plans_manage_admin" on public.subscription_plans;

create policy "subscription_plans_select_access"
on public.subscription_plans
for select
to authenticated
using (true);

create policy "subscription_plans_manage_admin"
on public.subscription_plans
for all
to authenticated
using (public.is_system_admin(auth.uid()))
with check (public.is_system_admin(auth.uid()));

drop policy if exists "company_subscriptions_select_access" on public.company_subscriptions;
drop policy if exists "company_subscriptions_insert_access" on public.company_subscriptions;
drop policy if exists "company_subscriptions_update_access" on public.company_subscriptions;
drop policy if exists "company_subscriptions_delete_access" on public.company_subscriptions;

create policy "company_subscriptions_select_access"
on public.company_subscriptions
for select
to authenticated
using (
  public.user_has_company_access(company_id)
);

create policy "company_subscriptions_insert_access"
on public.company_subscriptions
for insert
to authenticated
with check (
  public.user_can_write_company(company_id)
);

create policy "company_subscriptions_update_access"
on public.company_subscriptions
for update
to authenticated
using (
  public.user_can_write_company(company_id)
)
with check (
  public.user_can_write_company(company_id)
);

create policy "company_subscriptions_delete_access"
on public.company_subscriptions
for delete
to authenticated
using (
  public.user_can_delete_company(company_id)
);

drop trigger if exists trg_company_subscriptions_updated_at on public.company_subscriptions;
create trigger trg_company_subscriptions_updated_at
before update on public.company_subscriptions
for each row
execute function public.set_updated_at();

insert into public.subscription_plans (code, name, price_cents, billing_period, limits_json, features_json, active)
values
  (
    'starter',
    'Starter',
    19700,
    'monthly',
    '{"charges_month": 500, "imports_month": 50, "users": 2, "companies": 1}'::jsonb,
    '["basic_import", "manual_automation", "basic_dashboard"]'::jsonb,
    true
  ),
  (
    'pro',
    'Pro',
    39700,
    'monthly',
    '{"charges_month": 2000, "imports_month": 300, "users": 3, "companies": 1}'::jsonb,
    '["basic_import", "manual_automation", "advanced_automation", "billing_center", "analytics"]'::jsonb,
    true
  ),
  (
    'business',
    'Business',
    79700,
    'monthly',
    '{"charges_month": 10000, "imports_month": 2000, "users": 10, "companies": 3}'::jsonb,
    '["basic_import", "manual_automation", "advanced_automation", "billing_center", "analytics", "executive_dashboard", "full_audit"]'::jsonb,
    true
  )
on conflict (code) do update
set
  name = excluded.name,
  price_cents = excluded.price_cents,
  billing_period = excluded.billing_period,
  limits_json = excluded.limits_json,
  features_json = excluded.features_json,
  active = excluded.active;

insert into public.company_subscriptions (
  company_id,
  plan_code,
  status,
  trial_ends_at,
  current_period_start,
  current_period_end,
  cancel_at_period_end
)
select
  e.id,
  'starter',
  'trialing',
  timezone('utc', now()) + interval '14 days',
  timezone('utc', now()),
  timezone('utc', now()) + interval '14 days',
  false
from public.empresas e
where not exists (
  select 1
  from public.company_subscriptions cs
  where cs.company_id = e.id
);
