"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck, Archive, Trash2, X } from "lucide-react";

interface NotifItem {
  id: number;
  title: string;
  message: string;
  priority: string;
  status: string;
  soldierId: number | null;
  eventDate: string | null;
  triggeredAt: string;
}

const PRIORITY_STYLES: Record<string, { bg: string; text: string; ring: string; dot: string; label: string }> = {
  urgent: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-300", dot: "bg-red-500", label: "فوری" },
  high: { bg: "bg-orange-50", text: "text-orange-700", ring: "ring-orange-300", dot: "bg-orange-500", label: "مهم" },
  normal: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-300", dot: "bg-blue-500", label: "عادی" },
  low: { bg: "bg-slate-50", text: "text-slate-600", ring: "ring-slate-300", dot: "bg-slate-400", label: "کم" },
};

function faDigits(s: string): string {
  const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return s.replace(/[0-9]/g, (c) => FA[+c]);
}

function formatEventDate(iso: string | null): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length < 3) return "";
  return faDigits(`${parts[0]}/${parts[1].padStart(2, "0")}/${parts[2].padStart(2, "0")}`);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "همین الان";
  if (min < 60) return faDigits(`${min} دقیقه پیش`);
  const h = Math.floor(min / 60);
  if (h < 24) return faDigits(`${h} ساعت پیش`);
  const d = Math.floor(h / 24);
  return faDigits(`${d} روز پیش`);
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?status=unread");
      const data = await res.json();
      setItems(data.data || []);
      setUnread(data.unreadCount || 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    // Subscribe to Realtime SSE Notification Stream
    let eventSource: EventSource | null = new EventSource("/api/notifications/stream");

    eventSource.addEventListener("connected", (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (typeof payload.unreadCount === "number") {
          setUnread(payload.unreadCount);
        }
      } catch (err) {}
    });

    eventSource.addEventListener("notification", (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (typeof payload.unreadCount === "number") {
          setUnread(payload.unreadCount);
        }
        // Auto reload list if dropdown is open or notification changed
        load();
      } catch (err) {}
    });

    eventSource.onerror = () => {
      // Fallback polling if disconnected
    };

    const t = setInterval(load, 60000); // fallback backup polling
    return () => {
      clearInterval(t);
      if (eventSource) eventSource.close();
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function markRead(ids: number[]) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "read" }),
    });
    load();
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_all" }),
    });
    load();
  }

  async function removeNotif(ids: number[]) {
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    load();
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative w-10 h-10 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-600 text-slate-700 border border-slate-200 flex items-center justify-center transition-colors"
        title="اعلانات"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center shadow-md ring-2 ring-white animate-pulse">
            {faDigits(unread > 99 ? "99+" : String(unread))}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-12 left-0 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-l from-emerald-50 to-white">
            <div>
              <h3 className="font-bold text-slate-800">🔔 اعلانات</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {unread > 0 ? `${faDigits(String(unread))} اعلان خوانده نشده` : "همه اعلان‌ها خوانده شده‌اند"}
              </p>
            </div>
            <div className="flex gap-1">
              {unread > 0 && (
                <button onClick={markAllRead} title="خواندن همه" className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center justify-center">
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <Link href="/notifications" onClick={() => setOpen(false)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center" title="مشاهده همه">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </Link>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">در حال بارگذاری...</div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-4xl mb-2">✨</div>
                <div className="text-sm text-slate-500">اعلان جدیدی وجود ندارد</div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {items.slice(0, 10).map((n) => {
                  const p = PRIORITY_STYLES[n.priority] || PRIORITY_STYLES.normal;
                  return (
                    <div key={n.id} className={`p-3 hover:bg-slate-50 transition-colors ${p.bg} border-r-4 ${p.dot.replace("bg-", "border-")}`}>
                      <div className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${p.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-slate-800 truncate">{n.title}</div>
                              <div className="text-xs text-slate-600 mt-1 leading-relaxed line-clamp-2">{n.message}</div>
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.bg} ${p.text}`}>{p.label}</span>
                                {n.eventDate && <span className="text-[10px] text-slate-500">📅 {formatEventDate(n.eventDate)}</span>}
                                {n.soldierId && (
                                  <Link href={`/soldiers/${n.soldierId}`} onClick={() => { markRead([n.id]); setOpen(false); }} className="text-[10px] text-emerald-600 hover:underline">
                                    مشاهده سرباز
                                  </Link>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="text-[10px] text-slate-400">{timeAgo(n.triggeredAt)}</span>
                              <div className="flex gap-1">
                                <button onClick={() => markRead([n.id])} title="خواندن" className="w-6 h-6 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center justify-center">
                                  <Check className="w-3 h-3" />
                                </button>
                                <button onClick={() => removeNotif([n.id])} title="حذف" className="w-6 h-6 rounded bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
              <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs text-emerald-600 hover:underline font-medium">
                مشاهده همه اعلانات ←
              </Link>
              <Link href="/settings/notification-rules" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:underline">
                ⚙️ مدیریت قوانین
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
