import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Download, FileSpreadsheet, RefreshCw, Rows3, ShieldCheck, Waypoints } from 'lucide-react';
import AuditEventCard from '../components/AuditEventCard';
import AuditFilters from '../components/AuditFilters';
import { getAuditEvents, groupAuditByDay, groupAuditByRequest } from '../services/auditTimelineService';

const DEFAULT_FILTERS = {
  group: 'todos',
  action: 'todos',
  period: 'all',
  search: '',
  userId: '',
  userQuery: '',
  entity: '',
  dateStart: '',
  dateEnd: '',
  severity: 'todos',
  tenant: '',
  requestQuery: '',
};

function sanitizeCsvCell(value) {
  const str = String(value ?? '').replace(/"/g, '""');
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}

function exportToCsv(events) {
  const header = ['Data/Hora', 'Acao', 'Titulo', 'Descricao', 'Grupo', 'Severidade', 'Tenant', 'Usuario', 'Entidade', 'ID Entidade', 'Request ID', 'Correlation ID'];
  const rows = events.map((event) => [
    new Date(event.created_at).toLocaleString('pt-BR'),
    event.action,
    event.title,
    event.description,
    event.group,
    event.severity,
    event.company_id || '',
    event.user_email || event.user_id || '',
    event.entity || '',
    event.entity_id || '',
    event.request_id || '',
    event.correlation_id || '',
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${sanitizeCsvCell(value)}"`).join(','))
    .join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'auditoria_operacional.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function exportToExcel(events) {
  const header = ['Data/Hora', 'Acao', 'Titulo', 'Descricao', 'Grupo', 'Severidade', 'Tenant', 'Usuario', 'Request ID', 'Correlation ID'];
  const rows = events.map((event) => [
    new Date(event.created_at).toLocaleString('pt-BR'),
    event.action,
    event.title,
    event.description,
    event.group,
    event.severity,
    event.company_id || '',
    event.user_email || event.user_id || '',
    event.request_id || '',
    event.correlation_id || '',
  ]);
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Auditoria"><Table>${[header, ...rows].map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${String(cell).replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char]))}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'auditoria_operacional.xls';
  link.click();
  URL.revokeObjectURL(url);
}

export default function AuditTimelineScreen({ companyId, companyName, onToast, allCompanies = false }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [groupMode, setGroupMode] = useState('day');
  const [page, setPage] = useState(1);
  const mountedRef = useRef(true);
  const pageSize = 50;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!companyId && !allCompanies) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await getAuditEvents(companyId, filters, { allCompanies });
      if (mountedRef.current) setEvents(data);
    } catch (error) {
      onToast?.('erro', error?.message || 'Erro ao carregar auditoria.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [allCompanies, companyId, filters, onToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filters, groupMode]);

  const grouped = useMemo(() => (groupMode === 'request' ? groupAuditByRequest(events) : groupAuditByDay(events)), [events, groupMode]);
  const totalEvents = events.length;
  const totalGroups = grouped.length;
  const paginatedGroups = grouped.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(grouped.length / pageSize));

  const byGroup = useMemo(() => {
    const counts = {};
    for (const event of events) {
      counts[event.group] = (counts[event.group] || 0) + 1;
    }
    return counts;
  }, [events]);

  const bySeverity = useMemo(() => {
    const counts = { info: 0, success: 0, warning: 0, danger: 0 };
    for (const event of events) {
      const key = String(event.severity || 'info').toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [events]);

  const handleFilterChange = useCallback((partial) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const handleFavorite = useCallback((event) => {
    setEvents((prev) =>
      prev.map((item) =>
        item.id === event.id
          ? { ...item, favorited: !item.favorited, metadata: { ...item.metadata, _favorited: !item.favorited } }
          : item
      )
    );
  }, []);

  if (!companyId && !allCompanies) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[32px] border border-dashed border-slate-700 bg-slate-900/60 p-12 text-center shadow-soft">
        <ClipboardList className="mb-4 text-slate-300" size={30} />
        <h2 className="text-xl font-semibold text-slate-50">Selecione uma empresa para abrir a auditoria</h2>
        <p className="mt-2 text-sm text-slate-500">Os eventos operacionais e comerciais sao exibidos por company_id.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="hero-mesh text-crisp overflow-hidden rounded-[32px] border border-slate-700/50 bg-slate-900/70 px-6 py-7 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 shadow-lg shadow-violet-900/25">
              <ShieldCheck size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-50">Historico Operacional</h1>
              <p className="mt-0.5 text-sm text-slate-400">
                {allCompanies ? 'Modo global' : companyName || 'Empresa'} • timeline com tenant, severidade e correlation/request id
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setGroupMode((current) => (current === 'day' ? 'request' : 'day'))}
              className="control-surface flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-200 shadow-sm transition-colors"
            >
              {groupMode === 'day' ? <Waypoints size={14} /> : <Rows3 size={14} />}
              {groupMode === 'day' ? 'Agrupar por request' : 'Agrupar por dia'}
            </button>
            <button
              type="button"
              onClick={() => exportToCsv(events)}
              disabled={!events.length}
              className="control-surface flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-200 shadow-sm transition-colors disabled:opacity-40"
            >
              <Download size={14} />
              CSV
            </button>
            <button
              type="button"
              onClick={() => exportToExcel(events)}
              disabled={!events.length}
              className="control-surface flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-200 shadow-sm transition-colors disabled:opacity-40"
            >
              <FileSpreadsheet size={14} />
              Excel
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 disabled:opacity-60"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {[
            { label: 'Total', value: totalEvents, color: 'bg-slate-800/60 text-slate-200' },
            { label: 'Financeiro', value: byGroup.financeiro || 0, color: 'bg-blue-900/20 text-blue-700' },
            { label: 'Cobranca', value: byGroup.cobranca || 0, color: 'bg-green-50 text-green-700' },
            { label: 'Automacoes', value: byGroup.automacao || 0, color: 'bg-violet-50 text-violet-700' },
            { label: 'Danger', value: bySeverity.danger || 0, color: 'bg-red-50 text-red-700' },
            { label: groupMode === 'request' ? 'Requests' : 'Dias', value: totalGroups, color: 'bg-slate-800/60 text-slate-200' },
          ].map((item) => (
            <div key={item.label} className={`flex items-center gap-2 rounded-2xl px-3 py-1.5 ${item.color}`}>
              <span className="text-xs font-medium">{item.label}</span>
              <span className="text-sm font-bold">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="sticky-toolbar rounded-2xl">
        <AuditFilters filters={filters} onChange={handleFilterChange} onClear={handleClearFilters} resultCount={totalEvents} />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex gap-4">
              <div className="skeleton h-10 w-10 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-5 w-48 rounded-full" />
                <div className="skeleton h-4 w-72 rounded-full" />
                <div className="skeleton h-3 w-32 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[32px] border border-dashed border-slate-700 bg-slate-900/60 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-800/60">
            <ClipboardList size={28} className="text-slate-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-200">Nenhum evento encontrado</h3>
          <p className="mt-1.5 text-sm text-slate-400">Ajuste os filtros ou aguarde novas acoes registradas.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.date}>
              <div className="mb-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-800/60" />
                <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                  {group.label}
                  <span className="ml-2 text-slate-400">
                    ({group.events.length} evento{group.events.length !== 1 ? 's' : ''})
                  </span>
                </span>
                <div className="h-px flex-1 bg-slate-800/60" />
              </div>

              <div>
                {group.events.map((event) => (
                  <AuditEventCard key={event.id} event={event} onFavorite={handleFavorite} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
