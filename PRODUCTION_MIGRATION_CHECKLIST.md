# Checklist de Migrations de Produção — BankExtract

## Objetivo
Validar a aplicação segura das migrations recentes no banco real do BankExtract, sem perda de dados e com confirmação de RLS, policies e dependências operacionais.

## Migrations revisadas
1. `supabase/migrations/20260506113000_saas_phase_1.sql`
2. `supabase/migrations/20260506170000_notifications_center.sql`
3. `supabase/migrations/20260506183000_audit_logs_enrichment.sql`
4. `supabase/migrations/20260506203000_production_checklist.sql`

## Status geral
- Todas as quatro migrations são aditivas.
- Nenhuma delas contém `drop table`, `truncate`, `delete` amplo ou alteração destrutiva de dados existentes.
- O `supabase/bankextract_schema.sql` está sincronizado com os objetos criados/alterados por essas migrations.
- O principal risco operacional está na ordem de aplicação e na dependência do schema-base já existir, especialmente:
  - `public.empresas`
  - `public.audit_logs`
  - `public.usage_counters`
  - funções auxiliares de segurança:
    - `public.user_has_company_access`
    - `public.user_can_write_company`
    - `public.user_can_delete_company`
    - `public.is_system_admin`
    - `public.set_updated_at`

## Ordem correta de aplicação
Aplicar na seguinte ordem:

1. `20260506113000_saas_phase_1.sql`
2. `20260506170000_notifications_center.sql`
3. `20260506183000_audit_logs_enrichment.sql`
4. `20260506203000_production_checklist.sql`

Motivo:
- a fase SaaS cria a base comercial interna
- notificações dependem de `empresas` e helpers de RLS já existentes
- auditoria enriquecida assume que `audit_logs` já existe
- checklist de produção depende de `empresas`, `set_updated_at()` e helpers de acesso

## Comandos sugeridos

### Opção 1 — Supabase CLI
```bash
supabase db push
```

### Opção 2 — Aplicação controlada por arquivo
```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260506113000_saas_phase_1.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260506170000_notifications_center.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260506183000_audit_logs_enrichment.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260506203000_production_checklist.sql
```

### Opção 3 — Execução manual no SQL Editor do Supabase
- Aplicar um arquivo por vez, na ordem acima.
- Validar cada etapa antes de seguir para a próxima.

## Revisão por migration

### 1. `20260506113000_saas_phase_1.sql`

#### O que faz
- cria:
  - `public.onboarding_progress`
  - `public.subscription_plans`
  - `public.company_subscriptions`
- adiciona colunas em `public.usage_counters`:
  - `imports_month`
  - `charges_month`
  - `automations_month`
  - `users_count`
- cria constraints e índices
- habilita RLS
- recria policies
- cria trigger `trg_company_subscriptions_updated_at`
- faz seed de planos
- cria trial `starter` para empresas existentes sem assinatura

#### Idempotência
- boa, em geral:
  - `create table if not exists`
  - `add column if not exists`
  - `create index if not exists`
  - `drop policy if exists`
  - seeds com `on conflict (code) do update`
  - trial inicial com `where not exists`
- ponto de atenção:
  - depende de `public.usage_counters` já existir
  - depende de `public.set_updated_at()` já existir
  - depende dos helpers de RLS já existirem

#### RLS / policies
- `onboarding_progress`: ok
- `subscription_plans`: ok
- `company_subscriptions`: ok

#### Risco
- baixo, desde que o schema-base já esteja aplicado

---

### 2. `20260506170000_notifications_center.sql`

#### O que faz
- cria `public.notifications`
- aplica constraint de status
- cria índices
- habilita RLS
- cria policies de select/insert/update/delete

#### Idempotência
- boa:
  - `create table if not exists`
  - `drop constraint` protegido por bloco `do $$`
  - `create index if not exists`
  - `drop policy if exists`

#### RLS / policies
- `notifications_select_access`: ok
- `notifications_insert_access`: ok
- `notifications_update_access`: ok
- `notifications_delete_access`: ok

#### Risco
- baixo

---

### 3. `20260506183000_audit_logs_enrichment.sql`

#### O que faz
- adiciona em `public.audit_logs`:
  - `title`
  - `description`
  - `severity`
- recria `check` de severidade
- cria índice por severidade

#### Idempotência
- boa:
  - `add column if not exists`
  - `drop constraint` protegido por bloco `do $$`
  - `create index if not exists`

#### RLS / policies
- esta migration não recria RLS porque `audit_logs` já tem RLS e policies no schema consolidado
- validação no schema:
  - `alter table public.audit_logs enable row level security`
  - policies de acesso já estão presentes

#### Risco
- baixo
- dependência: `public.audit_logs` precisa existir antes

---

### 4. `20260506203000_production_checklist.sql`

