create or replace function public.normalize_financial_idempotency_token(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(trim(coalesce(value, ''))), '[^a-z0-9]+', '', 'g'), '');
$$;

create or replace function public.build_registro_financeiro_idempotency_key(
  p_numero_boleto text,
  p_documento text,
  p_numero_nf text,
  p_nome text,
  p_telefone text,
  p_data_vencimento date,
  p_valor numeric
)
returns text
language plpgsql
immutable
as $$
declare
  normalized_boleto text := public.normalize_financial_idempotency_token(p_numero_boleto);
  normalized_documento text := public.normalize_financial_idempotency_token(p_documento);
  normalized_numero_nf text := public.normalize_financial_idempotency_token(p_numero_nf);
  normalized_nome text := public.normalize_financial_idempotency_token(p_nome);
  normalized_telefone text := public.normalize_financial_idempotency_token(p_telefone);
  valor_cents bigint;
begin
  if p_data_vencimento is null or p_valor is null or p_valor <= 0 then
    return null;
  end if;

  valor_cents := round(p_valor * 100);

  if normalized_boleto is not null then
    return format('boleto|%s|%s|%s', normalized_boleto, p_data_vencimento, valor_cents);
  end if;

  if normalized_documento is not null then
    return format('documento|%s|%s|%s', normalized_documento, p_data_vencimento, valor_cents);
  end if;

  if normalized_numero_nf is not null then
    return format('nf|%s|%s|%s', normalized_numero_nf, p_data_vencimento, valor_cents);
  end if;

  if normalized_nome is null then
    return null;
  end if;

  return format(
    'fallback|%s|%s|%s|%s',
    normalized_nome,
    coalesce(normalized_telefone, 'semtelefone'),
    p_data_vencimento,
    valor_cents
  );
end;
$$;

alter table public.registros_financeiros
  add column if not exists idempotency_key text;

update public.registros_financeiros
set idempotency_key = public.build_registro_financeiro_idempotency_key(
  numero_boleto,
  documento,
  numero_nf,
  nome,
  telefone,
  data_vencimento,
  valor
)
where idempotency_key is distinct from public.build_registro_financeiro_idempotency_key(
  numero_boleto,
  documento,
  numero_nf,
  nome,
  telefone,
  data_vencimento,
  valor
);

with ranked_duplicates as (
  select
    id,
    row_number() over (
      partition by company_id, idempotency_key
      order by coalesce(importado_em, created_at), created_at, id
    ) as rn
  from public.registros_financeiros
  where idempotency_key is not null
)
update public.registros_financeiros target
set idempotency_key = null
from ranked_duplicates source
where target.id = source.id
  and source.rn > 1;

create or replace function public.set_registro_financeiro_idempotency_key()
returns trigger
language plpgsql
as $$
begin
  new.idempotency_key := public.build_registro_financeiro_idempotency_key(
    new.numero_boleto,
    new.documento,
    new.numero_nf,
    new.nome,
    new.telefone,
    new.data_vencimento,
    new.valor
  );
  return new;
end;
$$;

drop trigger if exists trg_registros_financeiros_idempotency_key on public.registros_financeiros;

create trigger trg_registros_financeiros_idempotency_key
before insert or update of numero_boleto, documento, numero_nf, nome, telefone, data_vencimento, valor
on public.registros_financeiros
for each row
execute function public.set_registro_financeiro_idempotency_key();

create unique index if not exists idx_registros_financeiros_company_idempotency_key
  on public.registros_financeiros(company_id, idempotency_key);
