alter table public.registros_financeiros
  add column if not exists tipo text;

update public.registros_financeiros rf
set tipo = i.tipo
from public.importacoes i
where rf.company_id = i.company_id
  and rf.batch_id is not null
  and i.batch_id is not null
  and rf.batch_id = i.batch_id
  and coalesce(trim(rf.tipo), '') = '';

update public.registros_financeiros
set tipo = case
  when coalesce(trim(status), '') = 'liquidado' then 'liquidacao'
  when data_vencimento >= current_date then 'a_vencer'
  else 'vencidos'
end
where coalesce(trim(tipo), '') = '';

alter table public.registros_financeiros
  alter column tipo set default 'vencidos';

update public.registros_financeiros
set tipo = 'vencidos'
where tipo is null;

alter table public.registros_financeiros
  alter column tipo set not null;

create index if not exists idx_registros_financeiros_company_tipo
  on public.registros_financeiros (company_id, tipo);
