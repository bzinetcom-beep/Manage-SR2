"use client";

import { useEffect, useState, useRef } from "react";
import { Save, Upload, RotateCcw, Image as ImageIcon, Quote, CheckCircle2, AlertCircle, Flag, Trash2 } from "lucide-react";

const DEFAULT_QUOTE = "خطرناک تر از ناو، سلاحی است که آن را به قعر دریا می فرستد";
const DEFAULT_AUTHOR = "قائد شهید امت";

type Tab = "quote" | "flag";
type Banner = { type: "success" | "error"; text: string } | null;

/**
 * Widget settings.
 *
 * Each widget is an INDEPENDENT panel with its own save / reset / preview, so
 * there is no ambiguity about which widget a button affects. The API performs
 * partial updates, therefore saving one widget never overwrites the other.
 */
export default function WidgetsSettingsPage() {
  const [tab, setTab] = useState<Tab>("quote");

  // ── Quote widget ──
  const [quoteText, setQuoteText] = useState("");
  const [quoteAuthor, setQuoteAuthor] = useState("");
  const [quoteImage, setQuoteImage] = useState("");
  const [quoteImageFit, setQuoteImageFit] = useState<"cover" | "contain">("contain");
  const [savingQuote, setSavingQuote] = useState(false);
  const [quoteMsg, setQuoteMsg] = useState<Banner>(null);
  const quoteFileRef = useRef<HTMLInputElement>(null);

  // ── Flag widget ──
  const [flagImage, setFlagImage] = useState("");
  const [savingFlag, setSavingFlag] = useState(false);
  const [flagMsg, setFlagMsg] = useState<Banner>(null);
  const flagFileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/widget-settings/quote", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setQuoteText(d.data.quoteText || "");
        setQuoteAuthor(d.data.quoteAuthor || "");
        setQuoteImage(d.data.quoteImage || "");
        setQuoteImageFit(d.data.quoteImageFit === "cover" ? "cover" : "contain");
        setFlagImage(d.data.flagImage || "");
      })
      .finally(() => setLoading(false));
  }, []);

  /** آپلود تصویر روی سرور؛ فایل به‌صورت ماندگار ذخیره می‌شود و با بستن/اجرای مجدد برنامه باقی می‌ماند. */
  async function readAsDataURL(file: File, setter: (v: string) => void, onErr: (b: Banner) => void, kind: "quote" | "flag" = "quote") {
    if (file.size > 8 * 1024 * 1024) { onErr({ type: "error", text: "حجم تصویر نباید بیش از ۸ مگابایت باشد" }); return; }
    if (!file.type.startsWith("image/")) { onErr({ type: "error", text: "لطفاً یک فایل تصویری انتخاب کنید" }); return; }
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch("/api/widget-settings/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) { onErr({ type: "error", text: data.error || "خطا در آپلود تصویر" }); return; }
      setter(data.url as string);
      onErr({ type: "success", text: "تصویر آپلود و به‌صورت دائمی ذخیره شد." });
    } catch {
      onErr({ type: "error", text: "خطای ارتباط با سرور هنگام آپلود" });
    }
  }

  /** Saves ONLY the given fields — the other widget is left untouched. */
  async function savePartial(payload: Record<string, unknown>, setBusy: (b: boolean) => void, setMsg: (b: Banner) => void, what: string) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/widget-settings/quote", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) setMsg({ type: "error", text: data.error || "خطا در ذخیره" });
      else setMsg({ type: "success", text: `${what} ذخیره شد و در صفحه ورود اعمال می‌شود.` });
    } catch {
      setMsg({ type: "error", text: "خطای ارتباط با سرور" });
    } finally {
      setBusy(false);
    }
  }

  const saveQuote = () =>
    savePartial({ quoteText, quoteAuthor, quoteImage, quoteImageFit }, setSavingQuote, setQuoteMsg, "ویجت سخن بزرگان");

  const saveFlag = () =>
    savePartial({ flagImage }, setSavingFlag, setFlagMsg, "ویجت تصویر پرچم");

  function resetQuote() {
    if (!confirm("فقط «ویجت سخن بزرگان» به حالت پیش‌فرض برگردد؟\n(ویجت پرچم دست‌نخورده می‌ماند)")) return;
    setQuoteText(DEFAULT_QUOTE); setQuoteAuthor(DEFAULT_AUTHOR); setQuoteImage(""); setQuoteImageFit("contain");
    setQuoteMsg({ type: "success", text: "مقادیر پیش‌فرض بارگذاری شد — برای اعمال، دکمه ذخیره را بزنید." });
  }

  function resetFlag() {
    if (!confirm("فقط «ویجت تصویر پرچم» پاک شود؟\n(ویجت سخن بزرگان دست‌نخورده می‌ماند)")) return;
    setFlagImage("");
    setFlagMsg({ type: "success", text: "تصویر پاک شد — برای اعمال، دکمه ذخیره را بزنید." });
  }

  if (loading) return <div className="p-8 text-slate-500">در حال بارگذاری...</div>;

  const Banner = ({ msg }: { msg: Banner }) =>
    msg ? (
      <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
        msg.type === "success"
          ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700"
          : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700"
      }`}>
        {msg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
        {msg.text}
      </div>
    ) : null;

  const tabBtn = (id: Tab, icon: React.ReactNode, label: string, hint: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`flex-1 min-w-[220px] text-right px-4 py-3 rounded-xl border-2 transition-all ${
        tab === id
          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-sm"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300"
      }`}
    >
      <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
        {icon}
        {label}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</p>
    </button>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="text-2xl">🧩</span> مدیریت ویجت‌ها
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          هر ویجت به‌صورت جداگانه تنظیم و ذخیره می‌شود. تغییر یکی روی دیگری اثری ندارد.
        </p>
      </div>

      {/* ── Widget selector ── */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {tabBtn("quote", <Quote className="w-4 h-4 text-emerald-600" />, "۱) ویجت سخن بزرگان", "متن، گوینده و تصویر نقل‌قول")}
        {tabBtn("flag", <Flag className="w-4 h-4 text-rose-600" />, "۲) ویجت تصویر پرچم", "فقط تصویر پرچم صفحه ورود")}
      </div>

      {/* ════════════════ WIDGET 1 — QUOTE ════════════════ */}
      {tab === "quote" && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800 flex items-center gap-2">
            <Quote className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">ویجت سخن بزرگان</h2>
            <span className="mr-auto text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full">ویجت ۱ از ۲</span>
          </div>

          <div className="p-6">
            <Banner msg={quoteMsg} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">متن نقل‌قول</label>
                  <textarea value={quoteText} onChange={(e) => setQuoteText(e.target.value)} rows={4} maxLength={1000}
                    className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none dark:text-slate-100"
                    placeholder="متن نقل‌قول..." />
                  <p className="text-xs text-slate-400">{quoteText.length}/1000</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">نام گوینده</label>
                  <input value={quoteAuthor} onChange={(e) => setQuoteAuthor(e.target.value)} maxLength={200}
                    className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none dark:text-slate-100"
                    placeholder="مثال: قائد شهید امت" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">تصویر این ویجت</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => quoteFileRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors">
                      <Upload className="w-4 h-4" /> آپلود تصویر نقل‌قول
                    </button>
                    {quoteImage && (
                      <button type="button" onClick={() => setQuoteImage("")}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors">
                        <Trash2 className="w-3.5 h-3.5" /> حذف
                      </button>
                    )}
                    <input ref={quoteFileRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) readAsDataURL(f, setQuoteImage, setQuoteMsg, "quote"); e.target.value = ""; }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">JPG/PNG/WebP — حداکثر ۸ مگابایت — ماندگار پس از بستن برنامه</p>

                  {!quoteImage && (
                    <div className="mt-2 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                      <ImageIcon className="w-4 h-4" /> تصویری آپلود نشده
                    </div>
                  )}

                  {quoteImage && (
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">حالت نمایش تصویر</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setQuoteImageFit("contain")}
                          className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${quoteImageFit === "contain" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600"}`}>
                          🖼️ کامل (Contain)
                        </button>
                        <button type="button" onClick={() => setQuoteImageFit("cover")}
                          className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${quoteImageFit === "cover" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600"}`}>
                          🖼️ پوششی (Cover)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Preview — quote only */}
              <div>
                <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">پیش‌نمایش ویجت سخن بزرگان</div>
                <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-emerald-950/40 to-indigo-950/30 p-4 border border-slate-800">
                  <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] overflow-hidden flex flex-col shadow-2xl">
                    <div className="relative h-44 w-full overflow-hidden">
                      {quoteImage ? (
                        <>
                          <div className="absolute inset-0 bg-cover bg-center blur-xl scale-110 opacity-50" style={{ backgroundImage: `url(${quoteImage})` }} />
                          <img src={quoteImage} alt={quoteAuthor} className="absolute inset-0 w-full h-full" style={{ objectFit: quoteImageFit }} />
                          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70 pointer-events-none" />
                        </>
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                          <ImageIcon className="w-12 h-12 text-white/20" />
                        </div>
                      )}
                      <div className="absolute top-3 right-3 left-3 flex items-center justify-center">
                        <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center gap-1.5">
                          <Quote className="w-3.5 h-3.5 text-emerald-300" />
                          <span className="text-[11px] font-bold text-white/90">سخن بزرگان</span>
                        </div>
                      </div>
                      <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                        <div className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
                          <span className="text-xs font-bold text-emerald-300">{quoteAuthor || "—"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 bg-gradient-to-b from-transparent to-black/20">
                      <p className="text-sm text-white/90 leading-loose italic font-medium text-center px-2">«{quoteText || "—"}»</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions scoped to THIS widget */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> این دکمه‌ها فقط روی <strong>ویجت سخن بزرگان</strong> اثر دارند.
            </p>
            <div className="flex gap-3">
              <button onClick={resetQuote}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors">
                <RotateCcw className="w-4 h-4" /> پیش‌فرض این ویجت
              </button>
              <button onClick={saveQuote} disabled={savingQuote}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors shadow-sm">
                <Save className="w-4 h-4" /> {savingQuote ? "در حال ذخیره..." : "ذخیره ویجت سخن بزرگان"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ WIDGET 2 — FLAG ════════════════ */}
      {tab === "flag" && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-rose-50 dark:bg-rose-900/20 border-b border-rose-100 dark:border-rose-800 flex items-center gap-2">
            <Flag className="w-5 h-5 text-rose-600" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">ویجت تصویر پرچم</h2>
            <span className="mr-auto text-xs bg-rose-600 text-white px-2 py-0.5 rounded-full">ویجت ۲ از ۲</span>
          </div>

          <div className="p-6">
            <Banner msg={flagMsg} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">تصویر پرچم</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => flagFileRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors">
                      <Upload className="w-4 h-4" /> آپلود تصویر پرچم
                    </button>
                    {flagImage && (
                      <button type="button" onClick={() => setFlagImage("")}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors">
                        <Trash2 className="w-3.5 h-3.5" /> حذف
                      </button>
                    )}
                    <input ref={flagFileRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) readAsDataURL(f, setFlagImage, setFlagMsg, "flag"); e.target.value = ""; }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">JPG/PNG/WebP — حداکثر ۸ مگابایت — ماندگار پس از بستن برنامه</p>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-400 leading-6">
                  این ویجت فقط یک تصویر دارد و کاملاً مستقل از ویجت «سخن بزرگان» است.
                  اگر تصویری آپلود نشود، تصویر پیش‌فرض سامانه نمایش داده می‌شود.
                </div>
              </div>

              {/* Preview — flag only */}
              <div>
                <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">پیش‌نمایش ویجت پرچم</div>
                <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-rose-950/30 to-indigo-950/30 p-4 border border-slate-800">
                  <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] overflow-hidden shadow-2xl">
                    <div className="relative h-56 w-full flex items-center justify-center">
                      {flagImage ? (
                        <img src={flagImage} alt="پرچم" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-white/30">
                          <Flag className="w-12 h-12" />
                          <span className="text-xs">تصویر پیش‌فرض سامانه</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> این دکمه‌ها فقط روی <strong>ویجت پرچم</strong> اثر دارند.
            </p>
            <div className="flex gap-3">
              <button onClick={resetFlag}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors">
                <RotateCcw className="w-4 h-4" /> پاک کردن تصویر
              </button>
              <button onClick={saveFlag} disabled={savingFlag}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors shadow-sm">
                <Save className="w-4 h-4" /> {savingFlag ? "در حال ذخیره..." : "ذخیره ویجت پرچم"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
