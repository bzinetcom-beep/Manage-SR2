"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck, Archive, Trash2, Filter } from "lucide-react";
import { isoTimestampToJalali } from "@/lib/jalali";

interface NotifItem {
  id: number;
  title: string;
  message: string;
  priority: string;
  status: string;
  soldierId: number | null;
  eventDate: string | null;
  triggeredAt: string;
  readAt: string | null;
}

const PRIORITY_STYLES: Record<string, { bg: string; text: string; dot: string; label: string; border: string }> = {
  urgent: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", label: "فوری", border: "border-red-300" },
  high: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500", label: "مهم", border: "border-orange-300" },
  normal: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", label: "عادی", border: "border-blue-300" },
  low: { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400", label: "کم", border: "border-slate-300" },
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

function formatDate(iso: string): string {
  return isoTimestampToJalali(iso);
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "read" | "archived">("unread");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?status=${filter}`);
      const data = await res.json();
      setItems(data.data || []);
      setUnread(data.unreadCount || 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(ids: number[], action: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action }),
    });
    setSelected(new Set());
    load();
  }

  async function remove(ids: number[]) {
    if (!confirm(`حذف ${faDigits(String(ids.length))} اعلان؟`)) return;
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setSelected(new Set());
    load();
  }

  function toggle(id: number) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  }

  function toggleAll() {
    if (selected.size === filteredItems.length) setSelected(new Set());
    else setSelected(new Set(filteredItems.map((i) => i.id)));
  }

  const filteredItems = items.filter((i) => !priorityFilter || i.priority === priorityFilter);

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Bell className="w-7 h-7 text-emerald-600" />
            اعلانات و هشدارها
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {unread > 0 ? `${faDigits(String(unread))} اعلان خوانده نشده` : "همه اعلان‌ها خوانده شده‌اند"}
          </p>
        </div>
        <div className="flex gap-2">
          {unread > 0 && (
            <button onClick={() => patch([], "read_all")} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg px-4 py-2 flex items-center gap-2">
              <CheckCheck className="w-4 h-4" /> خواندن همه
            </button>
          )}
          {selected.size > 0 && (
            <>
              <button onClick={() => patch(Array.from(selected), "read")} className="bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg px-3 py-2 flex items-center gap-1">
                <Check className="w-4 h-4" /> خواندن ({faDigits(String(selected.size))})
              </button>
              <button onClick={() => patch(Array.from(selected), "archive")} className="bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg px-3 py-2 flex items-center gap-1">
                <Archive className="w-4 h-4" /> آرشیو
              </button>
              <button onClick={() => remove(Array.from(selected))} className="bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg px-3 py-2 flex items-center gap-1">
                <Trash2 className="w-4 h-4" /> حذف
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {(["unread", "read", "archived", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-sm px-4 py-2 rounded-lg transition ${
                filter === f ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f === "unread" ? "نخوانده" : f === "read" ? "خوانده" : f === "archived" ? "آرشیو" : "همه"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="">همه اولویت‌ها</option>
            <option value="urgent">فوری</option>
            <option value="high">مهم</option>
            <option value="normal">عادی</option>
            <option value="low">کم</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">در حال بارگذاری...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-5xl mb-3">✨</div>
            <div className="text-slate-500">اعلانی در این دسته وجود ندارد</div>
          </div>
        ) : (
          <>
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3 text-sm">
              <input type="checkbox" checked={selected.size === filteredItems.length && filteredItems.length > 0} onChange={toggleAll} className="w-4 h-4" />
              <span className="text-slate-600">{faDigits(String(filteredItems.length))} اعلان</span>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredItems.map((n) => {
                const p = PRIORITY_STYLES[n.priority] || PRIORITY_STYLES.normal;
                const isSelected = selected.has(n.id);
                return (
                  <div key={n.id} className={`p-4 hover:bg-slate-50 transition-colors ${isSelected ? "bg-blue-50/50" : ""} border-r-4 ${p.border}`}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={isSelected} onChange={() => toggle(n.id)} className="w-4 h-4 mt-1" />
                      <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${p.dot} ${n.status === "unread" ? "animate-pulse" : "opacity-50"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className={`text-sm ${n.status === "unread" ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                                {n.title}
                              </h3>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.bg} ${p.text}`}>{p.label}</span>
                              {n.status === "unread" && <span className="text-[10px] font-bold text-emerald-600">● جدید</span>}
                            </div>
                            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                            <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-slate-500">
                              {n.eventDate && <span>📅 رویداد: {formatEventDate(n.eventDate)}</span>}
                              <span>🕐 {formatDate(n.triggeredAt)}</span>
                              {n.soldierId && (
                                <Link href={`/soldiers/${n.soldierId}`} className="text-emerald-600 hover:underline font-medium">
                                  مشاهده سرباز ←
                                </Link>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {n.status !== "read" && (
                              <button onClick={() => patch([n.id], "read")} title="خواندن" className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center justify-center">
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {n.status !== "archived" && (
                              <button onClick={() => patch([n.id], "archive")} title="آرشیو" className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 flex items-center justify-center">
                                <Archive className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => remove([n.id])} title="حذف" className="w-8 h-8 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
