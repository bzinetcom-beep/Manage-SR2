import PrintButton from "@/components/PrintButton";
import { isoToJalali, toFaDigits } from "@/lib/jalali";
import { DATE_KEYS } from "@/lib/fields";
import type { Soldier } from "@/db/schema";

const dateSet = new Set(DATE_KEYS);

/* ============================================================
   🔹 خواندن امن مقدار فیلد (هم از ستون ثابت و هم از metadata)
   ============================================================ */
export function v(soldier: Soldier, key: string): string {
  const meta = (soldier.metadata as Record<string, unknown>) || {};
  let raw = (soldier as unknown as Record<string, unknown>)[key];
  if (raw == null || raw === "") raw = meta[key];
  if (raw == null || raw === "") return "";
  if (dateSet.has(key)) return toFaDigits(isoToJalali(String(raw)));
  return toFaDigits(String(raw));
}

/* ============================================================
   🔹 صفحه اصلی فرم (حاوی دکمه چاپ و کادر A4/A5)
   - filename: نام پیش‌فرض فایل PDF (بدون پسوند)
   - formLabel: برچسب کوتاه برای چاپ (مثلاً «فرم ۱۱۱»)
   ============================================================ */
export function DocPage({
  children,
  filename,
  formLabel,
}: {
  children: React.ReactNode;
  filename?: string;
  formLabel?: string;
}) {
  // برای اینکه دکمه‌ی چاپ نام فایل درستی ارسال کند، عنوان صفحه را در لحظه ست می‌کنیم.
  const safeName = filename || (formLabel ? formLabel : "فرم-سرباز");

  const setTitle = `
    (function(){
      try {
        var n = ${JSON.stringify(safeName)};
        document.title = n;
        var m = document.querySelector('meta[name="doc-filename"]');
        if (!m) { m = document.createElement('meta'); m.name = 'doc-filename'; document.head.appendChild(m); }
        m.content = n;
      } catch(e){}
    })();
  `;

  return (
    <div className="print-root bg-slate-200 min-h-screen py-6 print:bg-white print:py-0">
      <PrintButton />
      <script dangerouslySetInnerHTML={{ __html: setTitle }} />
      <div className="srms-form mx-auto print:shadow-none" dir="rtl">
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   🔹 بسمه تعالی
   ============================================================ */
export function Bismillah() {
  return <div className="bismillah">بسمه تعالی</div>;
}

/* ============================================================
   🔹 هدر رسمی فرم
   ============================================================ */
export function DocHeader({
  code,
  doctype,
  subtitle,
  formNo,
  leftItems = [],
  rightItems = [],
}: {
  code?: string;
  doctype: string;
  subtitle?: string;
  formNo?: string | number;
  leftItems?: Array<{ label: string; value?: React.ReactNode }>;
  rightItems?: Array<{ label: string; value?: React.ReactNode }>;
}) {
  return (
    <header className="f-header">
      <div className="f-header__side f-header__side--left">
        {leftItems.map((it, i) => (
          <div key={i} className="f-meta">
            <span className="f-meta__label">{it.label}:</span>
            <span className="f-meta__value">{it.value || "—"}</span>
          </div>
        ))}
      </div>

      <div className="f-header__title-block">
        {code ? <div className="f-header__org">{code}</div> : null}
        <h1 className="f-header__title">{doctype}</h1>
        {subtitle ? <div className="f-header__subtitle">{subtitle}</div> : null}
        {formNo ? <div className="f-header__form-no">{formNo}</div> : null}
      </div>

      <div className="f-header__side f-header__side--right">
        {rightItems.map((it, i) => (
          <div key={i} className="f-meta">
            <span className="f-meta__value">{it.value || "—"}</span>
            <span className="f-meta__label">{it.label}</span>
          </div>
        ))}
      </div>
    </header>
  );
}

/* ============================================================
   🔹 نوار شماره/تاریخ/پیوست
   ============================================================ */
export function DocStamp({
  items,
  cols = 3,
}: {
  items: Array<{ label: string; value?: React.ReactNode }>;
  cols?: 3 | 4;
}) {
  return (
    <div className={`f-stamp ${cols === 4 ? "f-stamp--4" : ""}`}>
      {items.map((it, idx) => (
        <div key={idx} className="f-stamp__cell">
          <div className="f-stamp__label">{it.label}</div>
          <div className="f-stamp__value">{it.value || "—"}</div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   🔹 عنوان بخش
   ============================================================ */
export function SectionTitle({
  number,
  title,
  hint,
}: {
  number?: string | number;
  title: string;
  hint?: string;
}) {
  return (
    <div className="f-section">
      {number !== undefined ? <span className="f-section__num">{number}</span> : null}
      <span className="f-section__dot" />
      <span className="f-section__title">{title}</span>
      {hint ? <span className="f-section__spacer" /> : null}
      {hint ? <span style={{ fontSize: "0.85em", color: "var(--ink-mute)", fontWeight: 500 }}>{hint}</span> : null}
    </div>
  );
}

/* ============================================================
   🔹 تک‌فیلد
   ============================================================ */
export function Field({
  label,
  value,
  span = 1,
  fullWidth = false,
  className = "",
}: {
  label: string;
  value?: string | React.ReactNode;
  span?: 1 | 2 | 3 | 4 | 5;
  fullWidth?: boolean;
  className?: string;
}) {
  const cls = [
    "f-cell",
    fullWidth ? "f-cell--full" : span > 1 ? `f-cell--span-${span}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      <div className="f-cell__label">{label}</div>
      <div className="f-cell__value">{value || "\u00A0"}</div>
    </div>
  );
}

/* ============================================================
   🔹 باکس متن بلند (توضیحات / آدرس)
   ============================================================ */
export function LongField({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <div className="f-multiline">
      <div className="f-multiline__label">{label}</div>
      <div className="f-multiline__value">{value || "\u00A0"}</div>
    </div>
  );
}

/* ============================================================
   🔹 قاب عکس (فرم ۱۱۱)
   ============================================================ */
export function PhotoBox({
  label = "عکس ۴×۳",
  note = "محل الصاق عکس",
}: {
  label?: string;
  note?: string;
}) {
  return (
    <div className="f-photo">
      <div className="f-photo__label">{label}</div>
      <div className="f-photo__box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" style={{ width: "10mm", height: "10mm", opacity: 0.4 }}>
          <circle cx="12" cy="9" r="3.3" />
          <path d="M4 20c1.5-3.4 4.5-5 8-5s6.5 1.6 8 5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="f-photo__note">{note}</div>
    </div>
  );
}

/* ============================================================
   🔹 قاب عکس + متن کناری
   ============================================================ */
export function PhotoWithText({
  children,
  label,
  note,
}: {
  children: React.ReactNode;
  label?: string;
  note?: string;
}) {
  return (
    <div className="f-photo-wrap">
      <PhotoBox label={label} note={note} />
      <div className="f-photo-aside">{children}</div>
    </div>
  );
}

/* ============================================================
   🔹 جدول رسمی
   ============================================================ */
export function OfficialTable({
  columns,
  rows,
  numbered = true,
  footer,
}: {
  columns: Array<{ key: string; label: string; width?: string; align?: "right" | "center" | "left"; className?: string }>;
  rows: Array<Record<string, React.ReactNode>>;
  numbered?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <table className="f-table">
      <thead>
        <tr>
          {numbered ? <th className="f-table__num">ردیف</th> : null}
          {columns.map((c) => (
            <th key={c.key} style={{ width: c.width, textAlign: c.align || "center" }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {numbered ? <td className="f-table__num">{i + 1}</td> : null}
            {columns.map((c) => (
              <td key={c.key} style={{ textAlign: c.align || "right" }} className={c.className}>
                {row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {footer ? (
        <tfoot>
          <tr>
            <td colSpan={columns.length + (numbered ? 1 : 0)}>{footer}</td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

/* ============================================================
   🔹 متن ابلاغیه/حکم (تمام‌عرض و پاراگرافی)
   ============================================================ */
export function Proclamation({ children }: { children: React.ReactNode }) {
  return <div className="f-proclamation">{children}</div>;
}

/* ============================================================
   🔹 تعهدنامه
   ============================================================ */
export function Declaration({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="f-declaration">
      {title ? <div className="f-declaration__title">{title}</div> : null}
      <div className="f-declaration__body">{children}</div>
    </div>
  );
}

/* ============================================================
   🔹 ردیف امضاها
   ============================================================ */
export function Signatures({
  items,
  cols,
}: {
  items: Array<{ title: string; sub?: string }>;
  cols?: 2 | 3 | 4 | 5;
}) {
  return (
    <div className={`f-signatures f-signatures--${cols || items.length}`}>
      {items.map((it, idx) => (
        <div key={idx} className="f-sig">
          <div className="f-sig__line" />
          <div className="f-sig__title">{it.title}</div>
          {it.sub ? <div className="f-sig__sub">{it.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   🔹 ردیف تأیید و ثبت (فرم ۱۱۱)
   ============================================================ */
export function VerifyRow({ items }: { items: string[] }) {
  return (
    <div className="f-verify">
      {items.map((label, idx) => (
        <div key={idx} className="f-verify__cell">
          <div className="f-verify__title">{label}</div>
          <div className="f-verify__sign" />
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   🔹 پاورقی
   ============================================================ */
export function DocFooter({ left, right }: { left?: string; right?: string }) {
  return (
    <div className="f-footer">
      <div className="f-footer__ref">{left}</div>
      <div>{right}</div>
    </div>
  );
}
