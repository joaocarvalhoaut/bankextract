create extension if not exists pgcrypto;

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  invite_code text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.usuarios_empresas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.empresas(id) on delete cascade,
  role text not null default 'operador',
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, company_id)
);

create table if not exists public.system_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.representantes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  nome text not null,
  telefone text,
  email text,
  observacao text not null default '',
  ativo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.configuracoes_financeiras (
  company_id uuid primary key references public.empresas(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  multa_percentual numeric(10,4) not null default 2,
  juros_percentual_dia numeric(10,4) not null default 0.033,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.registros_financeiros (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  batch_id uuid,
  representante_id uuid references public.representantes(id) on delete set null,
  nome text not null,
  numero_boleto text,
  data_vencimento date not null,
  valor numeric(14,2) not null default 0,
  telefone text not null default '',
  observacao text not null default '',
  status text not null default 'pendente',
  importado_em timestamptz,
  liquidado_em timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.importacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  batch_id uuid,
  arquivo text not null,
  tipo text not null,
  registros integer not null default 0,
  valor_total numeric(14,2) not null default 0,
  status text not null default 'concluida',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cobrancas_whatsapp (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  registro_id uuid,
  telefone text not null default '',
  mensagem text not null,
  status text not null default 'preparado',
  zapi_message_id text,
  erro text,
  enviado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.logs_cobranca (
  id uuid primary key default gen_random_uuid(),
  financeiro_id uuid references public.registros_financeiros(id) on delete set null,
  company_id uuid not null references public.empresas(id) on delete cascade,
  data_hora timestamptz not null default timezone('utc', now()),
  cliente_nome text,
  cliente_numero text,
  telefone text,
  documento text,
  numero_boleto text,
  numero_nf text,
  valor numeric(14,2),
  vencimento date,
  tipo_cobranca text not null,
  dias_atraso integer not null default 0,
  arquivo_encontrado boolean not null default false,
  drive_file_id text,
  status_envio text not null,
  erro text,
  payload jsonb not null default '{}'::jsonb,
  envio_hash text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.whatsapp_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id) on delete cascade,
  ativo boolean not null default false,
  sender_name text,
  mensagem_template text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.whatsapp_cobranca_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id) on delete cascade,
  ativo boolean not null default false,
  intervalo_dias integer not null default 5,
  hora_envio time not null default '08:00',
  cobrar_apos_dias_vencido integer not null default 1,
  limite_cobrancas_por_titulo integer not null default 4,
  protesto_apos_5_dias boolean not null default true,
  canal_envio text not null default 'WhatsApp',
  regras jsonb not null default '[]'::jsonb,
  mensagem_template text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.google_sheets_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id) on delete cascade,
  spreadsheet_id text,
  sheet_name text not null default 'Pagina1',
  ativo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.empresas
  add column if not exists invite_code text;

alter table public.empresas
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.empresas
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.empresas
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.usuarios_empresas
  add column if not exists role text not null default 'operador';

alter table public.usuarios_empresas
  alter column role set default 'operador';

alter table public.audit_logs
  add column if not exists ip_address text;

alter table public.audit_logs
  add column if not exists user_agent text;

do $$
begin
  if not exists (
    select 1
    from public.audit_logs
    where company_id is null
  ) then
    alter table public.audit_logs
      alter column company_id set not null;
  end if;
exception
  when undefined_table then
    null;
end;
$$;

alter table public.registros_financeiros
  add column if not exists batch_id uuid;

alter table public.registros_financeiros
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.registros_financeiros
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.registros_financeiros
  add column if not exists cliente_nome text;

alter table public.registros_financeiros
  add column if not exists cliente_numero text;

alter table public.registros_financeiros
  add column if not exists documento text;

alter table public.registros_financeiros
  add column if not exists numero_nf text;

alter table public.registros_financeiros
  add column if not exists drive_file_id text;

alter table public.registros_financeiros
  add column if not exists preventiva_enviada boolean not null default false;

alter table public.registros_financeiros
  add column if not exists data_envio_preventiva timestamptz;

alter table public.registros_financeiros
  add column if not exists cobranca_vencimento_enviada boolean not null default false;

alter table public.registros_financeiros
  add column if not exists data_envio_vencimento timestamptz;

alter table public.registros_financeiros
  add column if not exists ultima_cobranca timestamptz;

alter table public.registros_financeiros
  add column if not exists tentativas_cobranca integer not null default 0;

alter table public.importacoes
  add column if not exists batch_id uuid;

alter table public.importacoes
  add column if not exists valor_total numeric(14,2) not null default 0;

alter table public.cobrancas_whatsapp
  add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;

alter table public.cobrancas_whatsapp
  add column if not exists registro_id uuid;

alter table public.cobrancas_whatsapp
  add column if not exists telefone text not null default '';

alter table public.cobrancas_whatsapp
  add column if not exists mensagem text not null default '';

alter table public.cobrancas_whatsapp
  add column if not exists status text not null default 'preparado';

alter table public.cobrancas_whatsapp
  add column if not exists zapi_message_id text;

alter table public.cobrancas_whatsapp
  add column if not exists erro text;

alter table public.cobrancas_whatsapp
  add column if not exists enviado_por uuid references auth.users(id) on delete set null;

alter table public.cobrancas_whatsapp
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.whatsapp_config
  add column if not exists ativo boolean not null default false;

alter table public.whatsapp_config
  add column if not exists sender_name text;

alter table public.whatsapp_config
  add column if not exists mensagem_template text;

alter table public.whatsapp_config
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.whatsapp_config
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.whatsapp_cobranca_config
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.whatsapp_cobranca_config
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.whatsapp_cobranca_config
  add column if not exists protesto_apos_5_dias boolean not null default true;

alter table public.whatsapp_cobranca_config
  add column if not exists canal_envio text not null default 'WhatsApp';

alter table public.whatsapp_cobranca_config
  add column if not exists regras jsonb not null default '[]'::jsonb;

alter table public.whatsapp_cobranca_config
  add column if not exists template_preventiva text;

alter table public.whatsapp_cobranca_config
  add column if not exists template_vencimento text;

alter table public.whatsapp_cobranca_config
  add column if not exists template_atraso text;

alter table public.whatsapp_cobranca_config
  add column if not exists regua_atraso jsonb not null default '[1,3,5,10,15,30]'::jsonb;

alter table public.whatsapp_cobranca_config
  add column if not exists hora_execucao time not null default '08:00';

alter table public.google_sheets_config
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.google_sheets_config
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.google_sheets_config
  add column if not exists source_spreadsheet_id text;

alter table public.google_sheets_config
  add column if not exists source_sheet_name text;

alter table public.google_sheets_config
  add column if not exists drive_root_folder_id text;

alter table public.google_sheets_config
  add column if not exists last_source_sync_at timestamptz;

alter table public.google_sheets_config
  add column if not exists last_source_sync_status text;

alter table public.google_sheets_config
  add column if not exists last_source_sync_error text;

alter table public.google_sheets_config
  alter column spreadsheet_id drop not null;

update public.empresas
set invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where invite_code is null or trim(invite_code) = '';

alter table public.empresas
  alter column invite_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

alter table public.empresas
  alter column invite_code set not null;

update public.importacoes
set batch_id = gen_random_uuid()
where batch_id is null;

alter table public.importacoes
  alter column batch_id set default gen_random_uuid();

alter table public.importacoes
  alter column batch_id set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'usuarios_empresas_role_check'
      and conrelid = 'public.usuarios_empresas'::regclass
  ) then
    alter table public.usuarios_empresas
      drop constraint usuarios_empresas_role_check;
  end if;
end;
$$;

alter table public.usuarios_empresas
  add constraint usuarios_empresas_role_check
  check (role in ('owner', 'admin', 'financeiro', 'operador', 'visualizador', 'membro', 'member'));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'registros_financeiros_status_check'
      and conrelid = 'public.registros_financeiros'::regclass
  ) then
    alter table public.registros_financeiros
      drop constraint registros_financeiros_status_check;
  end if;
