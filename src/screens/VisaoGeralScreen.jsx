import { Download, Eraser, FileSpreadsheet, Search, SlidersHorizontal, WalletCards } from 'lucide-react';
import ClearOverviewModal from '../components/ClearOverviewModal';
import ConfiguracaoJurosMulta from '../components/ConfiguracaoJurosMulta';
import DataTable from '../components/DataTable';
import { canUserPerformAction } from '../services/permissionsService';
import { formatCurrencyBRL, formatDateBR } from '../utils/format';

const statusTone = {
  pendente: 'border-slate-200 bg-slate-100 text-slate-700',
  aberto: 'border-blue-200 bg-blue-100 text-blue-800',
  vencido: 'border-red-200 bg-red-100 text-red-700',
  negociacao: 'border-amber-200 bg-amber-100 text-amber-700',
  liquidado: 'border-emerald-200 bg-emerald-100 text-emerald-700',
};

export default function VisaoGeralScreen({
  companies,
  activeCompanyId,
  activeCompanyName,
  globalMode,
  filters,
  setFilters,
  rows,
  config,
  onConfigChange,
  onExportCsv,
  onExportExcel,
  onOpenClearOverview,
  clearOverviewModalOpen,
  clearOverviewLoading,
  onCloseClearOverview,
  onConfirmClearOverview,
  userRole = 'membro',
}) {
  const canExport = canUserPerformAction(userRole, 'exportar_csv');
  const canClearView = canUserPerformAction(userRole, 'limpar_visao');

  const columns = [
    ...(globalMode
      ? [
          {
            key: 'empresa',
            label: 'Empresa',
            render: (row) => <span className="font-medium text-slate-900">{row.empresa_nome}</span>,
          },
        ]
      : []),
    {
      key: 'nome',
      label: 'Cliente / Documento',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.nome}</p>
          <p className="text-xs text-slate-500">{row.numero_boleto}</p>
        </div>
      ),
    },
    {
      key: 'data_vencimento',
      label: 'Vencimento',
      render: (row) => formatDateBR(row.data_vencimento),
    },
    {
      key: 'valor',
      label: 'Valor',
      render: (row) => <span className="font-semibold text-slate-900">{formatCurrencyBRL(row.valor)}</span>,
    },
    {
      key: 'telefone',
      label: 'Telefone',
      render: (row) => row.telefone || <span className="text-amber-600">Sem telefone</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone[row.status] || statusTone.pendente}`}>
          {row.status}
        </span>
      ),
    },
    {
      key: 'batch_id',
      label: 'Lote',
      render: (row) => <span className="font-mono text-xs text-slate-500">{row.batch_id?.slice(0, 8) || 'sem-lote'}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="hero-mesh overflow-hidden rounded-[32px] p-6 text-white shadow-lifted lg:p-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">
              <WalletCards size={13} />
              Carteira financeira
            </div>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-white lg:text-4xl">
              Visao consolidada da carteira para operar, exportar e limpar com seguranca.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 lg:text-base">
              Esta tela concentra registros reais, filtros comerciais e acoes operacionais com company_id, batch_id e
              permissoes por role.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="glass rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Escopo atual</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {globalMode ? 'Todas as empresas' : activeCompanyName || 'Nenhuma empresa ativa'}
              </p>
            </div>
            <div className="glass rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Registros visiveis</p>
              <p className="mt-2 text-2xl font-semibold text-white">{rows.length}</p>
            </div>
            <div className="glass rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Acoes destrutivas</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {globalMode ? 'Bloqueadas no modo global' : canClearView ? 'Controladas por role' : 'Restritas'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <ConfiguracaoJurosMulta
        config={config}
        onChange={onConfigChange}
        disabled={globalMode}
        notice={globalMode ? 'Selecione uma empresa especifica para editar juros e multa.' : ''}
        title="Configuracao financeira"
        subtitle="Esses percentuais recalculam automaticamente valores atualizados, cobrancas e sincronizacao."
        showRealtimeBadge
        saveLabel="Salvar configuracao"
      />

      <section className="accent-bar rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Carteira financeira</h3>
            <p className="text-sm text-slate-500">Visao principal dos registros importados por empresa e lote.</p>
            {!canExport || !canClearView ? (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Algumas acoes desta tela estao bloqueadas para o seu perfil atual.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {canExport ? (
              <button
                type="button"
                onClick={onExportCsv}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-soft hover:bg-slate-50"
              >
                <Download size={14} />
                Exportar CSV
              </button>
            ) : null}
            {canExport ? (
              <button
                type="button"
                onClick={onExportExcel}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-soft hover:bg-slate-50"
              >
                <FileSpreadsheet size={14} />
                Exportar Excel
              </button>
            ) : null}
            {canClearView ? (
              <button
                type="button"
                onClick={onOpenClearOverview}
                className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
              >
                <Eraser size={14} />
                Limpar visao
              </button>
            ) : null}
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 xl:grid-cols-6">
          <label className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-soft">
            <span className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <SlidersHorizontal size={13} />
              Empresa
            </span>
            <select
              value={filters.companyFilter}
              onChange={(event) => setFilters((prev) => ({ ...prev, companyFilter: event.target.value }))}
              className="input-premium w-full bg-transparent text-sm outline-none"
            >
              {globalMode ? <option value="">Todas as empresas</option> : null}
              {!globalMode ? <option value={activeCompanyId}>{activeCompanyName || 'Empresa ativa'}</option> : null}
              {globalMode
                ? companies
                    .filter((company) => company.id !== activeCompanyId)
                    .map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.nome}
                      </option>
                    ))
                : null}
            </select>
          </label>

          <input
            type="date"
            value={filters.dateStart}
            onChange={(event) => setFilters((prev) => ({ ...prev, dateStart: event.target.value }))}
            className="input-premium rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:ring-2"
          />
          <input
            type="date"
            value={filters.dateEnd}
            onChange={(event) => setFilters((prev) => ({ ...prev, dateEnd: event.target.value }))}
            className="input-premium rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:ring-2"
          />
          <select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            className="input-premium rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:ring-2"
          >
            <option value="todos">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="aberto">Aberto</option>
            <option value="vencido">Vencido</option>
            <option value="negociacao">Negociacao</option>
            <option value="liquidado">Liquidado</option>
          </select>
          <select
            value={filters.tipo}
            onChange={(event) => setFilters((prev) => ({ ...prev, tipo: event.target.value }))}
            className="input-premium rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:ring-2"
          >
            <option value="todos">Todos os tipos</option>
            <option value="vencidos">Vencidos</option>
            <option value="liquidacao">Liquidacao</option>
          </select>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 shadow-soft">
            <Search size={14} className="text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Buscar cliente ou documento"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="Nenhum registro financeiro disponivel."
          emptyDescription="Importe uma nova carteira ou ajuste os filtros para exibir a visao geral."
        />
      </section>

      <ClearOverviewModal
        isOpen={clearOverviewModalOpen}
        companyName={activeCompanyName}
        loading={clearOverviewLoading}
        onClose={onCloseClearOverview}
        onConfirm={onConfirmClearOverview}
      />
    </div>
  );
}
