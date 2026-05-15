import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCheck, Filter } from 'lucide-react';
import {
  getNotifications,
  markAllAsRead,
  markAsRead,
  subscribeNotifications,
} from '../services/notificationService';

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'unread', label: 'Nao lidas' },
  { id: 'important', label: 'Importantes' },
];

const severityStyles = {
  info: 'border-slate-700 bg-slate-800/40 text-slate-200',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
};

const formatDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
    : '-';

export default function NotificationsScreen({ companyId, companyName, onToast }) {
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');

  const loadNotifications = useCallback(async () => {
    if (!companyId) {
      setNotifications([]);
      return;
    }

    setLoading(true);
    try {
      const items = await getNotifications(companyId, { includeRead: true });
      setNotifications(items);
    } catch (error) {
      setNotifications([]);
      onToast?.('erro', error.message || 'Falha ao carregar notificacoes.');
    } finally {
      setLoading(false);
    }
  }, [companyId, onToast]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => subscribeNotifications((detail) => {
    if (!companyId || (detail.companyId && detail.companyId !== companyId)) return;
    loadNotifications();
  }), [companyId, loadNotifications]);

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'unread') {
      return notifications.filter((item) => item.status !== 'read');
    }
    if (activeFilter === 'important') {
      return notifications.filter((item) => ['warning', 'danger'].includes(item.severity));
    }
    return notifications;
  }, [activeFilter, notifications]);

  const unreadCount = notifications.filter((item) => item.status !== 'read').length;

  const handleMarkAllRead = async () => {
    if (!companyId || unreadCount === 0) return;
    try {
      await markAllAsRead(companyId);
      await loadNotifications();
      onToast?.('sucesso', 'Todas as notificacoes foram marcadas como lidas.');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao marcar notificacoes.');
    }
  };

  const handleReadOne = async (item) => {
    if (item.status === 'read') return;
    try {
      await markAsRead(item.id);
      await loadNotifications();
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao atualizar notificacao.');
    }
  };

  if (!companyId) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-12 text-center shadow-soft">
        <BellRing className="mx-auto mb-4 text-slate-300" size={30} />
        <h2 className="text-xl font-semibold text-slate-50">Selecione uma empresa para abrir as notificacoes</h2>
        <p className="mt-2 text-sm text-slate-500">O centro de notificacoes acompanha eventos comerciais e operacionais por company_id.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-7 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Centro de notificacoes</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-50">Eventos operacionais de {companyName || 'uma empresa ativa'}</h2>
            <p className="mt-2 text-sm text-slate-500">
              Acompanhe importacoes, cobrancas, automacoes, alertas de plano e sinais do trial em um so lugar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-300">
              {unreadCount} nao lida(s)
            </div>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800/40 disabled:opacity-50"
            >
              <CheckCheck size={15} />
              Marcar todas como lidas
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/40 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Filter size={13} />
            Filtros
          </div>
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeFilter === filter.id
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                  : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/40'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 px-6 py-10 text-center text-sm text-slate-500 shadow-soft">
            Carregando notificacoes...
          </div>
        ) : filteredNotifications.length ? (
          filteredNotifications.map((item) => (
            <article
              key={item.id}
              className={`rounded-2xl border bg-slate-900/60 p-5 shadow-soft transition hover:-translate-y-0.5 ${
                severityStyles[item.severity] || severityStyles.info
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">{item.title}</h3>
                    {item.status !== 'read' ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                        Nova
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed opacity-90">{item.message}</p>
                  <p className="mt-3 text-xs opacity-70">{formatDateTime(item.created_at)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleReadOne(item)}
                  disabled={item.status === 'read'}
                  className="rounded-2xl border border-current/20 px-4 py-2 text-sm font-semibold transition hover:bg-slate-900/60/60 disabled:opacity-50"
                >
                  {item.status === 'read' ? 'Lida' : 'Marcar como lida'}
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-14 text-center shadow-soft">
            <BellRing className="mx-auto mb-4 text-slate-300" size={30} />
            <h3 className="text-lg font-semibold text-slate-50">Nenhuma notificacao encontrada</h3>
            <p className="mt-2 text-sm text-slate-500">
              Quando importacoes, cobrancas, automacoes ou alertas de plano acontecerem, eles aparecerao aqui.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
