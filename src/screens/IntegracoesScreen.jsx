import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, ShieldCheck, Smartphone } from 'lucide-react';
import GoogleSheetsConfig from '../components/GoogleSheetsConfig';
import DriveBoletoConfig from '../components/DriveBoletoConfig';
import { getDriveBoletosConfig } from '../services/googleDriveService';
import { normalizeUserRole } from '../security/permissions';

function StatusCard({ label, value, tone = 'default' }) {
  const tones = {
    default: 'border-slate-700 bg-slate-800/50 text-slate-200',
    blue: 'border-blue-700/40 bg-blue-900/20 text-blue-200',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-soft ${tones[tone] || tones.default}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{label}</p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

function GatewayNoticeCard({ canManage, onNavigate }) {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 shadow-card">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
        <Smartphone size={12} />
        Gateway global
      </div>
      <h3 className="text-xl font-semibold text-slate-50">WhatsApp / Z-API da plataforma</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        A configuracao de WhatsApp nao e mais feita por empresa. A plataforma usa uma unica instancia Z-API compartilhada, gerenciada na Central Operacional.
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <StatusCard label="Arquitetura" value="Instancia unica compartilhada entre empresas" tone="emerald" />
        <StatusCard label="Gerenciamento" value={canManage ? 'Disponivel para system admin em Admin Ops' : 'Somente system admin pode editar no Admin Ops'} tone="blue" />
      </div>

      <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
        Para conectar, validar QR Code ou acompanhar o numero pareado, use <span className="font-semibold text-slate-100">Admin Ops &gt; Gateway WhatsApp</span>.
      </div>

      {onNavigate ? (
        <button
          type="button"
          onClick={() => onNavigate('admin-ops')}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800/40"
        >
          <ShieldCheck size={14} />
          Ir para Admin Ops
        </button>
      ) : null}
    </section>
  );
}

export default function IntegracoesScreen({
  companyId,
  companyName,
  globalMode,
  onGoogleSheetsSaved,
  onToast,
  onNavigate,
  userRole = 'operador',
  isSystemAdmin = false,
}) {
  const normalizedRole = normalizeUserRole(userRole);
  const canManageIntegrations = isSystemAdmin || normalizedRole === 'admin' || normalizedRole === 'financeiro';
  const [googleActive, setGoogleActive] = useState(false);
  const [googleMeta, setGoogleMeta] = useState({
    service_account_email: '',
    source_spreadsheet_id: '',
    source_sheet_name: '',
    last_source_sync_at: '',
    last_source_sync_status: '',
    last_source_sync_error: '',
  });

  const loadGoogleMeta = useCallback(async () => {
    if (!companyId || globalMode) {
      setGoogleMeta({
        service_account_email: '',
        source_spreadsheet_id: '',
        source_sheet_name: '',
        last_source_sync_at: '',
        last_source_sync_status: '',
        last_source_sync_error: '',
      });
      return;
    }

    try {
      const data = await getDriveBoletosConfig(companyId);
      const hasGoogleActive = Boolean(
        (data?.source_spreadsheet_id || data?.spreadsheet_id) &&
        (data?.source_sheet_name || data?.sheet_name)
      );
      setGoogleMeta({
        service_account_email: data?.service_account_email || '',
        source_spreadsheet_id: data?.source_spreadsheet_id || data?.spreadsheet_id || '',
        source_sheet_name: data?.source_sheet_name || data?.sheet_name || '',
        last_source_sync_at: data?.last_source_sync_at || '',
        last_source_sync_status: data?.last_source_sync_status || '',
        last_source_sync_error: data?.last_source_sync_error || '',
      });
      setGoogleActive(hasGoogleActive);
    } catch (error) {
      setGoogleActive(false);
      onToast?.('erro', error.message || 'Falha ao carregar o status do Google Sheets.');
    }
  }, [companyId, globalMode, onToast]);

  useEffect(() => {
    loadGoogleMeta();
  }, [loadGoogleMeta]);

  const activeIntegrations = Number(googleActive) + 1;

  return (
    <div className="space-y-6">
      <section className="hero-mesh overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60 p-6 shadow-lifted lg:p-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-700/40 bg-blue-900/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              <ShieldCheck size={13} />
              Integracoes
            </div>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-50 lg:text-4xl">
              Integracoes
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 lg:text-base">
              Google Sheets e Google Drive continuam por empresa. O WhatsApp agora e um gateway global compartilhado pela plataforma.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <StatusCard label="Ativacao" value={`${activeIntegrations}/2 integracoes ativas`} tone="blue" />
            <StatusCard label="Escopo" value={globalMode ? 'Modo global bloqueia configuracoes por empresa' : companyName || 'Sem empresa ativa'} />
            <StatusCard label="Perfil atual" value={canManageIntegrations ? 'Pode gerenciar integracoes da empresa' : 'Somente visualiza status'} />
            <StatusCard label="Credenciais" value="Seguras no backend" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <GatewayNoticeCard canManage={canManageIntegrations} onNavigate={onNavigate} />

        <GoogleSheetsConfig
          empresaId={companyId}
          empresaNome={companyName}
          globalMode={globalMode}
          onSaved={async () => {
            await loadGoogleMeta();
            await onGoogleSheetsSaved?.();
          }}
          variant="hub"
          canManage={canManageIntegrations}
          googleMeta={googleMeta}
          onToast={onToast}
          onStatusChange={setGoogleActive}
        />
      </section>

      {!globalMode && companyId ? (
        <section className="rounded-2xl border border-slate-700/90 bg-slate-900/60 p-7 shadow-card">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-amber-500/10 text-amber-400 shadow-soft">
              <FolderOpen size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-50">Boletos no Google Drive</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">
                Configure a pasta do Drive para localizar e enviar PDFs de boleto automaticamente via WhatsApp.
              </p>
            </div>
          </div>
          <DriveBoletoConfig
            empresaId={companyId}
            canManage={canManageIntegrations}
            onToast={onToast}
            onSaved={onGoogleSheetsSaved}
          />
        </section>
      ) : null}
    </div>
  );
}
