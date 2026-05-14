-- ─────────────────────────────────────────────────────────────────────────────
-- Observability Platform: métricas, eventos, inteligência, auditoria enterprise
-- Todas as alterações são aditivas (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- Seguro para executar em dados existentes
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. billing_events — event bus interno ────────────────────────────────────
create table if not exists public.billing_events (
  id               uuid        primary key default gen_random_uuid(),
  company_id       uuid        not null,
  event_type       text        not null,
  created_at       timestamptz not null default now()
);

-- Back-fill columns that may be absent if the table was created in an earlier form
alter table public.billing_events
  add column if not exists correlation_id    text,
  add column if not exists trace_id          text,
  add column if not exists request_id        text,
  add column if not exists registro_id       uuid,
  add column if not exists charge_id         text,
  add column if not exists actor_id          uuid,
  add column if not exists actor_type        text        not null default 'system',
  add column if not exists payload           jsonb       not null default '{}',
  add column if not exists metadata          jsonb       not null default '{}',
  add column if not exists status            text        not null default 'published',
  add column if not exists retry_count       integer     not null default 0,
  add column if not exists dead_letter       boolean     not null default false,
  add column if not exists dead_letter_at    timestamptz,
  add column if not exists dead_letter_reason text,
  add column if not exists processed_at      timestamptz;

comment on table public.billing_events is
  'Internal event bus: boleto_match_found, whatsapp_sent, circuit_opened, ocr_used, payment_detected, etc.';

create index if not exists idx_be_company_type
  on public.billing_events(company_id, event_type, created_at desc);

create index if not exists idx_be_correlation
  on public.billing_events(correlation_id)
  where correlation_id is not null;

create index if not exists idx_be_dead_letter
  on public.billing_events(dead_letter, created_at desc)
  where dead_letter = true;

create index if not exists idx_be_registro
  on public.billing_events(registro_id)
  where registro_id is not null;

alter table public.billing_events enable row level security;

do $$ begin
  create policy "be_company_read" on public.billing_events
    for select using (
      company_id in (
        select company_id from public.usuarios_empresas where user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

-- ── 2. billing_metrics_daily — pré-agregação diária por empresa ───────────────
create table if not exists public.billing_metrics_daily (
  id          uuid  primary key default gen_random_uuid(),
  company_id  uuid  not null,
  metric_date date  not null,
  created_at  timestamptz not null default now(),
  unique (company_id, metric_date)
);

alter table public.billing_metrics_daily
  add column if not exists total_sent               integer     not null default 0,
  add column if not exists total_delivered          integer     not null default 0,
  add column if not exists total_read               integer     not null default 0,
  add column if not exists total_failed             integer     not null default 0,
  add column if not exists total_simulated          integer     not null default 0,
  add column if not exists total_paid               integer     not null default 0,
  add column if not exists total_recovered_value    numeric(15,2) not null default 0,
  add column if not exists total_found              integer     not null default 0,
  add column if not exists total_conflict           integer     not null default 0,
  add column if not exists total_low_confidence     integer     not null default 0,
  add column if not exists total_ocr_used           integer     not null default 0,
  add column if not exists total_retries            integer     not null default 0,
  add column if not exists total_circuit_activations integer    not null default 0,
  add column if not exists avg_send_latency_ms      integer,
  add column if not exists avg_read_latency_ms      integer,
  add column if not exists p95_send_latency_ms      integer,
  add column if not exists recovery_rate            numeric(5,2),
  add column if not exists conversion_rate          numeric(5,2),
  add column if not exists error_rate               numeric(5,2),
  add column if not exists conflict_rate            numeric(5,2),
  add column if not exists ocr_usage_rate           numeric(5,2),
  add column if not exists computed_at              timestamptz not null default now();

comment on table public.billing_metrics_daily is
  'Pre-aggregated daily metrics per company for fast dashboard queries';

create index if not exists idx_bmd_company_date
  on public.billing_metrics_daily(company_id, metric_date desc);

alter table public.billing_metrics_daily enable row level security;

do $$ begin
  create policy "bmd_company_read" on public.billing_metrics_daily
    for select using (
      company_id in (
        select company_id from public.usuarios_empresas where user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

-- ── 3. customer_financial_profiles — inteligência de pagamento ────────────────
create table if not exists public.customer_financial_profiles (
  id          uuid  primary key default gen_random_uuid(),
  company_id  uuid  not null,
  cliente_id  text  not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, cliente_id)
);

alter table public.customer_financial_profiles
  add column if not exists cliente_nome              text,
  add column if not exists documento                 text,
  add column if not exists total_invoices            integer     not null default 0,
  add column if not exists total_paid                integer     not null default 0,
  add column if not exists total_defaulted           integer     not null default 0,
  add column if not exists total_recovered           integer     not null default 0,
  add column if not exists avg_days_to_pay           numeric(6,2),
  add column if not exists max_days_overdue          integer,
  add column if not exists broken_promises           integer     not null default 0,
  add column if not exists total_value               numeric(15,2) not null default 0,
  add column if not exists total_recovered_value     numeric(15,2) not null default 0,
  add column if not exists total_open_value          numeric(15,2) not null default 0,
  add column if not exists payment_score             integer     not null default 50,
  add column if not exists default_risk_score        integer     not null default 50,
  add column if not exists response_probability      integer     not null default 50,
  add column if not exists payment_probability       integer     not null default 50,
  add column if not exists best_send_hour            smallint,
  add column if not exists best_send_day_of_week     smallint,
  add column if not exists best_template             text,
  add column if not exists seasonality_pattern       jsonb       default '{}',
  add column if not exists is_recurrent_defaulter    boolean     not null default false,
  add column if not exists is_critical               boolean     not null default false,
  add column if not exists is_high_risk              boolean     not null default false,
  add column if not exists trend                     text        not null default 'stable',
  add column if not exists last_charge_at            timestamptz,
  add column if not exists last_payment_at           timestamptz,
  add column if not exists computed_at               timestamptz not null default now();

comment on table public.customer_financial_profiles is
  'Customer financial intelligence: payment score, risk, best timing, seasonality';

create index if not exists idx_cfp_company_risk
  on public.customer_financial_profiles(company_id, default_risk_score desc);

create index if not exists idx_cfp_company_score
  on public.customer_financial_profiles(company_id, payment_score);

create index if not exists idx_cfp_critical
  on public.customer_financial_profiles(company_id, is_critical)
  where is_critical = true;

alter table public.customer_financial_profiles enable row level security;

do $$ begin
  create policy "cfp_company_read" on public.customer_financial_profiles
    for select using (
      company_id in (
        select company_id from public.usuarios_empresas where user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

-- ── 4. collection_intelligence_scores — priorização automática ───────────────
create table if not exists public.collection_intelligence_scores (
  id          uuid  primary key default gen_random_uuid(),
  company_id  uuid  not null,
  registro_id uuid  not null,
  computed_at timestamptz not null default now(),
  unique (company_id, registro_id)
);

alter table public.collection_intelligence_scores
  add column if not exists priority_score          integer     not null default 50,
  add column if not exists urgency_level           text        not null default 'normal',
  add column if not exists recommended_template    text,
  add column if not exists recommended_hour        smallint,
  add column if not exists predicted_payment_prob  integer     not null default 50,
  add column if not exists strategy_notes          text[],
  add column if not exists factors                 jsonb       not null default '{}',
  add column if not exists expires_at              timestamptz not null default (now() + interval '24 hours');

comment on table public.collection_intelligence_scores is
  'Daily-computed charge prioritization and strategy recommendations';

create index if not exists idx_cis_company_priority
  on public.collection_intelligence_scores(company_id, priority_score desc, expires_at desc);

alter table public.collection_intelligence_scores enable row level security;

do $$ begin
  create policy "cis_company_read" on public.collection_intelligence_scores
    for select using (
      company_id in (
        select company_id from public.usuarios_empresas where user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

-- ── 5. operational_alerts — alertas com estado ───────────────────────────────
create table if not exists public.operational_alerts (
  id         uuid  primary key default gen_random_uuid(),
  company_id uuid,
  alert_type text  not null,
  created_at timestamptz not null default now()
);

alter table public.operational_alerts
  add column if not exists severity         text        not null default 'warning',
  add column if not exists title            text        not null default '',
  add column if not exists message          text        not null default '',
  add column if not exists context          jsonb       not null default '{}',
  add column if not exists acknowledged     boolean     not null default false,
  add column if not exists acknowledged_by  uuid,
  add column if not exists acknowledged_at  timestamptz,
  add column if not exists auto_resolved    boolean     not null default false,
  add column if not exists resolved_at      timestamptz;

create index if not exists idx_oa_company_active
  on public.operational_alerts(company_id, created_at desc)
  where acknowledged = false;

create index if not exists idx_oa_severity
  on public.operational_alerts(severity, created_at desc)
  where acknowledged = false;

alter table public.operational_alerts enable row level security;

do $$ begin
  create policy "oa_company_read" on public.operational_alerts
    for select using (
      company_id is null or
      company_id in (
        select company_id from public.usuarios_empresas where user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

-- ── 6. Colunas adicionais em automation_audit_logs ────────────────────────────
alter table public.automation_audit_logs
  add column if not exists trace_id          text,
  add column if not exists correlation_id    text,
  add column if not exists session_id        text,
  add column if not exists ip_address        text,
  add column if not exists user_agent        text,
  add column if not exists diff_before       jsonb,
  add column if not exists diff_after        jsonb,
  add column if not exists replay_available  boolean not null default false;

create index if not exists idx_aal_trace
  on public.automation_audit_logs(trace_id)
  where trace_id is not null;

create index if not exists idx_aal_correlation
  on public.automation_audit_logs(correlation_id)
  where correlation_id is not null;

-- ── 7. Colunas adicionais em registros_financeiros (intelligence) ─────────────
alter table public.registros_financeiros
  add column if not exists intelligence_score       integer,
  add column if not exists intelligence_priority    text,
  add column if not exists intelligence_template    text,
  add column if not exists intelligence_hour        smallint,
  add column if not exists intelligence_computed_at timestamptz,
  add column if not exists payment_probability      integer,
  add column if not exists default_risk             integer;

-- ── 8. Índices estratégicos para performance ──────────────────────────────────
create index if not exists idx_rf_company_status_venc
  on public.registros_financeiros(company_id, status, data_vencimento)
  where status not in ('pago', 'liquidado', 'cancelado');

create index if not exists idx_rf_company_venc_valor
  on public.registros_financeiros(company_id, data_vencimento, valor);

create index if not exists idx_rf_boleto_status
  on public.registros_financeiros(company_id, boleto_status)
  where boleto_status is not null;

create index if not exists idx_cw_company_status_sent
  on public.cobrancas_whatsapp(company_id, status, sent_at desc)
  where sent_at is not null;

create index if not exists idx_cw_registro_status
  on public.cobrancas_whatsapp(registro_id, status);

create index if not exists idx_lc_company_data
  on public.logs_cobranca(company_id, data_hora desc)
  where data_hora is not null;

create index if not exists idx_ad_company_status_created
  on public.automation_dispatches(company_id, status, created_at desc);

-- ── 9. security_sessions — rastreamento de sessão auditada ───────────────────
create table if not exists public.security_sessions (
  id         uuid  primary key default gen_random_uuid(),
  user_id    uuid  not null,
  company_id uuid,
  created_at timestamptz not null default now()
);

alter table public.security_sessions
  add column if not exists session_token      text,
  add column if not exists ip_address         text,
  add column if not exists user_agent         text,
  add column if not exists device_fingerprint text,
  add column if not exists started_at         timestamptz not null default now(),
  add column if not exists last_active_at     timestamptz not null default now(),
  add column if not exists ended_at           timestamptz,
  add column if not exists anomaly_flags      jsonb       not null default '{}',
  add column if not exists actions_count      integer     not null default 0;

create index if not exists idx_ss_user_started
  on public.security_sessions(user_id, started_at desc);

alter table public.security_sessions enable row level security;

do $$ begin
  create policy "ss_own_read" on public.security_sessions
    for select using (user_id = auth.uid());
exception when duplicate_object then null;
end $$;
