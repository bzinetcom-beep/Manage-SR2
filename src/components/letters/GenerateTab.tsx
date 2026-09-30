"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ParamDef, RecipientRow, TemplateRow } from "./types";
import LetterVisualEditor from "./LetterVisualEditor";
import { toFaDigits } from "@/lib/jalali";
import * as jalaali from "jalaali-js";

interface Props {
  templates: TemplateRow[];
  onGenerated: (batchId: number, count: number) => void;
  reloadTemplates: () => void;
}

const STEPS = ["انتخاب قالب", "انتخاب گیرندگان", "تکمیل اطلاعات", "پیش‌نمایش و ویرایش گرافیکی"];

type StatusFilter = "active" | "settled" | "all";

const STATUS_TABS: { key: StatusFilter; label: string; hint: string }[] = [
  { key: "active", label: "در حال خدمت", hint: "فقط سربازانی که هنوز در حال خدمت هستند" },
  { key: "settled", label: "تسویه‌شده", hint: "سربازانی که خدمت‌شان پایان یافته است" },
  { key: "all", label: "همه", hint: "همه سربازان ثبت‌شده" },
];

function serviceStatus(endDate: string | null | undefined): "در حال خدمت" | "تسویه شده" {
  if (!endDate) return "در حال خدمت";
  const parts = endDate.split("T")[0].split("-").map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((p) => isNaN(p))) return "در حال خدمت";
  const [y, m, d] = parts;
  if (y >= 1900) return "تسویه شده";
  const g = jalaali.toGregorian(y, m, d);
  const end = new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return end.getTime() < today.getTime() ? "تسویه شده" : "در حال خدمت";
}

interface OverrideState {
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
}