#### O que faz
- cria `public.production_checklist_items`
- adiciona constraint de status
- cria índices
- habilita RLS
- cria policies
- cria trigger `trg_production_checklist_items_updated_at`

#### Idempotência
- boa:
  - `create table if not exists`
  - `drop constraint` protegido por bloco `do $$`
  - `create index if not exists`
  - `drop policy if exists`
  - `drop trigger if exists`

#### RLS / policies
- `production_checklist_items_select_access`: ok
- `production_checklist_items_insert_access`: ok
- `production_checklist_items_update_access`: ok
- `production_checklist_items_delete_access`: ok

#### Risco
- baixo
- dependência: `public.set_updated_at()` e helpers de company access já precisam existir

## Problemas encontrados

### 1. Dependências implícitas do schema-base
As migrations recentes são seguras, mas não são independentes do schema legado/base. Elas assumem a existência de tabelas e funções anteriores.

Impacto:
- aplicar isoladamente em um banco vazio pode falhar

Mitigação:
- garantir que o banco real já esteja no estado do `bankextract_schema.sql` base ou que as migrations antigas já tenham sido aplicadas antes

### 2. `audit_logs_enrichment` não recria RLS
Isso não é um erro, porque a tabela `audit_logs` já está protegida no schema consolidado. Mas é um ponto de validação manual pós-migration para ambiente real.

## Validações pós-migration

### Estrutura
Executar:
```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'onboarding_progress',
    'subscription_plans',
    'company_subscriptions',
    'notifications',
    'production_checklist_items'
  )
order by table_name;
```

### Colunas críticas
```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'usage_counters'
  and column_name in ('imports_month', 'charges_month', 'automations_month', 'users_count')
order by column_name;
```

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'audit_logs'
  and column_name in ('title', 'description', 'severity')
order by column_name;
```

### RLS habilitado
```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'onboarding_progress',
    'subscription_plans',
    'company_subscriptions',
    'notifications',
    'audit_logs',
    'production_checklist_items'
  )
order by tablename;
```

### Policies
```sql
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in (
    'onboarding_progress',
    'subscription_plans',
    'company_subscriptions',
    'notifications',
    'audit_logs',
    'production_checklist_items'
  )
order by tablename, policyname;
```

### Seed de planos
```sql
select code, name, active
from public.subscription_plans
order by code;
```

### Trial para empresas existentes
```sql
select e.id, e.nome, cs.plan_code, cs.status, cs.trial_ends_at
from public.empresas e
left join public.company_subscriptions cs on cs.company_id = e.id
order by e.nome;
```

### Trigger de updated_at
```sql
select trigger_name, event_object_table
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('company_subscriptions', 'production_checklist_items')
order by event_object_table, trigger_name;
```

## Checklist funcional pós-migration
- abrir login normalmente
- conferir onboarding
- conferir planos/billing
- conferir notifications
- conferir auditoria visual
- conferir checklist de produção
- validar que uma empresa existente recebeu assinatura `starter/trialing`
- validar que `usage_counters` continua lendo e gravando

## Rollback manual se algo falhar

### Princípio
Como as migrations são aditivas, o rollback deve ser manual e controlado. Evitar rollback automático em produção sem backup.

### Antes de aplicar
- gerar backup do banco
- registrar timestamp e ambiente
- aplicar em staging antes de produção

### Rollback sugerido por bloco

#### Reverter checklist de produção
```sql
drop table if exists public.production_checklist_items cascade;
```

#### Reverter notificações
```sql
drop table if exists public.notifications cascade;
```

#### Reverter enriquecimento de auditoria
Se necessário e somente se a aplicação não depender mais dos campos:
```sql
alter table public.audit_logs drop column if exists title;
alter table public.audit_logs drop column if exists description;
alter table public.audit_logs drop column if exists severity;
drop index if exists idx_audit_logs_severity;
```

#### Reverter SaaS Fase 1
Somente com muito cuidado, porque pode afetar dados já criados:
```sql
drop table if exists public.onboarding_progress cascade;
drop table if exists public.company_subscriptions cascade;
drop table if exists public.subscription_plans cascade;
```

E, se realmente necessário:
```sql
alter table public.usage_counters drop column if exists imports_month;
alter table public.usage_counters drop column if exists charges_month;
alter table public.usage_counters drop column if exists automations_month;
alter table public.usage_counters drop column if exists users_count;
```

### Rollback preferido em produção
- restaurar backup
- ou reverter apenas o objeto novo que causou falha
- evitar remover dados gerados depois da aplicação se já houver uso real

## Recomendação final
- aplicar primeiro em staging
- validar login, empresa ativa, onboarding, billing, notifications, audit e production checklist
- só depois promover para produção
- manter backup imediatamente anterior à aplicação
