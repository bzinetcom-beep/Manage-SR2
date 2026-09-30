"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useTheme } from "./ThemeProvider";
import { toFaDigits } from "@/lib/jalali";

const NAV = [
  { href: "/dashboard", label: "داشبورد", icon: "📊" },
  { href: "/notifications", label: "اعلانات و هشدارها", icon: "🔔" },
  { href: "/soldiers", label: "مدیریت سربازان", icon: "🪖" },
  { href: "/soldiers/new", label: "ثبت سرباز جدید", icon: "➕", write: true },
  { href: "/settled", label: "سربازان تسویه‌شده", icon: "🎖️" },
  { href: "/imports", label: "ایمپورت / اکسپورت", icon: "📥", write: true },
  { href: "/letters", label: "تولید انبوه نامه", icon: "✉️" },
  { href: "/reports", label: "گزارش‌گیری و آمار", icon: "📈" },
  { href: "/settings", label: "فیلدهای پویا و تنظیمات", icon: "⚙️", admin: true },
  { href: "/settings/quote-widget", label: "ویجت‌ها", icon: "🧩", admin: true },
  { href: "/settings/notification-rules", label: "قوانین اعلان", icon: "📣", admin: true },
  { href: "/users", label: "مدیریت کاربران", icon: "👥", admin: true },
  { href: "/settings/backup", label: "پشتیبان‌گیری و بازیابی", icon: "💾", admin: true },
  { href: "/updates", label: "بروزرسانی سامانه", icon: "🚀", admin: true },
];

export default function Sidebar({ user }: { user: { fullName: string; role: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    fetch("/api/updates/version")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.currentVersion && setVersion(d.currentVersion))
      .catch(() => {});
  }, []);

  const canWrite = user.role === "admin" || user.role === "operator";
  const isAdmin = user.role === "admin";

  const items = NAV.filter((n) => {
    if (n.admin) return isAdmin;
    if (n.write) return canWrite;
    return true;
  });

  function navigate(href: string) {
    setNavigatingTo(href);
    startTransition(() => {
      router.push(href);
    });
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden fixed top-3 right-3 z-50 bg-emerald-700 text-white p-2 rounded-lg no-print"
      >
        ☰
      </button>
      <aside
        className={`${
          open ? "translate-x-0" : "translate-x-full"
        } md:translate-x-0 fixed md:sticky top-0 right-0 z-40 h-screen w-64 bg-slate-900 dark:bg-slate-950 text-slate-100 flex flex-col transition-transform no-print`}
      >
        <div className="p-5 border-b border-slate-700">
          <div className="flex items-center gap-2 text-lg font-bold">
            <span className="text-2xl">🛡️</span>
            <span>منابع سرباز</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">سامانه مدیریت سربازان</div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin">
          {items.map((n) => {
            const isActive = pathname === n.href || (n.href !== "/dashboard" && pathname?.startsWith(n.href + "/"));
            const isLoading = navigatingTo === n.href && isPending;
            return (
              <button
                key={n.href}
                onClick={() => navigate(n.href)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-right relative ${
                  isActive
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                    : "hover:bg-slate-800 text-slate-300"
                } ${isLoading ? "opacity-70" : ""}`}
              >
                {isActive && (
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-l-full" />
                )}
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <span className="text-base">{n.icon}</span>
                )}
                <span className="flex-1">{n.label}</span>
                {isActive && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-700">
          <button
            onClick={toggle}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition"
          >
            <span className="text-base">{theme === "dark" ? "☀️" : "🌙"}</span>
            <span>{theme === "dark" ? "حالت روشن" : "حالت تاریک"}</span>
          </button>
          <div className="px-3 pt-2 text-xs text-slate-500">
            نسخه {version ? toFaDigits(version) : "۱.۰.۰"}
          </div>
        </div>
      </aside>
    </>
  );
}
