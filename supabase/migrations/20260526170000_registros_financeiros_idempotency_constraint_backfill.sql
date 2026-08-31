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
where idempotency_key is null;

create unique index if not exists idx_registros_financeiros_company_idempotency_key
  on public.registros_financeiros (company_id, idempotency_key);