end;
$$;

alter table public.registros_financeiros
  add constraint registros_financeiros_status_check
  check (status in ('pendente', 'aberto', 'vencido', 'negociacao', 'promessa', 'liquidado', 'em_aberto', 'pago', 'cancelado', 'negociado'));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'importacoes_tipo_check'
      and conrelid = 'public.importacoes'::regclass
  ) then
    alter table public.importacoes
      drop constraint importacoes_tipo_check;
  end if;
end;
$$;

alter table public.importacoes
  add constraint importacoes_tipo_check
  check (tipo in ('vencidos', 'liquidacao'));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'importacoes_status_check'
      and conrelid = 'public.importacoes'::regclass
  ) then
    alter table public.importacoes
      drop constraint importacoes_status_check;
  end if;
end;
$$;

alter table public.importacoes
  add constraint importacoes_status_check
  check (status in ('concluida', 'erro', 'processando', 'cancelada'));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'cobrancas_whatsapp_status_check'
      and conrelid = 'public.cobrancas_whatsapp'::regclass
  ) then
    alter table public.cobrancas_whatsapp
      drop constraint cobrancas_whatsapp_status_check;
  end if;
end;
$$;

alter table public.cobrancas_whatsapp
  add constraint cobrancas_whatsapp_status_check
  check (status in ('preparado', 'enviado', 'mock_enviado', 'erro', 'cancelado'));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'logs_cobranca_tipo_cobranca_check'
      and conrelid = 'public.logs_cobranca'::regclass
  ) then
    alter table public.logs_cobranca
      drop constraint logs_cobranca_tipo_cobranca_check;
  end if;
