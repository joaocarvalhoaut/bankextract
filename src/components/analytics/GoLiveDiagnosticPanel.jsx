/**
 * GoLiveDiagnosticPanel — ETAPA 9+10: Go-Live Toolkit.
 * Executa diagnóstico completo do sistema antes do go-live:
 * Supabase, Drive, Z-API, registros financeiros, primeiro envio.
 * Também oferece exportação CSV dos registros.
 */
import { useCallback, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Play,
  XCircle,
} from 'lucide-react';
import { runGoLiveDiagnostic } from '../../services/observabilityService';
import { supabase } from '../../services/supabaseClient';

// ── helpers ────────────────────────────────────────────────────────────────────

const CHECK_LABELS = {
  supabase:         { label: 'Conexão Supabase', desc: 'Banco de dados e RLS' },
  drive_folder:     { label: 'Google Drive', desc: 'Pasta de boletos configurada' },
  zapi:             { label: 'Z-API WhatsApp', desc: 'Credenciais e circuit breaker' },
  financial_records:{ label: 'Registros Financeiros', desc: 'Carteira ativa carregada' },
  first_send:       { label: 'Primeiro Envio', desc: 'Histórico de automação' },
};

function CheckItem({ id, result }) {
  const isOk = result?.ok === true;
  const isWarn = !isOk && result?.warning === true;
  const label = CHECK_LABELS[id]?.label || id.replace(/_/g, ' ');
  const desc = CHECK_LABELS[id]?.desc || '';

  const borderClass = isOk
    ? 'border-emerald-800/40 bg-emerald-950/10'
    : isWarn
      ? 'border-amber-800/40 bg-amber-950/10'
      : 'border-red-800/40 bg-red-950/10';

  const Icon = isOk ? CheckCircle2 : isWarn ? AlertTriangle : XCircle;
  const iconClass = isOk ? 'text-emerald-400' : isWarn ? 'text-amber-400' : 'text-red-400';
  const titleClass = isOk ? 'text-emerald-300' : isWarn ? 'text-amber-300' : 'text-red-300';
  const msgClass = isOk ? 'text-slate-400' : isWarn ? 'text-amber-400/80' : 'text-red-400';

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${borderClass}`}>
      <div className="shrink-0 mt-0.5">
        <Icon size={16} className={iconClass} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${titleClass}`}>{label}</p>
        <p className="text-[11px] text-slate-500">{desc}</p>
        {result?.message && (
          <p className={`text-[11px] mt-0.5 ${msgClass}`}>{result.message}</p>
        )}
        {result?.count != null && (
          <p className="text-[11px] text-slate-400 mt-0.5">{result.count} registro{result.count !== 1 ? 's' : ''}</p>
        )}
      </div>
    </div>
  );
}

function OverallBadge({ checks }) {
  const total = checks.length;
  const passed = checks.filter(([, v]) => v?.ok === true).length;
  const warnings = checks.filter(([, v]) => !v?.ok && v?.warning).length;
  const errors = total - passed - warnings;
  const allOk = errors === 0 && warnings === 0;
  const hasErrors = errors > 0;

  const borderClass = allOk
    ? 'border-emerald-700/50 bg-emerald-950/30'
    : hasErrors
      ? 'border-red-700/50 bg-red-950/20'
      : 'border-amber-700/50 bg-amber-950/20';
  const textClass = allOk ? 'text-emerald-300' : hasErrors ? 'text-red-300' : 'text-amber-300';
  const subClass = allOk ? 'text-emerald-400' : hasErrors ? 'text-red-400' : 'text-amber-400';
  const msg = allOk
    ? 'Sistema pronto para go-live'
    : hasErrors
      ? `${errors} erro${errors > 1 ? 's' : ''} crítico${errors > 1 ? 's' : ''} — corrija antes de ativar`
      : `${warnings} aviso${warnings > 1 ? 's' : ''} — revise antes do go-live`;

  return (
    <div className={`rounded-2xl border p-4 text-center ${borderClass}`}>
      <div className={`text-3xl font-bold mb-1 ${textClass}`}>{passed}/{total}</div>
      <p className={`text-sm font-semibold ${subClass}`}>{msg}</p>
    </div>
  );
}

async function exportCsvRegistros(companyId) {
  const { data, error } = await supabase
    .from('registros_financeiros')
    .select('id,nome,documento,telefone,valor,data_vencimento,status,dias_atraso,boleto_match_confidence,boleto_match_strategy,zapi_status,created_at')
    .eq('company_id', companyId)
    .order('data_vencimento', { ascending: false })
    .limit(5000);

  if (error) throw new Error(`Erro ao buscar registros: ${error.message}`);
  if (!data?.length) throw new Error('Nenhum registro encontrado para exportar. Importe uma planilha primeiro.');

  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => {
    const v = row[h];
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registros_${companyId.slice(-8)}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return data.length;
}

// ── main component ─────────────────────────────────────────────────────────────

export default function GoLiveDiagnosticPanel({ companyId }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [exportSuccess, setExportSuccess] = useState(null);

  const runDiag = useCallback(async () => {
    if (!companyId) return;
    setRunning(true);
    setResults(null);
    try {
      const r = await runGoLiveDiagnostic(companyId);
      setResults(r);
    } catch (err) {
      setResults({ error: err.message });
    } finally {
      setRunning(false);
    }
  }, [companyId]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    setExportSuccess(null);
    try {
      const count = await exportCsvRegistros(companyId);
      setExportSuccess(`${count} registros exportados com sucesso.`);
    } catch (err) {
      setExportError(err.message || 'Erro ao exportar.');
    } finally {
      setExporting(false);
    }
  }, [companyId]);

  const checks = results && !results.error ? Object.entries(results) : [];

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">Go-Live Toolkit</h3>
        <p className="text-xs text-slate-500 mt-0.5">Diagnóstico completo antes de ativar envios em produção</p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={runDiag}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? 'Executando diagnóstico...' : 'Executar Diagnóstico'}
        </button>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-slate-100 disabled:opacity-40 text-sm font-medium transition-colors"
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {exporting ? 'Exportando...' : 'Exportar CSV'}
        </button>
      </div>

      {exportError && (
        <p className="flex items-center gap-1.5 text-xs text-red-400">
          <XCircle size={12} /> {exportError}
        </p>
      )}
      {exportSuccess && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 size={12} /> {exportSuccess}
        </p>
      )}

      {/* Results */}
      {results?.error && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 p-4 text-sm text-red-300">
          Erro: {results.error}
        </div>
      )}

      {checks.length > 0 && (
        <div className="space-y-3">
          <OverallBadge checks={checks} />
          {checks.map(([id, result]) => (
            <CheckItem key={id} id={id} result={result} />
          ))}
        </div>
      )}

      {!running && !results && (
        <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-500 text-sm">
          <Play size={20} className="mx-auto mb-2 text-slate-600" />
          Clique em "Executar Diagnóstico" para validar o sistema
        </div>
      )}
    </div>
  );
}
