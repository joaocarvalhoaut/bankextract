import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  FolderTree,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  getDriveBoletosConfig,
  saveDriveBoletosConfigFull,
  testDriveBoletosConnection,
  testDriveBoletoLookup,
  getDriveFolderTree,
  extractDriveFolderIdFromUrl,
} from '../services/googleDriveService';
import { normalizeLookupResults } from '../utils/driveLookupResults';

// ── helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score) {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function scoreBg(score) {
  if (score >= 80) return 'bg-emerald-500/10 border-emerald-600/30';
  if (score >= 50) return 'bg-amber-500/10 border-amber-600/30';
  return 'bg-red-500/10 border-red-600/30';
}

function FolderNode({ node, depth = 0 }) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = node.subfolders && node.subfolders.length > 0;
  return (
    <div style={{ paddingLeft: depth * 16 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-slate-200 hover:bg-slate-800/50"
      >
        {hasChildren ? (
          open ? <ChevronDown size={11} className="text-slate-400" /> : <ChevronRight size={11} className="text-slate-400" />
        ) : (
          <span className="w-[11px]" />
        )}
        <FolderOpen size={12} className="shrink-0 text-amber-400" />
        <span className="truncate">{node.name}</span>
        {node.pdfCount != null && (
          <span className="ml-auto shrink-0 rounded-full bg-slate-700 px-1.5 py-px text-[10px] text-slate-300">
            {node.pdfCount} PDF{node.pdfCount !== 1 ? 's' : ''}
          </span>
        )}
      </button>
      {open && hasChildren && node.subfolders.map((child) => (
        <FolderNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────

export default function DriveBoletoConfig({ empresaId, canManage = false, onToast, onSaved }) {
  // config state
  const [folderUrl, setFolderUrl] = useState('');
  const [folderId, setFolderId] = useState('');
  const [folderName, setFolderName] = useState('');
  const [recursiveScan, setRecursiveScan] = useState(false);
  const [matchingStrategy, setMatchingStrategy] = useState('auto');
  const [maxDepth, setMaxDepth] = useState(2);
  const [dirty, setDirty] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // {ok, pdfCount, error}

  // test lookup state
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResults, setLookupResults] = useState(null);

  // folder tree state
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeData, setTreeData] = useState(null);
  const [treeOpen, setTreeOpen] = useState(false);

  // URL extraction debounce
  const extractTimer = useRef(null);

  // ── load config ──────────────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const data = await getDriveBoletosConfig(empresaId);
      const rawId = data?.drive_root_folder_id || '';
      setFolderId(rawId);
      setFolderUrl(rawId ? `https://drive.google.com/drive/folders/${rawId}` : '');
      setFolderName(data?.drive_folder_name || '');
      setRecursiveScan(data?.drive_recursive_scan ?? false);
      setMatchingStrategy(data?.drive_matching_strategy || 'auto');
      setMaxDepth(data?.drive_max_depth ?? 2);
      setDirty(false);
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao carregar configuracao do Drive.');
    } finally {
      setLoading(false);
    }
  }, [empresaId, onToast]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── URL → folder ID extraction ───────────────────────────────────────────

  const handleFolderUrlChange = useCallback((value) => {
    setFolderUrl(value);
    setDirty(true);

    clearTimeout(extractTimer.current);

    // quick client-side extraction first (covers all standard Drive URL formats)
    const clientExtracted = clientExtractFolderId(value);
    if (clientExtracted) {
      setFolderId(clientExtracted);
    }

    // debounced server-side extraction for edge cases
    extractTimer.current = setTimeout(async () => {
      if (!value.trim()) {
        setFolderId('');
        return;
      }
      try {
        const result = await extractDriveFolderIdFromUrl(empresaId, value.trim());
        if (result?.folder_id) setFolderId(result.folder_id);
      } catch {
        // silently ignore — client-side extraction is already applied
      }
    }, 600);
  }, [empresaId]);

  function clientExtractFolderId(input) {
    const str = String(input || '').trim();
    const m1 = str.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
    if (m1) return m1[1];
    const m2 = str.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (m2) return m2[1];
    const m3 = str.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    if (m3) return m3[1];
    if (/^[a-zA-Z0-9_-]{25,}$/.test(str)) return str;
    return '';
  }

  // ── test connection ──────────────────────────────────────────────────────

  const handleTest = useCallback(async () => {
    if (!empresaId || !folderId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testDriveBoletosConnection(empresaId);
      setTestResult({ ok: result?.ok ?? true, pdfCount: result?.pdf_count ?? result?.pdfCount, error: result?.error });
      if (result?.ok !== false) {
        onToast?.('sucesso', `Conexao OK — ${result?.pdf_count ?? 0} PDFs encontrados.`);
      } else {
        onToast?.('erro', result?.error || 'Falha na conexao com o Drive.');
      }
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
      onToast?.('erro', err.message || 'Falha na conexao com o Drive.');
    } finally {
      setTesting(false);
    }
  }, [empresaId, folderId, onToast]);

  // ── save config ──────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!empresaId) return;
    if (!folderId) {
      onToast?.('erro', 'Informe a URL ou ID da pasta do Google Drive.');
      return;
    }
    setSaving(true);
    try {
      await saveDriveBoletosConfigFull(empresaId, {
        drive_root_folder_id: folderId,
        drive_recursive_scan: recursiveScan,
        drive_matching_strategy: matchingStrategy,
        drive_max_depth: maxDepth,
        drive_folder_name: folderName,
      });
      setDirty(false);
      onToast?.('sucesso', 'Configuracao do Drive salva com sucesso.');
      onSaved?.();
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao salvar a configuracao do Drive.');
    } finally {
      setSaving(false);
    }
  }, [empresaId, folderId, folderName, recursiveScan, matchingStrategy, maxDepth, onToast, onSaved]);

  // ── test boleto lookup ───────────────────────────────────────────────────

  const handleLookup = useCallback(async () => {
    if (!empresaId || !lookupQuery.trim()) return;
    setLookupLoading(true);
    setLookupResults(null);
    try {
      const result = await testDriveBoletoLookup(empresaId, lookupQuery.trim());
      setLookupResults(normalizeLookupResults(result?.results || result || []));
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao buscar boleto no Drive.');
    } finally {
      setLookupLoading(false);
    }
  }, [empresaId, lookupQuery, onToast]);

  // ── folder tree ──────────────────────────────────────────────────────────

  const handleLoadTree = useCallback(async () => {
    if (!empresaId || !folderId) return;
    setTreeLoading(true);
    setTreeData(null);
    try {
      const result = await getDriveFolderTree(empresaId);
      setTreeData(result?.tree || result);
      setTreeOpen(true);
    } catch (err) {
      onToast?.('erro', err.message || 'Falha ao carregar estrutura de pastas.');
    } finally {
      setTreeLoading(false);
    }
  }, [empresaId, folderId, onToast]);

  // ── discard ──────────────────────────────────────────────────────────────

  const handleDiscard = useCallback(() => {
    loadConfig();
    setTestResult(null);
    setLookupResults(null);
    setTreeData(null);
    setTreeOpen(false);
  }, [loadConfig]);

  // ── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-emerald-400" />
      </div>
    );
  }

  const canEdit = canManage;
  const hasFolder = Boolean(folderId);

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FolderOpen size={16} className="text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-100">Boletos no Google Drive</h3>
            {hasFolder && (
              <span className="rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2 py-px text-[10px] font-semibold text-emerald-400">
                Configurado
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Localiza automaticamente PDFs de boleto no Drive e os envia via WhatsApp.
          </p>
        </div>
        {dirty && canEdit && (
          <button
            onClick={handleDiscard}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60"
          >
            <X size={12} /> Descartar
          </button>
        )}
      </div>

      {/* ── Folder URL input ─────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          URL ou ID da pasta raiz
        </label>
        <div className="relative">
          <FolderOpen size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={folderUrl}
            onChange={(e) => handleFolderUrlChange(e.target.value)}
            disabled={!canEdit}
            placeholder="https://drive.google.com/drive/folders/..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900/70 py-2.5 pl-8 pr-3 text-xs text-slate-100 outline-none ring-emerald-500 placeholder:text-slate-500 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        {folderId && (
          <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <CheckCircle2 size={11} className="text-emerald-500" />
            ID extraído: <code className="font-mono text-emerald-300">{folderId}</code>
          </p>
        )}
      </div>

      {/* ── Folder name (optional label) ─────────────────────────────────── */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Nome da pasta (opcional)
        </label>
        <input
          type="text"
          value={folderName}
          onChange={(e) => { setFolderName(e.target.value); setDirty(true); }}
          disabled={!canEdit}
          placeholder="Ex: Boletos 2025"
          className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2.5 text-xs text-slate-100 outline-none ring-emerald-500 placeholder:text-slate-500 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {/* ── Scan settings ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

        {/* Recursive scan toggle */}
        <div className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/50 p-3">
          <button
            onClick={() => { if (canEdit) { setRecursiveScan((v) => !v); setDirty(true); } }}
            disabled={!canEdit}
            className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed ${recursiveScan ? 'bg-emerald-500' : 'bg-slate-700'}`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${recursiveScan ? 'translate-x-4' : 'translate-x-0'}`}
            />
          </button>
          <div>
            <p className="text-xs font-medium text-slate-200">Varredura recursiva</p>
            <p className="mt-0.5 text-[11px] text-slate-400">Busca em subpastas</p>
          </div>
        </div>

        {/* Max depth */}
        <div className={`space-y-1.5 rounded-xl border border-slate-700 bg-slate-900/50 p-3 ${!recursiveScan ? 'opacity-40 pointer-events-none' : ''}`}>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Profundidade máx.
          </label>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((d) => (
              <button
                key={d}
                disabled={!canEdit}
                onClick={() => { setMaxDepth(d); setDirty(true); }}
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition ${maxDepth === d ? 'bg-emerald-500 text-white' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'} disabled:cursor-not-allowed`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Matching strategy */}
        <div className="space-y-1.5 rounded-xl border border-slate-700 bg-slate-900/50 p-3">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Estratégia de match
          </label>
          <select
            value={matchingStrategy}
            onChange={(e) => { setMatchingStrategy(e.target.value); setDirty(true); }}
            disabled={!canEdit}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none ring-emerald-500 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="auto">Auto (recomendado)</option>
            <option value="strict">Estrito (boleto/nosso_numero)</option>
            <option value="fuzzy">Fuzzy (nome + valor)</option>
          </select>
        </div>
      </div>

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {canEdit && (
          <button
            onClick={handleSave}
            disabled={saving || !hasFolder}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            {saving ? 'Salvando...' : 'Salvar configuração'}
          </button>
        )}

        <button
          onClick={handleTest}
          disabled={testing || !hasFolder}
          className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {testing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {testing ? 'Testando...' : 'Testar conexão'}
        </button>

        <button
          onClick={handleLoadTree}
          disabled={treeLoading || !hasFolder}
          className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {treeLoading ? <Loader2 size={13} className="animate-spin" /> : <FolderTree size={13} />}
          {treeLoading ? 'Carregando...' : 'Ver estrutura'}
        </button>
      </div>

      {/* ── Test result banner ───────────────────────────────────────────── */}
      {testResult && (
        <div className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${testResult.ok !== false ? 'border-emerald-600/30 bg-emerald-500/10 text-emerald-300' : 'border-red-600/30 bg-red-500/10 text-red-300'}`}>
          {testResult.ok !== false ? <CheckCircle2 size={14} className="mt-px shrink-0" /> : <AlertCircle size={14} className="mt-px shrink-0" />}
          <div>
            {testResult.ok !== false ? (
              <>
                <p className="font-semibold">Conexão OK</p>
                {testResult.pdfCount != null && (
                  <p className="mt-0.5 text-emerald-400">{testResult.pdfCount} PDF{testResult.pdfCount !== 1 ? 's' : ''} encontrado{testResult.pdfCount !== 1 ? 's' : ''} na pasta</p>
                )}
              </>
            ) : (
              <>
                <p className="font-semibold">Falha na conexão</p>
                {testResult.error && <p className="mt-0.5 text-red-400">{testResult.error}</p>}
              </>
            )}
          </div>
          <button onClick={() => setTestResult(null)} className="ml-auto shrink-0 text-slate-400 hover:text-slate-200">
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Folder tree ──────────────────────────────────────────────────── */}
      {treeOpen && treeData && (
        <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <FolderTree size={12} className="text-amber-400" />
              Estrutura de pastas
            </span>
            <button onClick={() => setTreeOpen(false)} className="text-slate-400 hover:text-slate-200">
              <X size={12} />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {Array.isArray(treeData)
              ? treeData.map((node) => <FolderNode key={node.id || node.name} node={node} depth={0} />)
              : <FolderNode node={treeData} depth={0} />
            }
          </div>
        </div>
      )}

      {/* ── Boleto lookup test ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search size={13} className="text-emerald-400" />
          <p className="text-xs font-semibold text-slate-200">Testar busca de boleto</p>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Simule a busca de um boleto pelo nome do cliente, CPF/CNPJ, número do boleto ou valor.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !lookupLoading && hasFolder && handleLookup()}
            disabled={!hasFolder}
            placeholder="Ex: João Silva, 123.456.789-00, R$350,00..."
            className="flex-1 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-100 outline-none ring-emerald-500 placeholder:text-slate-500 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
          />
          <button
            onClick={handleLookup}
            disabled={lookupLoading || !lookupQuery.trim() || !hasFolder}
            className="flex items-center gap-1.5 rounded-xl bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {lookupLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            Buscar
          </button>
        </div>

        {/* Lookup results */}
        {lookupResults !== null && (
          <div className="space-y-2">
            {lookupResults.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2.5 text-xs text-slate-400">
                <TriangleAlert size={12} className="text-amber-500 shrink-0" />
                Nenhum boleto encontrado para essa busca.
              </div>
            ) : (
              lookupResults.map((item, i) => {
                const score = item.score ?? 0;
                return (
                  <div key={i} className={`flex items-start gap-2.5 rounded-xl border p-3 ${scoreBg(score)}`}>
                    <FileText size={14} className="mt-px shrink-0 text-slate-300" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-slate-100">
                          {item.file_name || 'Arquivo sem nome'}
                        </p>
                        <span className={`shrink-0 rounded-full border px-2 py-px text-[10px] font-bold ${scoreBg(score)} ${scoreColor(score)}`}>
                          {score} pts
                        </span>
                      </div>
                      {item.reasons && item.reasons.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-slate-400">{item.reasons.join(' · ')}</p>
                      )}
                      {item.view_url && (
                        <a
                          href={item.view_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
                        >
                          Ver no Drive →
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <button
              onClick={() => setLookupResults(null)}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"
            >
              <X size={10} /> Limpar resultados
            </button>
          </div>
        )}
      </div>

      {/* ── No folder warning ────────────────────────────────────────────── */}
      {!hasFolder && !loading && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-600/20 bg-amber-500/5 p-3 text-xs text-amber-300">
          <TriangleAlert size={14} className="mt-px shrink-0" />
          <p>
            Nenhuma pasta configurada. Cole a URL da pasta do Google Drive acima para ativar a busca automática de boletos.
          </p>
        </div>
      )}
    </div>
  );
}
