"use client";

import { useCallback, useEffect, useState } from "react";
import type { BatchRow, LetterRow } from "./types";
import { toFaDigits } from "@/lib/jalali";
import { downloadMergedPdf, downloadPdfZip } from "@/lib/client-pdf";

interface Props {
  canWrite: boolean;
  refreshKey: number;
  focusBatch?: number | null;
}

export default function LettersTab({ canWrite, refreshKey, focusBatch }: Props) {
  const [rows, setRows] = useState<LetterRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [batchId, setBatchId] = useState<string>(focusBatch ? String(focusBatch) : "");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState("");
  const [viewer, setViewer] = useState<{ id: number; html: string; subject: string; pageSize: string; editing: boolean } | null>(null);
  const pageSize = 25;

  const load = useCallback(() => {
    const url = `/api/letters?q=${encodeURIComponent(q)}&batchId=${batchId}&page=${page}&pageSize=${pageSize}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.data || []);
        setTotal(d.total || 0);
        setBatches(d.batches || []);
      })
      .catch(() => {});
  }, [q, batchId, page]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { if (focusBatch) setBatchId(String(focusBatch)); }, [focusBatch]);

  const ids = [...sel];

  function toggle(id: number) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSel((s) => (s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function fetchHtml(list: number[]) {
    const out: { id: number; fileName: string; html: string; pageSize: string }[] = [];
    for (const id of list) {
      const r = await fetch(`/api/letters/${id}`).then((x) => x.json());
      if (r?.data) {
        out.push({
          id,
          fileName: `${r.data.templateName}-${r.data.soldierName}`.replace(/[\\/:*?"<>|]/g, "-"),
          html: r.data.bodyHtml,
          pageSize: r.data.pageSize,
        });
      }
    }
    return out;
  }

  async function doPdf(list: number[], merged: boolean) {
    if (!list.length) return;
    setBusy("در حال ساخت PDF…");
    try {
      const items = await fetchHtml(list);
      if (merged || items.length === 1) {
        await downloadMergedPdf(items, items.length === 1 ? items[0].fileName : `letters-${items.length}`, (d, t) => setBusy(`PDF ${toFaDigits(d)}/${toFaDigits(t)}`));
      } else {
        await downloadPdfZip(items, `letters-pdf-${items.length}`, (d, t) => setBusy(`PDF ${toFaDigits(d)}/${toFaDigits(t)}`));
      }
    } finally {
      setBusy("");
    }
  }

  function doDocx(list: number[], mode: "zip" | "merged" | "single") {
    if (!list.length) return;
    window.location.href = `/api/letters/docx?ids=${list.join(",")}&mode=${mode}`;
  }

  function doPrint(list: number[]) {
    if (!list.length) return;
    window.open(`/documents/letters/print?ids=${list.join(",")}`, "_blank");
  }

  async function doDelete(list: number[]) {
    if (!list.length) return;
    if (!confirm(`حذف ${toFaDigits(list.length)} نامه؟ این عمل بازگشت‌پذیر نیست.`)) return;
    setBusy("در حال حذف…");
    await fetch("/api/letters", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", ids: list }),
    });
    setSel(new Set());
    setBusy("");
    load();
  }

  async function openViewer(id: number, editing = false) {
    const r = await fetch(`/api/letters/${id}`).then((x) => x.json());
    if (r?.data) setViewer({ id, html: r.data.bodyHtml, subject: r.data.subject, pageSize: r.data.pageSize, editing });
  }

  async function saveViewer() {
    if (!viewer) return;
    setBusy("در حال ذخیره…");
    await fetch(`/api/letters/${viewer.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bodyHtml: viewer.html, subject: viewer.subject }),
    });
    setBusy("");
    setViewer(null);
    load();
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="جستجو در نامه‌ها (نام، کد ملی، شماره نامه)…"
          className="flex-1 min-w-[220px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
        />
        <select value={batchId} onChange={(e) => { setBatchId(e.target.value); setPage(1); }} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
          <option value="">همه دسته‌ها</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.title} ({toFaDigits(b.total)})</option>
          ))}
        </select>
      </div>

      {/* Bulk toolbar */}
      <div className="flex flex-wrap gap-2 items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">انتخاب‌شده: {toFaDigits(sel.size)}</span>
        <button onClick={toggleAll} className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 dark:text-slate-100 text-xs">انتخاب/لغو همه صفحه</button>
        <div className="w-px h-6 bg-slate-200 dark:bg-slate-600" />
        <button disabled={!sel.size} onClick={() => doDocx(ids, "zip")} className="px-3 py-1.5 rounded-lg bg-blue-600 disabled:opacity-40 text-white text-xs">⬇️ Word (ZIP)</button>
        <button disabled={!sel.size} onClick={() => doDocx(ids, "merged")} className="px-3 py-1.5 rounded-lg bg-blue-700 disabled:opacity-40 text-white text-xs">⬇️ Word (یکپارچه)</button>
        <button disabled={!sel.size} onClick={() => doPdf(ids, true)} className="px-3 py-1.5 rounded-lg bg-rose-600 disabled:opacity-40 text-white text-xs">⬇️ PDF (یکپارچه)</button>
        <button disabled={!sel.size} onClick={() => doPdf(ids, false)} className="px-3 py-1.5 rounded-lg bg-rose-700 disabled:opacity-40 text-white text-xs">⬇️ PDF (ZIP)</button>
        <button disabled={!sel.size} onClick={() => doPrint(ids)} className="px-3 py-1.5 rounded-lg bg-slate-800 disabled:opacity-40 text-white text-xs">🖨️ چاپ گروهی</button>
        {canWrite && (
          <button disabled={!sel.size} onClick={() => doDelete(ids)} className="px-3 py-1.5 rounded-lg bg-rose-100 text-rose-700 disabled:opacity-40 text-xs border border-rose-200">🗑️ حذف گروهی</button>
        )}
        {busy && <span className="text-xs text-amber-600 animate-pulse">{busy}</span>}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300">
              <tr>
                <th className="p-2 w-10"></th>
                <th className="p-2 text-right">شماره نامه</th>
                <th className="p-2 text-right">گیرنده</th>
                <th className="p-2 text-right">قالب</th>
                <th className="p-2 text-right">تاریخ</th>
                <th className="p-2 text-right">وضعیت</th>
                <th className="p-2 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-t border-slate-100 dark:border-slate-700 ${sel.has(r.id) ? "bg-emerald-50 dark:bg-emerald-900/20" : ""}`}>
                  <td className="p-2 text-center">
                    <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="accent-emerald-600" />
                  </td>
                  <td className="p-2 font-mono text-xs">{r.letterNumber || "—"}</td>
                  <td className="p-2">
                    <div className="font-medium">{r.soldierName}</div>
                    <div className="text-[11px] text-slate-400">{toFaDigits(r.nationalCode || "")} • {r.serviceUnit || "—"}</div>
                  </td>
                  <td className="p-2">{r.templateName}</td>
                  <td className="p-2">{r.letterDate}</td>
                  <td className="p-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.status === "edited" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {r.status === "edited" ? "ویرایش‌شده" : "تولیدشده"}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1 justify-center flex-wrap">
                      <button onClick={() => openViewer(r.id)} title="مشاهده" className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-xs">👁️</button>
                      {canWrite && <button onClick={() => openViewer(r.id, true)} title="ویرایش" className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-xs">✏️</button>}
                      <button onClick={() => doDocx([r.id], "single")} title="Word" className="px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs">W</button>
                      <button onClick={() => doPdf([r.id], true)} title="PDF" className="px-2 py-1 rounded bg-rose-100 text-rose-800 text-xs">P</button>
                      <button onClick={() => doPrint([r.id])} title="چاپ" className="px-2 py-1 rounded bg-slate-800 text-white text-xs">🖨️</button>
                      {canWrite && <button onClick={() => doDelete([r.id])} title="حذف" className="px-2 py-1 rounded bg-rose-600 text-white text-xs">🗑️</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400 text-sm">نامه‌ای یافت نشد.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-3 text-xs text-slate-500 border-t border-slate-100 dark:border-slate-700">
          <span>مجموع: {toFaDigits(total)} نامه</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded bg-slate-100 dark:bg-slate-700 disabled:opacity-40">قبلی</button>
            <span>{toFaDigits(page)} / {toFaDigits(pages)}</span>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded bg-slate-100 dark:bg-slate-700 disabled:opacity-40">بعدی</button>
          </div>
        </div>
      </div>

      {/* Viewer / editor modal */}
      {viewer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setViewer(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
              <input
                value={viewer.subject}
                onChange={(e) => setViewer({ ...viewer, subject: e.target.value })}
                disabled={!viewer.editing}
                className="font-bold bg-transparent flex-1 text-sm outline-none"
              />
              <div className="flex gap-2">
                {canWrite && (
                  <button onClick={() => setViewer({ ...viewer, editing: !viewer.editing })} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs">
                    {viewer.editing ? "پیش‌نمایش" : "ویرایش"}
                  </button>
                )}
                {viewer.editing && <button onClick={saveViewer} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs">ذخیره</button>}
                <button onClick={() => doPrint([viewer.id])} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs">چاپ</button>
                <button onClick={() => setViewer(null)} className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 dark:text-slate-100 text-xs">بستن</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-200 dark:bg-slate-900">
              {viewer.editing ? (
                <textarea
                  value={viewer.html}
                  onChange={(e) => setViewer({ ...viewer, html: e.target.value })}
                  className="w-full h-[65vh] font-mono text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-slate-100"
                  dir="ltr"
                />
              ) : (
                <div className="flex justify-center">
                  <div
                    dir="rtl"
                    className="bg-white text-black shadow-xl"
                    style={{ width: viewer.pageSize === "A5" ? "148mm" : "210mm", minHeight: "150mm", padding: "15mm", fontFamily: "Vazirmatn, Tahoma, sans-serif" }}
                    dangerouslySetInnerHTML={{ __html: viewer.html }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