end;
$$;

alter table public.logs_cobranca
  add constraint logs_cobranca_tipo_cobranca_check
  check (tipo_cobranca in ('preventiva', 'vencimento', 'atraso'));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'logs_cobranca_status_envio_check'
      and conrelid = 'public.logs_cobranca'::regclass
  ) then
    alter table public.logs_cobranca
      drop constraint logs_cobranca_status_envio_check;
  end if;
end;
$$;

alter table public.logs_cobranca
  add constraint logs_cobranca_status_envio_check
  check (status_envio in ('sucesso', 'erro', 'ignorado'));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'cobrancas_whatsapp_registro_id_fkey'
      and conrelid = 'public.cobrancas_whatsapp'::regclass
  ) then
    alter table public.cobrancas_whatsapp
      drop constraint cobrancas_whatsapp_registro_id_fkey;
  end if;
exception
  when undefined_table then
    null;
end;
$$;

alter table public.cobrancas_whatsapp
  add constraint cobrancas_whatsapp_registro_id_fkey
  foreign key (registro_id)
  references public.registros_financeiros(id)
  on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'importacoes_batch_id_key'
      and conrelid = 'public.importacoes'::regclass
  ) then
    alter table public.importacoes
      add constraint importacoes_batch_id_key unique (batch_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_config_empresa_id_key'
      and conrelid = 'public.whatsapp_config'::regclass
  ) then
    alter table public.whatsapp_config
      add constraint whatsapp_config_empresa_id_key unique (empresa_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_cobranca_config_empresa_id_key'
      and conrelid = 'public.whatsapp_cobranca_config'::regclass
  ) then
    alter table public.whatsapp_cobranca_config
      add constraint whatsapp_cobranca_config_empresa_id_key unique (empresa_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'google_sheets_config_empresa_id_key'
      and conrelid = 'public.google_sheets_config'::regclass
  ) then
    alter table public.google_sheets_config
      add constraint google_sheets_config_empresa_id_key unique (empresa_id);
  end if;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_system_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.system_admins sa
    where sa.user_id = target_user_id
  );
$$;

