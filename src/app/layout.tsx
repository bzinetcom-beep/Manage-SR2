import type { Metadata } from "next";
import type { ReactNode } from "react";
import ThemeProvider from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "سامانه مدیریت منابع سرباز",
  description: "سامانه جامع ثبت، مدیریت و گزارش‌گیری منابع سرباز",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="bg-slate-100 text-slate-900 antialiased dark:bg-slate-900 dark:text-slate-100" suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
