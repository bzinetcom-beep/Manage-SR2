"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, X, ExternalLink, ShieldAlert, Heart, Calendar } from "lucide-react";

interface ToastNotif {
  id: number;
  title: string;
  message: string;
  priority: string;
  soldierId?: number | null;
  eventDate?: string | null;
  timestamp: string;
}

const PRIORITY_THEMES: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  urgent: {
    bg: "bg-red-900/90 text-white shadow-red-900/30",
    border: "border-red-500",
    text: "text-red-100",
    iconBg: "bg-red-600 text-white animate-bounce",
  },
  high: {
    bg: "bg-orange-900/90 text-white shadow-orange-900/30",
    border: "border-orange-500",
    text: "text-orange-100",
    iconBg: "bg-orange-600 text-white",
  },
  normal: {
    bg: "bg-slate-900/90 text-white shadow-slate-900/30",
    border: "border-emerald-500",
    text: "text-slate-200",
    iconBg: "bg-emerald-600 text-white",
  },
  low: {
    bg: "bg-slate-800/90 text-white shadow-slate-800/30",
    border: "border-slate-600",
    text: "text-slate-300",
    iconBg: "bg-slate-700 text-white",
  },
};

export default function RealtimeToast() {
  const [toasts, setToasts] = useState<ToastNotif[]>([]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;

    function connect() {
      eventSource = new EventSource("/api/notifications/stream");

      eventSource.addEventListener("notification", (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.action === "created" && payload.data) {
            const notif = payload.data as ToastNotif;
            setToasts((prev) => [notif, ...prev.slice(0, 4)]); // Keep max 5 recent
          }
        } catch (err) {
          console.error("Error parsing notification stream data:", err);
        }
      });

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        // Auto reconnect after 5 seconds
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 z-[9999] flex flex-col gap-3 max-w-md w-full pointer-events-none dir-rtl">
      {toasts.map((toast) => {
        const theme = PRIORITY_THEMES[toast.priority] || PRIORITY_THEMES.normal;

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border ${theme.border} ${theme.bg} backdrop-blur-md shadow-2xl transition-all transform animate-in slide-in-from-top-4 duration-300`}
          >
            <div className={`p-2.5 rounded-xl shrink-0 ${theme.iconBg}`}>
              {toast.priority === "urgent" ? (
                <ShieldAlert className="w-5 h-5" />
              ) : toast.title.includes("ازدواج") ? (
                <Heart className="w-5 h-5" />
              ) : (
                <Bell className="w-5 h-5" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
                  اعلان زنده
                </span>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                  title="بستن"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <h4 className="font-bold text-sm text-white mt-1 leading-snug">{toast.title}</h4>
              <p className={`text-xs ${theme.text} mt-1 leading-relaxed line-clamp-2`}>{toast.message}</p>

              {toast.soldierId && (
                <div className="mt-2.5 flex items-center justify-end">
                  <Link
                    href={`/soldiers/${toast.soldierId}`}
                    onClick={() => removeToast(toast.id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-100 hover:underline"
                  >
                    <span>مشاهده پرونده سرباز</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