export default function GenerateTab({ templates, onGenerated, reloadTemplates }: Props) {
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [counts, setCounts] = useState<{ active: number; all: number; settled: number; matched: number } | null>(null);
  const [units, setUnits] = useState<string[]>([]);
  const [ranks, setRanks] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState("");
  const [rank, setRank] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [params, setParams] = useState<Record<string, string>>({});
  const [perSoldier, setPerSoldier] = useState<Record<string, Record<string, string>>>({});
  const [excelInfo, setExcelInfo] = useState<{ matched: number; unmatched: { row: number; name: string; nationalCode: string }[]; extraColumns: string[] } | null>(null);
  const [numberPrefix, setNumberPrefix] = useState("۱۴۰۴/م");
  const [numberStart, setNumberStart] = useState(1);
  const [batchTitle, setBatchTitle] = useState("");

  // --- پیش‌نمایش و ویرایش گرافیکی ---
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewMode, setPreviewMode] = useState<"paper" | "edit">("paper");
  const [override, setOverride] = useState<OverrideState | null>(null);
  const [editSection, setEditSection] = useState<"headerHtml" | "bodyHtml" | "footerHtml">("bodyHtml");
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [focusedSoldier, setFocusedSoldier] = useState<number | null>(null);
  const [perSoldierHtml, setPerSoldierHtml] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState(0.85);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const template = useMemo(() => templates.find((t) => t.id === templateId) || null, [templates, templateId]);
  const selectedRows = useMemo(() => recipients.filter((r) => selected.has(r.id)), [recipients, selected]);

  useEffect(() => {
    setLoadingList(true);
    const url = `/api/letters/recipients?q=${encodeURIComponent(q)}&unit=${encodeURIComponent(
      unit,
    )}&rank=${encodeURIComponent(rank)}&status=${statusFilter}&limit=1000`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setRecipients(d.data || []);
        if (d.units?.length) setUnits(d.units);
        if (d.ranks?.length) setRanks(d.ranks);
        if (d.counts) setCounts(d.counts);
      })
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, [q, unit, rank, statusFilter]);

  useEffect(() => {
    if (!template) return;
    const init: Record<string, string> = {};
    for (const p of template.params || []) init[p.key] = p.defaultValue || "";
    setParams((prev) => ({ ...init, ...prev }));
    setBatchTitle((b) => b || template.name);
  }, [template]);

  // انتخاب پیش‌فرض همه‌ی گیرندگانِ فیلترشده (سربازان در حال خدمت)
  useEffect(() => {
    if (step !== 1) return;
    setSelected((prev) => {
      const n = new Set<number>();
      recipients.forEach((r) => n.add(r.id));
      return n;
    });
  }, [step, statusFilter, recipients.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAllVisible() {
    setSelected((s) => {
      const n = new Set(s);
      recipients.forEach((r) => n.add(r.id));
      return n;
    });
  }

  async function uploadExcel(f: File) {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/letters/import-excel", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "خطا در خواندن فایل");
      const matched = d.data.matched as { id: number; name: string; serviceUnit: string | null; params: Record<string, string> }[];
      setSelected(new Set(matched.map((m) => m.id)));
      const per: Record<string, Record<string, string>> = {};
      for (const m of matched) if (Object.keys(m.params).length) per[String(m.id)] = m.params;
      setPerSoldier(per);
      setExcelInfo({ matched: matched.length, unmatched: d.data.unmatched, extraColumns: d.data.extraColumns });
      setMsg({ type: "ok", text: `${toFaDigits(matched.length)} سرباز از فایل اکسل شناسایی و انتخاب شد.` });
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const buildPayload = useCallback(
    (onlyFirst: boolean) => ({
      templateId,
      soldierIds: onlyFirst ? [...selected].slice(0, 1) : [...selected],
      params,
      perSoldierParams: perSoldier,
      numberPrefix,
      numberStart,
      templateOverride: override || undefined,
      perSoldierHtml: onlyFirst ? undefined : perSoldierHtml,
      saveTemplate: onlyFirst ? false : saveTemplate,
    }),
    [templateId, selected, params, perSoldier, numberPrefix, numberStart, override, perSoldierHtml, saveTemplate],
  );

  const loadPreview = useCallback(
    async (soldierId?: number | null) => {
      if (!templateId) return;
      setBusy(true);
      try {
        const body: Record<string, unknown> = { ...buildPayload(true) };
        const target = soldierId ?? focusedSoldier ?? [...selected][0];
        if (target) body.soldierIds = [target];
        const res = await fetch("/api/letters/generate", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await res.json();
        setPreviewHtml(d?.data?.html || "");
        if (d?.data?.template && !override) {
          setOverride({
            headerHtml: d.data.template.headerHtml || "",
            bodyHtml: d.data.template.bodyHtml || "",
            footerHtml: d.data.template.footerHtml || "",
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [templateId, buildPayload, focusedSoldier, selected, override],
  );

  async function generate() {
    if (!templateId || selected.size === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/letters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildPayload(false),
          batchTitle,
          source: excelInfo ? "excel" : "selection",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "خطا در تولید");
      setMsg({ type: "ok", text: `${toFaDigits(d.data.count)} نامه با موفقیت تولید شد.` });
      reloadTemplates();
      onGenerated(d.data.batchId, d.data.count);
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const paramDefs: ParamDef[] = template?.params || [];
  const visibleParams = paramDefs.filter((p) => p.type !== "auto");
  const pageWidth = template?.pageSize === "A5" ? "148mm" : "210mm";
  const overriddenCount = Object.keys(perSoldierHtml).length;

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className={`px-3 py-2 rounded-xl text-sm border transition ${
              step === i
                ? "bg-emerald-600 text-white border-emerald-600 shadow"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
            }`}
          >
            <span className="font-bold ml-1">{toFaDigits(i + 1)}.</span> {s}
          </button>
        ))}
      </div>

      {msg && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            msg.type === "ok" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Step 1 — template */}
      {step === 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {templates.filter((t) => t.isActive).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTemplateId(t.id);
                setOverride(null);
                setPerSoldierHtml({});
                setStep(1);
              }}
              className={`text-right p-4 rounded-2xl border transition shadow-sm hover:shadow-md ${
                templateId === t.id
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-100">{t.name}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {t.category}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-6 line-clamp-2">{t.description}</p>
              <div className="text-[11px] text-slate-400 mt-2">
                {t.pageSize} • {toFaDigits(t.params?.length || 0)} پارامتر • {toFaDigits(t.usageCount)} بار استفاده
              </div>
            </button>
          ))}
          {!templates.length && <div className="text-sm text-slate-500">قالبی موجود نیست.</div>}
        </div>
      )}

      {/* Step 2 — recipients */}
      {step === 1 && (
        <div className="space-y-4">
          {/* وضعیت خدمت */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">وضعیت خدمت گیرندگان</div>
            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.key}
                  title={t.hint}
                  onClick={() => setStatusFilter(t.key)}
                  className={`px-4 py-2 rounded-xl text-sm border transition ${
                    statusFilter === t.key
                      ? "bg-emerald-600 text-white border-emerald-600 shadow"
                      : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {t.label}
                  {counts && (
                    <span className="mr-2 text-[11px] opacity-80">
                      ({toFaDigits(t.key === "active" ? counts.active : t.key === "settled" ? counts.settled : counts.all)})
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-6">
              به‌صورت پیش‌فرض، سربازان <b>در حال خدمت</b> نمایش داده می‌شوند. اگر می‌خواهید تسویه‌شده‌ها هم نامه بگیرند،
              گزینه «همه» یا «تسویه‌شده» را انتخاب کنید.
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجو نام / کد ملی / یگان…"
              className="flex-1 min-w-[200px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
              <option value="">همه یگان‌ها</option>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <select value={rank} onChange={(e) => setRank(e.target.value)} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
              <option value="">همه درجه‌ها</option>
              {ranks.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={selectAllVisible} className="px-3 py-2 rounded-xl bg-slate-800 text-white text-sm">انتخاب همه نمایش‌داده‌شده</button>
            <button onClick={() => setSelected(new Set())} className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 dark:text-slate-100 text-sm">پاک‌کردن انتخاب</button>
            <label className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm cursor-pointer">
              📄 بارگذاری سربازان دلخواه از اکسل
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadExcel(e.target.files[0])}
              />
            </label>
          </div>

          <div className="rounded-xl border border-sky-200 bg-sky-50 dark:bg-sky-900/20 dark:border-sky-800 p-3 text-[11px] leading-6 text-sky-900 dark:text-sky-200">
            📥 فایل اکسل می‌تواند شامل ستون‌های <b>کد ملی</b>، <b>شماره پرسنلی</b> یا <b>نام و نام خانوادگی</b> باشد.
            هر ستون اضافی (مثل «مبلغ کمک‌هزینه») به‌عنوان مقدار اختصاصی همان نفر در نامه درج می‌شود.
          </div>

          {excelInfo && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-xs leading-6">
              <div>✅ تطبیق‌یافته: {toFaDigits(excelInfo.matched)} — ❌ تطبیق‌نیافته: {toFaDigits(excelInfo.unmatched.length)}</div>
              {excelInfo.extraColumns.length > 0 && (
                <div>🧩 ستون‌های اضافی اکسل که به‌عنوان مقدار اختصاصی هر نفر استفاده می‌شوند: {excelInfo.extraColumns.join("، ")}</div>
              )}
              {excelInfo.unmatched.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer">مشاهده ردیف‌های تطبیق‌نیافته</summary>
                  <ul className="mt-1 max-h-32 overflow-auto">
                    {excelInfo.unmatched.map((u) => (
                      <li key={u.row}>ردیف {toFaDigits(u.row)}: {u.name || "—"} {u.nationalCode}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300 flex justify-between">
              <span>{loadingList ? "در حال بارگذاری…" : `${toFaDigits(recipients.length)} سرباز`}</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400">انتخاب‌شده: {toFaDigits(selected.size)}</span>
            </div>
            <div className="max-h-[380px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-900 sticky top-0">
                  <tr className="text-xs text-slate-600 dark:text-slate-300">
                    <th className="p-2 w-10"></th>
                    <th className="p-2 text-right">نام</th>
                    <th className="p-2 text-right">کد ملی</th>
                    <th className="p-2 text-right">شماره تماس</th>
                    <th className="p-2 text-right">وضعیت جسمانی</th>
                    <th className="p-2 text-right">درجه</th>
                    <th className="p-2 text-right">یگان</th>
                    <th className="p-2 text-right">پایان خدمت</th>
                    <th className="p-2 text-right">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => {
                    const st = serviceStatus(r.serviceEndDate);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => toggle(r.id)}
                        className={`cursor-pointer border-t border-slate-100 dark:border-slate-700 ${
                          selected.has(r.id) ? "bg-emerald-50 dark:bg-emerald-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-700/40"
                        }`}
                      >
                        <td className="p-2 text-center">
                          <input type="checkbox" readOnly checked={selected.has(r.id)} className="accent-emerald-600" />
                        </td>
                        <td className="p-2">{r.firstName} {r.lastName}</td>
                        <td className="p-2 font-mono text-xs">{toFaDigits(r.nationalCode || "—")}</td>
                        <td className="p-2 text-xs whitespace-nowrap">{r.phoneNumber ? toFaDigits(r.phoneNumber) : "—"}</td>
                        <td className="p-2 text-xs whitespace-nowrap">{r.physicalStatus || "—"}</td>
                        <td className="p-2">{r.rank || "—"}</td>
                        <td className="p-2">{r.serviceUnit || "—"}</td>
                        <td className="p-2 text-xs">{r.serviceEndDate ? toFaDigits(r.serviceEndDate) : "—"}</td>
                        <td className="p-2">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full ${
                              st === "در حال خدمت"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                            }`}
                          >
                            {st}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!recipients.length && !loadingList && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-xs text-slate-500">
                        سربازی با این شرایط یافت نشد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(0)} className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 dark:text-slate-100 text-sm">قبلی</button>
            <button
              disabled={!selected.size}
              onClick={() => setStep(2)}
              className="px-5 py-2 rounded-xl bg-emerald-600 disabled:opacity-40 text-white text-sm font-bold"
            >
              مرحله بعد
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — params */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="block text-xs mb-1 text-slate-500">عنوان دسته</label>
              <input value={batchTitle} onChange={(e) => setBatchTitle(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs mb-1 text-slate-500">پیش‌شماره نامه</label>
              <input value={numberPrefix} onChange={(e) => setNumberPrefix(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs mb-1 text-slate-500">شروع شماره‌گذاری</label>
              <input type="number" value={numberStart} onChange={(e) => setNumberStart(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800">
            <div className="font-bold text-sm mb-3">مقادیر مشترک نامه‌ها</div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {visibleParams.map((p) => (
                <div key={p.key}>
                  <label className="block text-xs mb-1 text-slate-500">
                    {p.label} <span className="font-mono text-[10px] text-slate-400">{`{{${p.key}}}`}</span>
                  </label>
                  {p.type === "select" ? (
                    <select
                      value={params[p.key] ?? ""}
                      onChange={(e) => setParams({ ...params, [p.key]: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    >
                      <option value="">— انتخاب —</option>
                      {(p.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      value={params[p.key] ?? ""}
                      onChange={(e) => setParams({ ...params, [p.key]: e.target.value })}
                      placeholder={p.type === "date" ? "۱۴۰۴/۰۱/۰۱" : ""}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    />
                  )}
                </div>
              ))}
              {!visibleParams.length && <div className="text-xs text-slate-500">این قالب پارامتر اضافی ندارد.</div>}
            </div>
            {Object.keys(perSoldier).length > 0 && (
              <div className="mt-3 text-[11px] text-amber-700 dark:text-amber-400">
                توجه: برای {toFaDigits(Object.keys(perSoldier).length)} نفر، مقادیر اختصاصی از فایل اکسل اولویت دارد.
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 dark:text-slate-100 text-sm">قبلی</button>
            <button
              onClick={() => {
                setStep(3);
                setOverride(null);
                loadPreview();
              }}
              className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold"
            >
              پیش‌نمایش گرافیکی
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — graphical preview & editing */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700">قالب: <b>{template?.name}</b></span>
            <span className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700">تعداد گیرنده: <b>{toFaDigits(selected.size)}</b></span>
            <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setPreviewMode("paper")}
                className={`px-4 py-1.5 text-xs ${previewMode === "paper" ? "bg-emerald-600 text-white" : "bg-white dark:bg-slate-800"}`}
              >
                🖨️ پیش‌نمایش کاغذی
              </button>
              <button
                onClick={() => setPreviewMode("edit")}
                className={`px-4 py-1.5 text-xs ${previewMode === "edit" ? "bg-emerald-600 text-white" : "bg-white dark:bg-slate-800"}`}
              >
                ✍️ ویرایش گرافیکی متن
              </button>
            </div>
            <button onClick={() => loadPreview()} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs">به‌روزرسانی پیش‌نمایش</button>
          </div>

          {/* انتخاب سرباز برای پیش‌نمایش / ویرایش اختصاصی */}
          <div className="flex flex-wrap items-center gap-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3">
            <span className="text-slate-500 dark:text-slate-400">پیش‌نمایش برای:</span>
            <select
              value={focusedSoldier ?? [...selected][0] ?? ""}
              onChange={(e) => {
                const id = Number(e.target.value) || null;
                setFocusedSoldier(id);
                loadPreview(id);
              }}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5"
            >
              {selectedRows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.firstName} {r.lastName} — {r.serviceUnit || "بدون یگان"}
                </option>
              ))}
              {!selectedRows.length && <option value="">—</option>}
            </select>
            <span className="flex-1" />
            {focusedSoldier && perSoldierHtml[String(focusedSoldier)] && (
              <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                این نامه ویرایش اختصاصی دارد
              </span>
            )}
            <button
              onClick={() => {
                if (!focusedSoldier) return;
                const html = previewHtml;
                if (!html) return;
                setPerSoldierHtml((p) => ({ ...p, [String(focusedSoldier)]: html }));
                setMsg({ type: "ok", text: "متن نمایش‌داده‌شده به‌عنوان ویرایش اختصاصی این سرباز ثبت شد." });
              }}
              disabled={!focusedSoldier || previewMode !== "paper"}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-white disabled:opacity-40"
              title="متن فعلیِ پیش‌نمایش فقط برای همین سرباز ثبت می‌شود"
            >
              📌 ثبت ویرایش اختصاصی همین نامه
            </button>
            {overriddenCount > 0 && (
              <button
                onClick={() => setPerSoldierHtml({})}
                className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 dark:text-slate-100"
              >
                حذف {toFaDigits(overriddenCount)} ویرایش اختصاصی
              </button>
            )}
          </div>

          {previewMode === "paper" ? (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">بزرگ‌نمایی:</span>
                <input type="range" min={0.5} max={1.2} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
                <span className="text-slate-500">{toFaDigits(Math.round(zoom * 100))}٪</span>
              </div>
              <div className="overflow-auto bg-slate-200 dark:bg-slate-900 rounded-2xl p-4 flex justify-center">
                <div
                  dir="rtl"
                  className="srms-paper"
                  style={{
                    width: pageWidth,
                    minHeight: "180mm",
                    padding: "15mm",
                    fontFamily: "Vazirmatn, Tahoma, sans-serif",
                    transform: `scale(${zoom})`,
                    transformOrigin: "top center",
                  }}
                  dangerouslySetInnerHTML={{
                    __html: previewHtml || "<div style='text-align:center;color:#888;padding:40px'>در حال آماده‌سازی پیش‌نمایش…</div>",
                  }}
                />
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {(["headerHtml", "bodyHtml", "footerHtml"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setEditSection(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs border ${
                      editSection === f
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {f === "headerHtml" ? "سربرگ" : f === "bodyHtml" ? "متن نامه" : "امضا / پاورقی"}
                  </button>
                ))}
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 mr-auto">
                  <input type="checkbox" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)} className="accent-emerald-600" />
                  این ویرایش روی خود قالب هم ذخیره شود
                </label>
                <button
                  onClick={() => {
                    setOverride(null);
                    setTimeout(() => loadPreview(), 0);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 dark:text-slate-100 text-xs"
                >
                  بازگشت به قالب اصلی
                </button>
              </div>

              <LetterVisualEditor
                label="ویرایش گرافیکی — مثل Word تایپ کنید، بدون کد HTML"
                value={override?.[editSection] ?? ""}
                onChange={(html) => setOverride((o) => ({ headerHtml: "", bodyHtml: "", footerHtml: "", ...(o || {}), [editSection]: html }))}
                height={420}
              />

              <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-6">
                پس از ویرایش، دکمه «به‌روزرسانی پیش‌نمایش» را بزنید تا نتیجه روی کاغذ دیده شود؛ سپس «تولید انبوه» را اجرا کنید.
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 dark:text-slate-100 text-sm">قبلی</button>
            <button
              onClick={generate}
              disabled={busy || !selected.size}
              className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold shadow-lg shadow-emerald-600/30"
            >
              {busy ? "در حال تولید…" : `🚀 تولید انبوه ${toFaDigits(selected.size)} نامه`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
