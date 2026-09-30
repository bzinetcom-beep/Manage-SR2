"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, AlertTriangle, AlertCircle, Info } from "lucide-react";

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

const PRIORITY_CFG: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode; label: string }> = {
  urgent: { bg: "bg-red-50", text: "text-red-700", border: "border-red-300", icon: <AlertCircle className="w-4 h-4" />, label: "فوری" },
  high: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-300", icon: <AlertTriangle className="w-4 h-4" />, label: "مهم" },
  normal: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-300", icon: <Bell className="w-4 h-4" />, label: "عادی" },
  low: { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-300", icon: <Info className="w-4 h-4" />, label: "کم" },
};

function faDigits(s: string): string {
  const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return s.replace(/[0-9]/g, (c) => FA[+c]);
}

function formatEventDate(iso: string | null): string {
  if (!iso) return "";
  const p = iso.split("-");
  if (p.length < 3) return "";
  return faDigits(`${p[0]}/${p[1].padStart(2, "0")}/${p[2].padStart(2, "0")}`);
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

export default function DashboardNotifications({ limit = 5 }: { limit?: number }) {
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/notifications?status=unread");
      const data = await res.json();
      setItems(data.data || []);
      setUnread(data.unreadCount || 0);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

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

  if (loading) return null;

  const grouped = {
    urgent: items.filter((i) => i.priority === "urgent"),
    high: items.filter((i) => i.priority === "high"),
    normal: items.filter((i) => i.priority === "normal"),
    low: items.filter((i) => i.priority === "low"),
  };

  const urgentCount = grouped.urgent.length;
  const highCount = grouped.high.length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      {/* Header */}
      <div className="bg-gradient-to-l from-emerald-600 to-teal-600 p-4 text-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-x-16 -translate-y-16" />
        <div className="relative flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">اعلانات و هشدارها</h2>
              <p className="text-xs text-emerald-50 mt-0.5">
                {unread > 0 ? `${faDigits(String(unread))} اعلان جدید` : "همه اعلان‌ها خوانده شده‌اند"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {urgentCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 animate-pulse">
                <AlertCircle className="w-3 h-3" /> {faDigits(String(urgentCount))} فوری
              </span>
            )}
            {highCount > 0 && (
              <span className="bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {faDigits(String(highCount))} مهم
              </span>
            )}
            {unread > 0 && (
              <button onClick={markAllRead} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-xs font-medium rounded-lg px-3 py-1.5 flex items-center gap-1 transition">
                <Check className="w-3 h-3" /> خواندن همه
              </button>
            )}
            <Link href="/notifications" className="bg-white text-emerald-700 hover:bg-emerald-50 text-xs font-bold rounded-lg px-3 py-1.5 transition">
              مشاهده همه ←
            </Link>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 divide-x divide-x-reverse divide-slate-100 border-b border-slate-100">
        {(["urgent", "high", "normal", "low"] as const).map((p) => {
          const cfg = PRIORITY_CFG[p];
          const count = grouped[p].length;
          return (
            <div key={p} className={`p-3 text-center ${count > 0 ? cfg.bg : ""}`}>
              <div className={`text-xs ${count > 0 ? cfg.text : "text-slate-400"} flex items-center justify-center gap-1`}>
                {cfg.icon} {cfg.label}
              </div>
              <div className={`text-2xl font-bold mt-1 ${count > 0 ? cfg.text : "text-slate-300"}`}>
                {faDigits(String(count))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Notifications list */}
      <div className="max-h-96 overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-2">✨</div>
            <div className="text-sm text-slate-500">در حال حاضر اعلان جدیدی وجود ندارد</div>
            <div className="text-xs text-slate-400 mt-1">با تنظیم قوانین اعلان می‌توانید هشدارهای سفارشی دریافت کنید</div>
            <Link href="/settings/notification-rules" className="inline-block mt-3 text-xs text-emerald-600 hover:underline font-medium">
              ⚙️ مدیریت قوانین اعلان
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.slice(0, limit).map((n) => {
              const cfg = PRIORITY_CFG[n.priority] || PRIORITY_CFG.normal;
              return (
                <div key={n.id} className={`p-3 hover:bg-slate-50 transition-colors border-r-4 ${cfg.border}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg ${cfg.bg} ${cfg.text} flex items-center justify-center shrink-0`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-slate-800 truncate">{n.title}</div>
                          <div className="text-xs text-slate-600 mt-1 leading-relaxed line-clamp-2">{n.message}</div>
                          <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-slate-500">
                            <span className={`${cfg.bg} ${cfg.text} font-bold px-2 py-0.5 rounded-full text-[10px]`}>{cfg.label}</span>
                            {n.eventDate && <span>📅 {formatEventDate(n.eventDate)}</span>}
                            <span>🕐 {timeAgo(n.triggeredAt)}</span>
                            {n.soldierId && (
                              <Link href={`/soldiers/${n.soldierId}`} onClick={() => markRead([n.id])} className="text-emerald-600 hover:underline font-medium">
                                مشاهده سرباز ←
                              </Link>
                            )}
                          </div>
                        </div>
                        <button onClick={() => markRead([n.id])} title="خواندن" className="w-7 h-7 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {items.length > limit && (
        <div className="p-3 border-t border-slate-100 bg-slate-50 text-center">
          <Link href="/notifications" className="text-xs text-emerald-600 hover:underline font-medium">
            مشاهده {faDigits(String(items.length - limit))} اعلان دیگر ←
          </Link>
        </div>
      )}
    </div>
  );
}
