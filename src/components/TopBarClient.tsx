"use client";

import { useRouter } from "next/navigation";
import { LogOut, User, Moon, Sun } from "lucide-react";
import NotificationBell from "./NotificationBell";
import RealtimeToast from "./RealtimeToast";
import { useTheme } from "./ThemeProvider";

export default function TopBarClient({ user }: { user: { fullName: string; role: string } }) {
  const router = useRouter();
  const { theme, toggle } = useTheme();

  const roleLabel =
    user.role === "admin" ? "مدیر سیستم" : user.role === "operator" ? "کاربر ثبت" : "مشاهده‌گر";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <RealtimeToast />
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm no-print">
      <div className="flex items-center justify-between px-4 md:px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md">
            <User className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{user.fullName}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{roleLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button
            onClick={toggle}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title={theme === "dark" ? "حالت روشن" : "حالت تاریک"}
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 text-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 transition-colors"
            title="خروج"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline">خروج</span>
          </button>
        </div>
      </div>
    </header>
    </>
  );
}
