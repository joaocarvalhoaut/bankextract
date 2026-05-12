import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Info, X } from 'lucide-react';
import {
  dismissCenterNotification,
  notifyCenter,
  subscribeNotificationCenter,
} from '../../services/notificationCenterService';

const NotificationCenterContext = createContext({
  notify: notifyCenter,
  dismiss: dismissCenterNotification,
});

const toneMap = {
  success: {
    icon: CheckCircle2,
    wrapper: 'border-blue-500/30 bg-blue-500/10 text-blue-50',
    accent: 'text-cyan-300',
  },
  warning: {
    icon: AlertTriangle,
    wrapper: 'border-amber-500/30 bg-amber-500/10 text-amber-50',
    accent: 'text-amber-200',
  },
  error: {
    icon: AlertTriangle,
    wrapper: 'border-red-500/30 bg-red-500/10 text-red-50',
    accent: 'text-red-200',
  },
  info: {
    icon: Info,
    wrapper: 'border-slate-600 bg-slate-900/80 text-slate-50',
    accent: 'text-cyan-300',
  },
};

function NotificationCenterViewport({ notifications }) {
  useEffect(() => {
    const timers = notifications
      .filter((item) => !item.sticky)
      .map((item) =>
        window.setTimeout(() => {
          dismissCenterNotification(item.id);
        }, 4200)
      );

    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [notifications]);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[99999] flex w-full max-w-sm flex-col gap-3">
      {notifications.map((item) => {
        const tone = toneMap[item.type] || toneMap.info;
        const Icon = tone.icon || BellRing;
        return (
          <div
            key={item.id}
            className={`pointer-events-auto overflow-hidden rounded-[24px] border px-4 py-4 shadow-2xl backdrop-blur ${tone.wrapper}`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 ${tone.accent}`}>
                <Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                {item.title ? <p className="text-sm font-semibold">{item.title}</p> : null}
                <p className="mt-1 text-sm leading-relaxed text-slate-200">{item.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissCenterNotification(item.id)}
                className="rounded-xl border border-white/10 bg-white/5 p-1.5 text-slate-300 transition hover:bg-white/10"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NotificationCenterProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => subscribeNotificationCenter(setNotifications), []);

  const value = useMemo(
    () => ({
      notify: notifyCenter,
      dismiss: dismissCenterNotification,
    }),
    []
  );

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
      <NotificationCenterViewport notifications={notifications} />
    </NotificationCenterContext.Provider>
  );
}

export function useNotificationCenter() {
  return useContext(NotificationCenterContext);
}

export default NotificationCenterProvider;
