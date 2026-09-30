"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ALL_TOKENS, type TokenDef } from "@/lib/letter-engine";

/* -----------------------------------------------------------------------------
 * ویرایشگر گرافیکی نامه (WYSIWYG)
 * -----------------------------------------------------------------------------
 * هدف: کاربر متن نامه را «شبیه Word» و بدون دیدن کد HTML ویرایش کند.
 *
 * • جای‌نگهدارها ({{نام}} و…) به‌صورت «تراشه» (chip) نمایش داده می‌شوند،
 *   قابل حذف با یک کلید Backspace و قابل درج با کلیک از پنل توکن‌ها.
 * • خروجی همیشه HTML تمیز با همان سینتکس {{key}} است، پس با موتور تولید
 *   انبوه نامه (letter-engine) کاملاً سازگار می‌ماند.
 * ------------------------------------------------------------------------- */

const TOKEN_SPAN_RE =
  /<span\s+class="[^"]*srms-token[^"]*"[^>]*data-token="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi;

function escapeAttr(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** HTML قالب → HTML قابل ویرایش (تبدیل {{key}} به تراشه) */
export function htmlToEditable(html: string): string {
  if (!html) return "";
  return html.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_m, key: string) => {
    return `<span class="srms-token" contenteditable="false" data-token="${escapeAttr(
      key.trim(),
    )}" title="${escapeAttr(key.trim())}"><span class="srms-token-dot"></span>${escapeAttr(
      key.trim(),
    )}</span>`;
  });
}

/** HTML ویرایش‌شده → HTML قالب (تبدیل تراشه‌ها به {{key}}) */
export function editableToHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(TOKEN_SPAN_RE, (_m, key: string) => `{{${key}}}`)
    .replace(/<br\s*\/?>(\s*<\/div>)/gi, "$1");
}

const FONT_SIZES = [
  { label: "خیلی کوچک", v: "1" },
  { label: "کوچک", v: "2" },
  { label: "معمولی", v: "3" },
  { label: "بزرگ", v: "4" },
  { label: "خیلی بزرگ", v: "5" },
  { label: "عنوان", v: "6" },
];

const FONTS = [
  { label: "وزیرمتن", v: "Vazirmatn, Tahoma, sans-serif" },
  { label: "تاهوما", v: "Tahoma, sans-serif" },
  { label: "ایران‌سنس", v: "IRANSans, Vazirmatn, Tahoma, sans-serif" },
  { label: "نازنین", v: "'Nazanin', Tahoma, serif" },
  { label: "Times", v: "'Times New Roman', serif" },
];

interface Props {
  value: string;
  onChange: (html: string) => void;
  /** ارتفاع ناحیه ویرایش */
  height?: number;
  /** نمایش پنل توکن‌ها */
  showTokens?: boolean;
  placeholder?: string;
  /** عنوان نوار ابزار */
  label?: string;
}

