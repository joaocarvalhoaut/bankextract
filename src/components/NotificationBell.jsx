import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import {
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
  subscribeNotifications,
} from '../services/notificationService';

const toneClass = {
  info: 'border-slate-200 bg-slate-50 text-slate-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
};

const formatRelative = (value) => {
  if (!value) return '';
  const diffMinutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (diffMinutes < 60) return `${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} d`;
};

export default function NotificationBell({ companyId, onOpenNotifications, onToast }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 16 });
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const latestItems = useMemo(() => notifications.slice(0, 5), [notifications]);

  const loadNotifications = async () => {
    if (!companyId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    try {
      setLoading(true);
      const [items, unread] = await Promise.all([
        getNotifications(companyId, { includeRead: true, limit: 5 }),
        getUnreadCount(companyId),
      ]);
      setNotifications(items);
      setUnreadCount(unread);
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao carregar notificacoes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [companyId]);

  useEffect(() => subscribeNotifications((detail) => {
    if (!companyId || (detail.companyId && detail.companyId !== companyId)) return;
    loadNotifications();
  }), [companyId]);

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        top: rect.bottom + 8,
        right: Math.max(16, window.innerWidth - rect.right),
      });
    };

    const handleClickOutside = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleMarkAll = async () => {
    if (!companyId) return;
    try {
      await markAllAsRead(companyId);
      await loadNotifications();
      onToast?.('sucesso', 'Todas as notificacoes foram marcadas como lidas.');
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao marcar notificacoes como lidas.');
    }
  };

  const handleOpenItem = async (item) => {
    try {
      if (item.status !== 'read') {
        await markAsRead(item.id);
      }
    } catch (error) {
      onToast?.('erro', error.message || 'Falha ao atualizar notificacao.');
    } finally {
      setOpen(false);
      onOpenNotifications?.();
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="micro-bounce relative inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
      >
        <Bell size={16} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={menuRef}
          className="fixed z-[99999] w-[360px] max-w-[calc(100vw-32px)] rounded-3xl border border-slate-200 bg-white p-3 shadow-xl"
          style={{ top: `${position.top}px`, right: `${position.right}px` }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-2 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Notificacoes</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{unreadCount} nao lida(s)</p>
            </div>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={!companyId || unreadCount === 0}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <CheckCheck size={14} />
              Marcar tudo
            </button>
          </div>

          <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto px-1">
            {loading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Carregando notificacoes...
              </div>
            ) : latestItems.length ? (
              latestItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleOpenItem(item)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-soft ${
                    toneClass[item.severity] || toneClass.info
                  } ${item.status !== 'read' ? 'ring-1 ring-emerald-100' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs leading-relaxed opacity-90">{item.message}</p>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
                      {formatRelative(item.created_at)}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                Nenhuma notificacao recente para esta empresa.
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenNotifications?.();
            }}
            className="mt-3 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Ver todas
          </button>
        </div>
      ) : null}
    </>
  );
}
