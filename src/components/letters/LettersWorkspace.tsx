"use client";

import { useCallback, useEffect, useState } from "react";
import GenerateTab from "./GenerateTab";
import LettersTab from "./LettersTab";
import TemplatesTab from "./TemplatesTab";
import type { TemplateRow } from "./types";

export default function LettersWorkspace({ role }: { role: string }) {
  const canWrite = role === "admin" || role === "operator";
  const isAdmin = role === "admin";
  const [tab, setTab] = useState<"generate" | "letters" | "templates">("generate");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [focusBatch, setFocusBatch] = useState<number | null>(null);

  const reload = useCallback(() => {
    fetch("/api/letter-templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const TABS = [
    { key: "generate" as const, label: "تولید انبوه نامه", icon: "🚀", show: canWrite },
    { key: "letters" as const, label: "آرشیو نامه‌ها", icon: "🗂️", show: true },
    { key: "templates" as const, label: "کتابخانه قالب‌ها", icon: "📚", show: true },
  ].filter((t) => t.show);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">موتور تولید انبوه نامه</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          انتخاب گیرندگان از لیست سربازان یا فایل اکسل، انتخاب/آپلود قالب Word، و تولید گروهی نامه با خروجی Word و PDF.
        </p>
      </div>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.key
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <span className="ml-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "generate" && canWrite && (
        <GenerateTab
          templates={templates}
          reloadTemplates={reload}
          onGenerated={(batchId) => {
            setFocusBatch(batchId);
            setRefreshKey((k) => k + 1);
            setTab("letters");
          }}
        />
      )}
      {tab === "letters" && <LettersTab canWrite={canWrite} refreshKey={refreshKey} focusBatch={focusBatch} />}
      {tab === "templates" && <TemplatesTab templates={templates} reload={reload} canWrite={canWrite} isAdmin={isAdmin} />}
    </div>
  );
}