create or replace function public.user_company_role(
  target_company_id uuid,
  target_user_id uuid default auth.uid()
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_system_admin(target_user_id) then 'owner'
    else (
      select ue.role
      from public.usuarios_empresas ue
      where ue.company_id = target_company_id
        and ue.user_id = target_user_id
      order by ue.created_at asc
      limit 1
    )
  end;
$$;

create or replace function public.has_company_role(
  target_company_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_system_admin(auth.uid()) then true
    when target_company_id is null then false
    else exists (
      select 1
      from public.usuarios_empresas ue
      where ue.company_id = target_company_id
        and ue.user_id = auth.uid()
        and (
          ue.role = any(allowed_roles)
          or (ue.role in ('membro', 'member') and 'operador' = any(allowed_roles))
        )
    )
  end;
$$;

create or replace function public.user_has_company_access(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_company_id is not null
    and (
      public.is_system_admin(auth.uid())
      or exists (
        select 1
        from public.usuarios_empresas ue
        where ue.company_id = target_company_id
          and ue.user_id = auth.uid()
      )
    );
$$;

create or replace function public.user_can_write_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_company_role(target_company_id, array['owner', 'admin', 'financeiro', 'operador']);
$$;

create or replace function public.user_can_delete_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_company_role(target_company_id, array['owner', 'admin', 'financeiro']);
$$;

create or replace function public.delete_import_batch(
  p_company_id uuid,
  p_history_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  target_import public.importacoes;
  target_company_id uuid;
  deleted_financial_records_count integer := 0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if public.is_system_admin(current_user_id) then
    select *
      into target_import
    from public.importacoes
    where id = p_history_id
      and (p_company_id is null or company_id = p_company_id)
    limit 1;
  else
    if p_company_id is null then
      raise exception 'company_id obrigatorio para esta operacao.';
    end if;

    if not public.has_company_role(p_company_id, array['owner', 'admin', 'financeiro']) then
      raise exception 'Sem permissao para excluir historico desta empresa.';
    end if;

    select *
      into target_import
    from public.importacoes
    where id = p_history_id
      and company_id = p_company_id
    limit 1;
  end if;

  if target_import.id is null then
    raise exception 'Lote de historico nao encontrado.';
  end if;

  target_company_id := target_import.company_id;

  if target_import.tipo = 'vencidos' and target_import.batch_id is not null then
    delete from public.registros_financeiros
    where company_id = target_company_id
      and batch_id = target_import.batch_id;

    get diagnostics deleted_financial_records_count = row_count;
  elsif target_import.tipo = 'vencidos' and target_import.batch_id is null then
    delete from public.registros_financeiros
    where company_id = target_company_id
      and importado_em = target_import.created_at;

    get diagnostics deleted_financial_records_count = row_count;
  end if;

  delete from public.importacoes
  where id = target_import.id
    and company_id = target_company_id;

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    entity,
    entity_id,
    metadata
  )
  values (
    target_company_id,
    current_user_id,
    'history_deleted',
    'importacoes',
    target_import.id::text,
    jsonb_build_object(
      'tipo', target_import.tipo,
      'batch_id', target_import.batch_id,
      'deleted_financial_records_count', deleted_financial_records_count
    )
  );

  return jsonb_build_object(
    'deleted_history_id', target_import.id,
    'deleted_financial_records_count', deleted_financial_records_count,
    'tipo', target_import.tipo,
    'batch_id', target_import.batch_id
  );
end;
$$;

create or replace function public.generate_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_code text;
begin
  loop
    next_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
      || '-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));

    exit when not exists (
      select 1
      from public.empresas
      where invite_code = next_code
    );
  end loop;

  return next_code;
end;
$$;

create or replace function public.create_empresa_with_admin(p_nome text, p_cnpj text default null)
returns public.empresas
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  new_company public.empresas;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.is_system_admin(current_user_id) then
    raise exception 'Somente administrador geral pode criar empresas.';
  end if;

  if trim(coalesce(p_nome, '')) = '' then
    raise exception 'Nome da empresa e obrigatorio.';
  end if;

  insert into public.empresas (
    nome,
    cnpj,
    invite_code,
    created_by
  )
  values (
    trim(p_nome),
    nullif(trim(coalesce(p_cnpj, '')), ''),
    public.generate_invite_code(),
    current_user_id
  )
  returning * into new_company;

  insert into public.usuarios_empresas (
    user_id,
    company_id,
    role
  )
  values (
    current_user_id,
    new_company.id,
    'admin'
  )
  on conflict (user_id, company_id) do update
    set role = excluded.role;

  insert into public.configuracoes_financeiras (
    company_id,
    user_id,
    multa_percentual,
    juros_percentual_dia
  )
  values (
    new_company.id,
    current_user_id,
    2,
    0.033
  )
  on conflict (company_id) do nothing;

  return new_company;
end;
$$;

create or replace function public.join_empresa_by_invite_code(p_invite_code text)
returns public.empresas
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  target_company public.empresas;
  normalized_code text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  normalized_code := upper(regexp_replace(trim(coalesce(p_invite_code, '')), '\s+', '', 'g'));

  if normalized_code = '' then
    raise exception 'Codigo de convite invalido.';
  end if;

  select *
  into target_company
  from public.empresas
  where invite_code = normalized_code
  limit 1;

  if target_company.id is null then
    raise exception 'Codigo de convite nao encontrado.';
  end if;

  insert into public.usuarios_empresas (
    user_id,
    company_id,
    role
  )
  values (
    current_user_id,
    target_company.id,
    'membro'
  )
  on conflict (user_id, company_id) do nothing;

  insert into public.configuracoes_financeiras (
    company_id,
    user_id,
    multa_percentual,
    juros_percentual_dia
  )
  values (
    target_company.id,
    current_user_id,
    2,
    0.033
  )
  on conflict (company_id) do nothing;

  return target_company;
end;
$$;

grant execute on function public.is_system_admin(uuid) to authenticated;
grant execute on function public.user_company_role(uuid, uuid) to authenticated;
grant execute on function public.has_company_role(uuid, text[]) to authenticated;
grant execute on function public.user_has_company_access(uuid) to authenticated;
grant execute on function public.user_can_write_company(uuid) to authenticated;
grant execute on function public.user_can_delete_company(uuid) to authenticated;
grant execute on function public.delete_import_batch(uuid, uuid) to authenticated;
grant execute on function public.generate_invite_code() to authenticated;
grant execute on function public.create_empresa_with_admin(text, text) to authenticated;
grant execute on function public.join_empresa_by_invite_code(text) to authenticated;

drop trigger if exists trg_empresas_updated_at on public.empresas;
create trigger trg_empresas_updated_at
before update on public.empresas
for each row
execute function public.set_updated_at();

drop trigger if exists trg_representantes_updated_at on public.representantes;
create trigger trg_representantes_updated_at
before update on public.representantes
for each row
execute function public.set_updated_at();

drop trigger if exists trg_configuracoes_financeiras_updated_at on public.configuracoes_financeiras;
create trigger trg_configuracoes_financeiras_updated_at
before update on public.configuracoes_financeiras
for each row
execute function public.set_updated_at();

drop trigger if exists trg_registros_financeiros_updated_at on public.registros_financeiros;
create trigger trg_registros_financeiros_updated_at
before update on public.registros_financeiros
for each row
execute function public.set_updated_at();

drop trigger if exists trg_whatsapp_config_updated_at on public.whatsapp_config;
create trigger trg_whatsapp_config_updated_at
before update on public.whatsapp_config
for each row
execute function public.set_updated_at();

drop trigger if exists trg_whatsapp_cobranca_config_updated_at on public.whatsapp_cobranca_config;
create trigger trg_whatsapp_cobranca_config_updated_at
before update on public.whatsapp_cobranca_config
for each row
execute function public.set_updated_at();

drop trigger if exists trg_google_sheets_config_updated_at on public.google_sheets_config;
create trigger trg_google_sheets_config_updated_at
before update on public.google_sheets_config
for each row
execute function public.set_updated_at();

create unique index if not exists idx_empresas_invite_code on public.empresas(invite_code);
create index if not exists idx_empresas_created_at on public.empresas(created_at);
create index if not exists idx_usuarios_empresas_user_id on public.usuarios_empresas(user_id);
create index if not exists idx_usuarios_empresas_company_id on public.usuarios_empresas(company_id);
create index if not exists idx_usuarios_empresas_role on public.usuarios_empresas(role);
create index if not exists idx_system_admins_user_id on public.system_admins(user_id);
create index if not exists idx_system_admins_email on public.system_admins(email);
create index if not exists idx_representantes_company_id on public.representantes(company_id);
create index if not exists idx_representantes_created_at on public.representantes(created_at);
create index if not exists idx_configuracoes_financeiras_company_id on public.configuracoes_financeiras(company_id);
create index if not exists idx_registros_financeiros_company_id on public.registros_financeiros(company_id);
create index if not exists idx_registros_financeiros_batch_id on public.registros_financeiros(batch_id);
create index if not exists idx_registros_financeiros_company_batch_id on public.registros_financeiros(company_id, batch_id);
create index if not exists idx_registros_financeiros_created_at on public.registros_financeiros(created_at);
create index if not exists idx_registros_financeiros_numero_boleto on public.registros_financeiros(numero_boleto);
create index if not exists idx_importacoes_company_id on public.importacoes(company_id);
create index if not exists idx_importacoes_batch_id on public.importacoes(batch_id);
create index if not exists idx_importacoes_company_batch_id on public.importacoes(company_id, batch_id);
create index if not exists idx_importacoes_created_at on public.importacoes(created_at);
create index if not exists idx_audit_logs_company_id on public.audit_logs(company_id);
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_audit_logs_action on public.audit_logs(action);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at);
create index if not exists idx_cobrancas_whatsapp_empresa_id on public.cobrancas_whatsapp(empresa_id);
create index if not exists idx_cobrancas_whatsapp_registro_id on public.cobrancas_whatsapp(registro_id);
create index if not exists idx_cobrancas_whatsapp_status on public.cobrancas_whatsapp(status);
create index if not exists idx_cobrancas_whatsapp_created_at on public.cobrancas_whatsapp(created_at);
create index if not exists idx_logs_cobranca_company_id on public.logs_cobranca(company_id);
create index if not exists idx_logs_cobranca_financeiro_id on public.logs_cobranca(financeiro_id);
create index if not exists idx_logs_cobranca_tipo_cobranca on public.logs_cobranca(tipo_cobranca);
create index if not exists idx_logs_cobranca_created_at on public.logs_cobranca(created_at);
create unique index if not exists idx_logs_cobranca_envio_hash on public.logs_cobranca(envio_hash) where envio_hash is not null;
create index if not exists idx_whatsapp_config_empresa_id on public.whatsapp_config(empresa_id);
create index if not exists idx_whatsapp_cobranca_config_empresa_id on public.whatsapp_cobranca_config(empresa_id);
create index if not exists idx_google_sheets_config_empresa_id on public.google_sheets_config(empresa_id);
create index if not exists idx_google_sheets_config_updated_at on public.google_sheets_config(updated_at);

alter table public.empresas enable row level security;
alter table public.usuarios_empresas enable row level security;
alter table public.system_admins enable row level security;
alter table public.representantes enable row level security;
alter table public.configuracoes_financeiras enable row level security;
alter table public.registros_financeiros enable row level security;
alter table public.importacoes enable row level security;
alter table public.audit_logs enable row level security;
alter table public.cobrancas_whatsapp enable row level security;
alter table public.logs_cobranca enable row level security;
alter table public.whatsapp_config enable row level security;
alter table public.whatsapp_cobranca_config enable row level security;
alter table public.google_sheets_config enable row level security;

drop policy if exists "empresas_select_access" on public.empresas;
drop policy if exists "empresas_select_member" on public.empresas;
drop policy if exists "empresas_select_system_admin" on public.empresas;
drop policy if exists "empresas_insert_system_admin" on public.empresas;
drop policy if exists "empresas_insert_authenticated" on public.empresas;
drop policy if exists "empresas_insert_self" on public.empresas;
drop policy if exists "empresas_update_write" on public.empresas;
drop policy if exists "empresas_update_admin" on public.empresas;
drop policy if exists "empresas_delete_write" on public.empresas;
drop policy if exists "empresas_delete_admin" on public.empresas;

create policy "empresas_select_access"
on public.empresas
for select
to authenticated
using (
  public.user_has_company_access(empresas.id)
);

create policy "empresas_insert_system_admin"
on public.empresas
for insert
to authenticated
with check (
  public.is_system_admin(auth.uid())
);

create policy "empresas_update_write"
on public.empresas
for update
to authenticated
using (
  public.user_can_write_company(empresas.id)
)
with check (
  public.user_can_write_company(empresas.id)
);

create policy "empresas_delete_write"
on public.empresas
for delete
to authenticated
using (
  public.user_can_delete_company(empresas.id)
);

drop policy if exists "usuarios_empresas_select_access" on public.usuarios_empresas;
drop policy if exists "usuarios_empresas_select_self" on public.usuarios_empresas;
drop policy if exists "usuarios_empresas_insert_access" on public.usuarios_empresas;
drop policy if exists "usuarios_empresas_insert_self" on public.usuarios_empresas;
drop policy if exists "usuarios_empresas_update_access" on public.usuarios_empresas;
drop policy if exists "usuarios_empresas_delete_access" on public.usuarios_empresas;

create policy "usuarios_empresas_select_access"
on public.usuarios_empresas
for select
to authenticated
using (
  auth.uid() = user_id
  or public.user_has_company_access(company_id)
);

create policy "usuarios_empresas_insert_access"
on public.usuarios_empresas
for insert
to authenticated
with check (
  public.is_system_admin(auth.uid())
  or public.user_can_delete_company(company_id)
);

create policy "usuarios_empresas_update_access"
on public.usuarios_empresas
for update
to authenticated
using (
  public.is_system_admin(auth.uid())
  or public.user_can_delete_company(company_id)
)
with check (
  public.is_system_admin(auth.uid())
  or public.user_can_delete_company(company_id)
);

create policy "usuarios_empresas_delete_access"
on public.usuarios_empresas
for delete
to authenticated
using (
  public.is_system_admin(auth.uid())
  or public.user_can_delete_company(company_id)
);

drop policy if exists "system_admins_select_access" on public.system_admins;
drop policy if exists "system_admins_select_self" on public.system_admins;
drop policy if exists "system_admins_insert_access" on public.system_admins;
drop policy if exists "system_admins_update_access" on public.system_admins;
drop policy if exists "system_admins_delete_access" on public.system_admins;

create policy "system_admins_select_access"
on public.system_admins
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_system_admin(auth.uid())
);

create policy "system_admins_insert_access"
on public.system_admins
for insert
to authenticated
with check (
  public.is_system_admin(auth.uid())
);

create policy "system_admins_update_access"
on public.system_admins
for update
to authenticated
using (
  public.is_system_admin(auth.uid())
)
with check (
  public.is_system_admin(auth.uid())
);

create policy "system_admins_delete_access"
on public.system_admins
for delete
to authenticated
using (
  public.is_system_admin(auth.uid())
);

drop policy if exists "representantes_select_access" on public.representantes;
drop policy if exists "representantes_select" on public.representantes;
drop policy if exists "representantes_insert_access" on public.representantes;
drop policy if exists "representantes_insert" on public.representantes;
drop policy if exists "representantes_update_access" on public.representantes;
drop policy if exists "representantes_update" on public.representantes;
drop policy if exists "representantes_delete_access" on public.representantes;
drop policy if exists "representantes_delete" on public.representantes;

create policy "representantes_select_access"
on public.representantes
for select
to authenticated
using (
  public.user_has_company_access(company_id)
);

create policy "representantes_insert_access"
on public.representantes
for insert
to authenticated
with check (
  public.user_can_write_company(company_id)
);

create policy "representantes_update_access"
on public.representantes
for update
to authenticated
using (
  public.user_can_write_company(company_id)
)
with check (
  public.user_can_write_company(company_id)
);

create policy "representantes_delete_access"
on public.representantes
for delete
to authenticated
using (
  public.user_can_delete_company(company_id)
);

drop policy if exists "configuracoes_financeiras_select_access" on public.configuracoes_financeiras;
drop policy if exists "configuracoes_financeiras_select" on public.configuracoes_financeiras;
drop policy if exists "configuracoes_financeiras_insert_access" on public.configuracoes_financeiras;
drop policy if exists "configuracoes_financeiras_insert" on public.configuracoes_financeiras;
drop policy if exists "configuracoes_financeiras_update_access" on public.configuracoes_financeiras;
drop policy if exists "configuracoes_financeiras_update" on public.configuracoes_financeiras;
drop policy if exists "configuracoes_financeiras_delete_access" on public.configuracoes_financeiras;
drop policy if exists "configuracoes_financeiras_delete" on public.configuracoes_financeiras;

create policy "configuracoes_financeiras_select_access"
on public.configuracoes_financeiras
for select
to authenticated
using (
  public.user_has_company_access(company_id)
);

create policy "configuracoes_financeiras_insert_access"
on public.configuracoes_financeiras
for insert
to authenticated
with check (
  public.user_can_write_company(company_id)
);

create policy "configuracoes_financeiras_update_access"
on public.configuracoes_financeiras
for update
to authenticated
using (
  public.user_can_write_company(company_id)
)
with check (
  public.user_can_write_company(company_id)
);

create policy "configuracoes_financeiras_delete_access"
on public.configuracoes_financeiras
for delete
to authenticated
using (
  public.user_can_delete_company(company_id)
);

drop policy if exists "registros_financeiros_select_access" on public.registros_financeiros;
drop policy if exists "registros_financeiros_select" on public.registros_financeiros;
drop policy if exists "registros_financeiros_insert_access" on public.registros_financeiros;
drop policy if exists "registros_financeiros_insert" on public.registros_financeiros;
drop policy if exists "registros_financeiros_update_access" on public.registros_financeiros;
drop policy if exists "registros_financeiros_update" on public.registros_financeiros;
drop policy if exists "registros_financeiros_delete_access" on public.registros_financeiros;
drop policy if exists "registros_financeiros_delete" on public.registros_financeiros;

create policy "registros_financeiros_select_access"
on public.registros_financeiros
for select
to authenticated
using (
  public.user_has_company_access(company_id)
);

create policy "registros_financeiros_insert_access"
on public.registros_financeiros
for insert
to authenticated
with check (
  public.user_can_write_company(company_id)
);

create policy "registros_financeiros_update_access"
on public.registros_financeiros
for update
to authenticated
using (
  public.user_can_write_company(company_id)
)
with check (
  public.user_can_write_company(company_id)
);

create policy "registros_financeiros_delete_access"
on public.registros_financeiros
for delete
to authenticated
using (
  public.user_can_delete_company(company_id)
);

drop policy if exists "importacoes_select_access" on public.importacoes;
drop policy if exists "importacoes_select" on public.importacoes;
drop policy if exists "importacoes_insert_access" on public.importacoes;
drop policy if exists "importacoes_insert" on public.importacoes;
drop policy if exists "importacoes_update_access" on public.importacoes;
drop policy if exists "importacoes_update" on public.importacoes;
drop policy if exists "importacoes_delete_access" on public.importacoes;
drop policy if exists "importacoes_delete" on public.importacoes;

create policy "importacoes_select_access"
on public.importacoes
for select
to authenticated
using (
  public.user_has_company_access(company_id)
);

create policy "importacoes_insert_access"
on public.importacoes
for insert
to authenticated
with check (
  public.user_can_write_company(company_id)
);

create policy "importacoes_update_access"
on public.importacoes
for update
to authenticated
using (
  public.user_can_write_company(company_id)
)
with check (
  public.user_can_write_company(company_id)
);

create policy "importacoes_delete_access"
on public.importacoes
for delete
to authenticated
using (
  public.user_can_delete_company(company_id)
);

drop policy if exists "audit_logs_select_access" on public.audit_logs;
drop policy if exists "audit_logs_insert_access" on public.audit_logs;
drop policy if exists "audit_logs_delete_access" on public.audit_logs;

create policy "audit_logs_select_access"
on public.audit_logs
for select
to authenticated
using (
  public.is_system_admin(auth.uid())
  or public.user_has_company_access(company_id)
);

create policy "audit_logs_insert_access"
on public.audit_logs
for insert
to authenticated
with check (
  public.is_system_admin(auth.uid())
  or public.user_has_company_access(company_id)
);

drop policy if exists "cobrancas_whatsapp_select_access" on public.cobrancas_whatsapp;
drop policy if exists "cobrancas_whatsapp_insert_access" on public.cobrancas_whatsapp;
drop policy if exists "cobrancas_whatsapp_update_access" on public.cobrancas_whatsapp;
drop policy if exists "cobrancas_whatsapp_delete_access" on public.cobrancas_whatsapp;
drop policy if exists "logs_cobranca_select_access" on public.logs_cobranca;
drop policy if exists "logs_cobranca_insert_access" on public.logs_cobranca;
drop policy if exists "logs_cobranca_update_access" on public.logs_cobranca;
drop policy if exists "logs_cobranca_delete_access" on public.logs_cobranca;

create policy "cobrancas_whatsapp_select_access"
on public.cobrancas_whatsapp
for select
to authenticated
using (
  public.user_has_company_access(empresa_id)
);

create policy "cobrancas_whatsapp_insert_access"
on public.cobrancas_whatsapp
for insert
to authenticated
with check (
  public.user_can_write_company(empresa_id)
);

create policy "cobrancas_whatsapp_update_access"
on public.cobrancas_whatsapp
for update
to authenticated
using (
  public.user_can_write_company(empresa_id)
)
with check (
  public.user_can_write_company(empresa_id)
);

create policy "cobrancas_whatsapp_delete_access"
on public.cobrancas_whatsapp
for delete
to authenticated
using (
  public.user_can_delete_company(empresa_id)
);

create policy "logs_cobranca_select_access"
on public.logs_cobranca
for select
to authenticated
using (
  public.user_has_company_access(company_id)
);

create policy "logs_cobranca_insert_access"
on public.logs_cobranca
for insert
to authenticated
with check (
  public.user_can_write_company(company_id)
);

create policy "logs_cobranca_update_access"
on public.logs_cobranca
for update
to authenticated
using (
  public.user_can_write_company(company_id)
)
with check (
  public.user_can_write_company(company_id)
);

drop policy if exists "whatsapp_config_select_access" on public.whatsapp_config;
drop policy if exists "whatsapp_config_insert_access" on public.whatsapp_config;
drop policy if exists "whatsapp_config_update_access" on public.whatsapp_config;
drop policy if exists "whatsapp_config_delete_access" on public.whatsapp_config;

create policy "whatsapp_config_select_access"
on public.whatsapp_config
for select
to authenticated
using (
  public.user_has_company_access(empresa_id)
);

create policy "whatsapp_config_insert_access"
on public.whatsapp_config
for insert
to authenticated
with check (
  public.user_can_write_company(empresa_id)
);

create policy "whatsapp_config_update_access"
on public.whatsapp_config
for update
to authenticated
using (
  public.user_can_write_company(empresa_id)
)
with check (
  public.user_can_write_company(empresa_id)
);

create policy "whatsapp_config_delete_access"
on public.whatsapp_config
for delete
to authenticated
using (
  public.user_can_delete_company(empresa_id)
);

drop policy if exists "whatsapp_cobranca_config_select_access" on public.whatsapp_cobranca_config;
drop policy if exists "whatsapp_cobranca_config_insert_access" on public.whatsapp_cobranca_config;
drop policy if exists "whatsapp_cobranca_config_update_access" on public.whatsapp_cobranca_config;
drop policy if exists "whatsapp_cobranca_config_delete_access" on public.whatsapp_cobranca_config;

create policy "whatsapp_cobranca_config_select_access"
on public.whatsapp_cobranca_config
for select
to authenticated
using (
  public.user_has_company_access(empresa_id)
);

create policy "whatsapp_cobranca_config_insert_access"
on public.whatsapp_cobranca_config
for insert
to authenticated
with check (
  public.user_can_write_company(empresa_id)
);

create policy "whatsapp_cobranca_config_update_access"
on public.whatsapp_cobranca_config
for update
to authenticated
using (
  public.user_can_write_company(empresa_id)
)
with check (
  public.user_can_write_company(empresa_id)
);

create policy "whatsapp_cobranca_config_delete_access"
on public.whatsapp_cobranca_config
for delete
to authenticated
using (
  public.user_can_delete_company(empresa_id)
);

drop policy if exists "google_sheets_config_select_access" on public.google_sheets_config;
drop policy if exists "google_sheets_config_insert_access" on public.google_sheets_config;
drop policy if exists "google_sheets_config_update_access" on public.google_sheets_config;
drop policy if exists "google_sheets_config_delete_access" on public.google_sheets_config;

create policy "google_sheets_config_select_access"
on public.google_sheets_config
for select
to authenticated
using (
  public.user_has_company_access(empresa_id)
);

create policy "google_sheets_config_insert_access"
on public.google_sheets_config
for insert
to authenticated
with check (
  public.user_can_write_company(empresa_id)
);

create policy "google_sheets_config_update_access"
on public.google_sheets_config
for update
to authenticated
using (
  public.user_can_write_company(empresa_id)
)
with check (
  public.user_can_write_company(empresa_id)
);

create policy "google_sheets_config_delete_access"
on public.google_sheets_config
for delete
to authenticated
using (
  public.user_can_delete_company(empresa_id)
);