export default function LetterVisualEditor({
  value,
  onChange,
  height = 420,
  showTokens = true,
  placeholder = "متن نامه را اینجا بنویسید…",
  label,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string>(value || "");
  const [group, setGroup] = useState<string>("همه");
  const [tokenQuery, setTokenQuery] = useState("");

  // همگام‌سازی یک‌طرفه: فقط وقتی مقدار بیرونی تغییر کرده و ادیتور فوکوس نیست
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const active = document.activeElement === el;
    if (active) return;
    if ((value || "") === lastEmitted.current) return;
    el.innerHTML = htmlToEditable(value || "");
    lastEmitted.current = value || "";
  }, [value]);

  // مقداردهی اولیه
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (!el.innerHTML.trim()) el.innerHTML = htmlToEditable(value || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = editableToHtml(el.innerHTML);
    lastEmitted.current = html;
    onChange(html);
  }, [onChange]);

  function exec(cmd: string, arg?: string) {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement !== el) el.focus();
    try {
      document.execCommand(cmd, false, arg);
    } catch {
      /* ignored — برخی مرورگرها دستورات قدیمی را محدود می‌کنند */
    }
    emit();
  }

  function insertToken(rawKey: string) {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement !== el) el.focus();
    const key = rawKey.trim();
    const chip = document.createElement("span");
    chip.className = "srms-token";
    chip.setAttribute("contenteditable", "false");
    chip.setAttribute("data-token", key);
    chip.setAttribute("title", key);
    const dot = document.createElement("span");
    dot.className = "srms-token-dot";
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(key));
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(chip);
      range.setStartAfter(chip);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      el.appendChild(chip);
    }
    emit();
  }

  function insertHtml(html: string) {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement !== el) el.focus();
    try {
      document.execCommand("insertHTML", false, html);
    } catch {
      el.innerHTML += html;
    }
    emit();
  }

  const groups = useMemo(() => {
    const g = new Map<string, TokenDef[]>();
    for (const t of ALL_TOKENS) {
      const arr = g.get(t.group) || [];
      arr.push(t);
      g.set(t.group, arr);
    }
    return [...g.entries()];
  }, []);

  const visibleTokens = useMemo(() => {
    const pool = group === "همه" ? ALL_TOKENS : groups.find(([g]) => g === group)?.[1] || [];
    const q = tokenQuery.trim();
    if (!q) return pool;
    return pool.filter(
      (t) => t.label.includes(q) || t.key.includes(q) || (t.aliases || []).some((a) => a.includes(q)),
    );
  }, [group, groups, tokenQuery]);

  const Btn = ({
    onClick,
    children,
    title,
    active,
  }: {
    onClick: () => void;
    children: ReactNode;
    title?: string;
    active?: boolean;
  }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`h-8 min-w-8 px-2 rounded-lg text-xs border transition flex items-center justify-center ${
        active
          ? "bg-emerald-600 text-white border-emerald-600"
          : "bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200"
      }`}
    >
      {children}
    </button>
  );

  const Sep = () => <span className="w-px h-6 bg-slate-200 dark:bg-slate-600 mx-1" />;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
      {label && (
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">
          {label}
        </div>
      )}

      {/* ---------------- نوار ابزار گرافیکی ---------------- */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
        <Btn onClick={() => exec("undo")} title="واگرد (Ctrl+Z)">↺</Btn>
        <Btn onClick={() => exec("redo")} title="ازنو (Ctrl+Y)">↻</Btn>
        <Sep />
        <Btn onClick={() => exec("bold")} title="پررنگ (Ctrl+B)"><b>B</b></Btn>
        <Btn onClick={() => exec("italic")} title="مورب (Ctrl+I)"><i>I</i></Btn>
        <Btn onClick={() => exec("underline")} title="زیرخط (Ctrl+U)"><u>U</u></Btn>
        <Btn onClick={() => exec("strikeThrough")} title="خط‌خورده"><s>S</s></Btn>
        <Sep />
        <select
          onChange={(e) => exec("fontName", e.target.value)}
          defaultValue=""
          className="h-8 rounded-lg text-xs border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-1"
          title="فونت"
        >
          <option value="">فونت…</option>
          {FONTS.map((f) => (
            <option key={f.v} value={f.v}>{f.label}</option>
          ))}
        </select>
        <select
          onChange={(e) => exec("fontSize", e.target.value)}
          defaultValue=""
          className="h-8 rounded-lg text-xs border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-1"
          title="اندازه متن"
        >
          <option value="">اندازه…</option>
          {FONT_SIZES.map((f) => (
            <option key={f.v} value={f.v}>{f.label}</option>
          ))}
        </select>
        <input
          type="color"
          onChange={(e) => exec("foreColor", e.target.value)}
          title="رنگ متن"
          className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5"
        />
        <input
          type="color"
          onChange={(e) => exec("hiliteColor", e.target.value)}
          title="رنگ پس‌زمینه / هایلایت"
          className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5"
        />
        <Sep />
        <Btn onClick={() => exec("justifyRight")} title="راست‌چین">⇥</Btn>
        <Btn onClick={() => exec("justifyCenter")} title="وسط‌چین">≡</Btn>
        <Btn onClick={() => exec("justifyLeft")} title="چپ‌چین">⇤</Btn>
        <Btn onClick={() => exec("justifyFull")} title="هم‌تراز دوطرفه">▤</Btn>
        <Sep />
        <Btn onClick={() => exec("insertUnorderedList")} title="فهرست نقطه‌ای">•</Btn>
        <Btn onClick={() => exec("insertOrderedList")} title="فهرست شماره‌ای">۱.</Btn>
        <Btn onClick={() => exec("outdent")} title="کاهش تورفتگی">⇤</Btn>
        <Btn onClick={() => exec("indent")} title="افزایش تورفتگی">⇥</Btn>
        <Sep />
        <Btn onClick={() => insertHtml('<div style="border-top:1px solid #999;margin:8px 0"></div>')} title="خط جداکننده">
          —
        </Btn>
        <Btn onClick={() => insertHtml("<table border='1' style='border-collapse:collapse;width:100%'><tr><td style='padding:6px'>۱</td><td style='padding:6px'>۲</td></tr><tr><td style='padding:6px'>۳</td><td style='padding:6px'>۴</td></tr></table><p></p>")} title="درج جدول">
          ▦ جدول
        </Btn>
        <Btn
          onClick={() => exec("removeFormat")}
          title="پاک‌کردن قالب‌بندی"
        >
          ✕ قالب
        </Btn>
      </div>

      {/* ---------------- سطح ویرایش ---------------- */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        dir="rtl"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // چسباندن به‌صورت متن ساده تا HTML خارجی ساختار نامه را خراب نکند
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace") {
            const sel = window.getSelection();
            if (sel && sel.anchorNode && (sel.anchorNode as HTMLElement).classList?.contains("srms-token")) {
              e.preventDefault();
              (sel.anchorNode as HTMLElement).remove();
              emit();
            }
          }
        }}
        className="srms-editor focus:outline-none px-5 py-4 text-[13.5px] leading-8 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 overflow-auto"
        style={{ minHeight: height, maxHeight: height * 1.6 }}
      />

      {/* ---------------- پنل جای‌نگهدارها ---------------- */}
      {showTokens && (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              درج داده سرباز (کلیک = درج در محل نشانگر)
            </span>
            <input
              value={tokenQuery}
              onChange={(e) => setTokenQuery(e.target.value)}
              placeholder="جستجوی فیلد…"
              className="h-7 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-xs w-40"
            />
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className="h-7 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-xs"
            >
              <option value="همه">همه گروه‌ها</option>
              {groups.map(([g]) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1 max-h-32 overflow-auto">
            {visibleTokens.map((t) => (
              <button
                key={t.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertToken(t.aliases?.[0] || t.key)}
                title={`{{${t.aliases?.[0] || t.key}}}`}
                className="text-[11px] px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-slate-700 dark:text-slate-200"
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-6">
            💡 هر متن دلخواه دیگری هم می‌توانید داخل کادر بنویسید؛ برای مقدار متغیرِ اختصاصی هر نامه کافی است
            واژه‌ای مثل <span className="font-mono">درجه_جدید</span> را به‌صورت تراشه درج کنید — سامانه آن را
            به‌عنوان پارامتر ورودی در مرحله «تکمیل اطلاعات» می‌شناسد.
          </div>
        </div>
      )}
    </div>
  );
}
