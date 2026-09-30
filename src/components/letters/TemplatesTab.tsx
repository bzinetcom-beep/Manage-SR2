"use client";

import { useMemo, useRef, useState } from "react";
import type { ParamDef, TemplateRow } from "./types";
import LetterVisualEditor, { htmlToEditable, editableToHtml } from "./LetterVisualEditor";
import { ALL_TOKENS } from "@/lib/letter-engine";
import { toFaDigits } from "@/lib/jalali";

interface Props {
  templates: TemplateRow[];
  reload: () => void;
  canWrite: boolean;
  isAdmin: boolean;
}

type Draft = Partial<TemplateRow> & { params?: ParamDef[] };
type Section = "headerHtml" | "bodyHtml" | "footerHtml";

const EMPTY: Draft = {
  name: "",
  category: "عمومی",
  description: "",
  subject: "",
  headerHtml: "",
  bodyHtml:
    '<p style="line-height:2.1;text-align:justify;font-size:12pt">متن نامه… می‌توانید از جای‌نگهدارها مانند {{نام}} {{نام_خانوادگی}} استفاده کنید.</p>',
  footerHtml: "",
  pageSize: "A4",
  params: [],
};

const SECTION_LABEL: Record<Section, string> = {
  headerHtml: "سربرگ",
  bodyHtml: "متن نامه",
  footerHtml: "امضا / پاورقی",
};

export default function TemplatesTab({ templates, reload, canWrite, isAdmin }: Props) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [field, setField] = useState<Section>("bodyHtml");
  const [advanced, setAdvanced] = useState(false);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const grouped = useMemo(() => {
    const g: Record<string, TemplateRow[]> = {};
    const list = search.trim()
      ? templates.filter(
          (t) =>
            t.name.includes(search.trim()) ||
            t.category.includes(search.trim()) ||
            (t.description || "").includes(search.trim()),
        )
      : templates;
    for (const t of list) (g[t.category] ||= []).push(t);
    return g;
  }, [templates, search]);

  async function save() {
    if (!editing?.name) {
      setMsg("نام قالب الزامی است");
      return;
    }
    setBusy(true);
    try {
      const isNew = !editing.id;
      const res = await fetch(isNew ? "/api/letter-templates" : `/api/letter-templates/${editing.id}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "خطا در ذخیره");
      setMsg("ذخیره شد ✅");
      setEditing(null);
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("حذف این قالب؟")) return;
    const res = await fetch(`/api/letter-templates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      setMsg(d.error || "خطا");
      return;
    }
    reload();
  }

  async function duplicate(t: TemplateRow) {
    setBusy(true);
    await fetch("/api/letter-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...t, id: undefined, name: `${t.name} (کپی)`, source: "custom" }),
    });
    setBusy(false);
    reload();
  }

  async function uploadDocx(f: File) {
    setBusy(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("name", f.name.replace(/\.docx?$/i, ""));
      const res = await fetch("/api/letter-templates/import-docx", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "خطا در بارگذاری");
      setMsg(
        `قالب Word وارد شد ✅ — جای‌نگهدارهای شناسایی‌شده: ${d.detectedPlaceholders?.join("، ") || "بدون جای‌نگهدار"}`,
      );
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function insertToken(tok: string) {
    if (!editing) return;
    const text = `{{${tok}}}`;
    const cur = (editing[field] as string) || "";
    const el = areaRef.current;
    if (advanced && el && el.selectionStart !== undefined) {
      const s = el.selectionStart;
      const next = cur.slice(0, s) + text + cur.slice(el.selectionEnd);
      setEditing({ ...editing, [field]: next });
    } else {
      setEditing({ ...editing, [field]: cur + text });
    }
  }

  const combined = editing ? `${editing.headerHtml || ""}${editing.bodyHtml || ""}${editing.footerHtml || ""}` : "";

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">{editing.id ? "ویرایش قالب" : "قالب جدید"}</h3>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">
              ذخیره
            </button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 dark:text-slate-100 text-sm">
              انصراف
            </button>
          </div>
        </div>
        {msg && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">{msg}</div>}

        <div className="grid gap-3 md:grid-cols-4">
          <input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="نام قالب" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
          <input value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="دسته‌بندی" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
          <input value={editing.subject || ""} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} placeholder="موضوع نامه" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
          <select value={editing.pageSize || "A4"} onChange={(e) => setEditing({ ...editing, pageSize: e.target.value })} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
            <option value="A4">اندازه کاغذ A4</option>
            <option value="A5">اندازه کاغذ A5</option>
          </select>
        </div>
        <input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="توضیح کوتاه" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />

        {/* ------------------- ویرایش گرافیکی ------------------- */}
        <div className="flex flex-wrap gap-1">
          {(["headerHtml", "bodyHtml", "footerHtml"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setField(f)}
              className={`px-3 py-1.5 rounded-lg text-xs ${field === f ? "bg-emerald-600 text-white" : "bg-slate-200 dark:bg-slate-700 dark:text-slate-100"}`}
            >
              {SECTION_LABEL[f]}
            </button>
          ))}
          <button
            onClick={() => setAdvanced((a) => !a)}
            className="px-3 py-1.5 rounded-lg text-xs mr-auto bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          >
            {advanced ? "✕ بستن حالت پیشرفته" : "⚙️ حالت پیشرفته (کد HTML)"}
          </button>
        </div>

        {!advanced ? (
          <LetterVisualEditor
            key={field + String(editing.id ?? "new")}
            label={`ویرایش گرافیکی ${SECTION_LABEL[field]} — مثل Word بنویسید (بدون کد HTML)`}
            value={(editing[field] as string) || ""}
            onChange={(html) => setEditing({ ...editing, [field]: html })}
            height={420}
          />
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <textarea
                ref={areaRef}
                dir="ltr"
                value={(editing[field] as string) || ""}
                onChange={(e) => setEditing({ ...editing, [field]: e.target.value })}
                className="w-full h-[420px] font-mono text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-slate-100"
              />
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-800 max-h-52 overflow-auto">
                <div className="text-xs font-bold mb-2">درج جای‌نگهدار (کلیک کنید)</div>
                <div className="flex flex-wrap gap-1">
                  {ALL_TOKENS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => insertToken(t.aliases?.[0] || t.key)}
                      className="text-[11px] px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-emerald-100 dark:hover:bg-emerald-800"
                      title={`{{${t.aliases?.[0] || t.key}}}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-slate-200 dark:bg-slate-900 rounded-2xl p-3 overflow-auto max-h-[640px]">
              <div className="text-xs text-slate-500 mb-2 text-center">پیش‌نمایش زنده</div>
              <div
                dir="rtl"
                className="srms-paper mx-auto"
                style={{
                  width: editing.pageSize === "A5" ? "148mm" : "210mm",
                  minHeight: "150mm",
                  padding: "15mm",
                  fontFamily: "Vazirmatn, Tahoma, sans-serif",
                  transform: "scale(0.72)",
                  transformOrigin: "top center",
                }}
                dangerouslySetInnerHTML={{ __html: combined }}
              />
            </div>
          </div>
        )}

        {!advanced && (
          <div className="bg-slate-200 dark:bg-slate-900 rounded-2xl p-3 overflow-auto">
            <div className="text-xs text-slate-500 mb-2 text-center">پیش‌نمایش زنده کاغذ (تراشه‌های سبز = داده سرباز)</div>
            <div
              dir="rtl"
              className="srms-paper mx-auto overflow-hidden"
              style={{
                width: editing.pageSize === "A5" ? "148mm" : "210mm",
                minHeight: "150mm",
                padding: "12mm",
                fontFamily: "Vazirmatn, Tahoma, sans-serif",
                transform: "scale(0.8)",
                transformOrigin: "top center",
              }}
              dangerouslySetInnerHTML={{ __html: htmlToEditable(combined) }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {canWrite && (
          <>
            <button onClick={() => { setEditing({ ...EMPTY }); setMsg(""); }} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">
              ➕ قالب جدید
            </button>
            <label className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm cursor-pointer">
              📎 آپلود قالب Word (.docx)
              <input ref={fileRef} type="file" accept=".docx" className="hidden" onChange={(e) => e.target.files?.[0] && uploadDocx(e.target.files[0])} />
            </label>
          </>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجوی قالب…"
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm w-48"
        />
        {busy && <span className="text-xs text-amber-600 animate-pulse">در حال پردازش…</span>}
      </div>
      {msg && <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2 leading-6">{msg}</div>}

      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 text-xs leading-7 text-slate-600 dark:text-slate-300">
        💡 قالب‌ها را با <b>ویرایشگر گرافیکی</b> (شبیه Word) بسازید. در فایل Word خود، محل‌های متغیر را به‌صورت{" "}
        <span className="font-mono">{"{{کد_ملی}}"}
        </span> یا <span className="font-mono">{"[[کد_ملی]]"}</span> یا <span className="font-mono">{"<<کد_ملی>>"}</span> بنویسید؛
        سامانه آن‌ها را خودکار شناسایی و برای هر سرباز پر می‌کند.
      </div>

      {Object.entries(grouped).map(([cat, list]) => (
        <div key={cat} className="space-y-2">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 px-1">{cat}</div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {list.map((t) => (
              <div key={t.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{t.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 whitespace-nowrap">
                    {t.source === "builtin" ? "سیستمی" : t.source === "docx" ? "Word" : "سفارشی"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-6 line-clamp-2">{t.description}</p>
                <div className="text-[10px] text-slate-400">
                  {t.pageSize} • {toFaDigits(t.params?.length || 0)} پارامتر • {toFaDigits(t.usageCount)} استفاده
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {canWrite && (
                    <button
                      onClick={() => { setEditing({ ...t }); setField("bodyHtml"); setMsg(""); }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px]"
                    >
                      ✍️ ویرایش گرافیکی
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => remove(t.id)} className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200 text-[11px]">
                      حذف
                    </button>
                  )}
                  {canWrite && (
                    <button onClick={() => duplicate(t)} className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 dark:text-slate-100 text-[11px]">
                      کپی
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {!Object.keys(grouped).length && <div className="text-sm text-slate-500">قالبی یافت نشد.</div>}
    </div>
  );
}
