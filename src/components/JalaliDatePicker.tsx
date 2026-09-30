"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as jalaali from "jalaali-js";
import { toFaDigits, toEnDigits } from "@/lib/jalali";

const MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

interface JParts {
  jy: number;
  jm: number;
  jd: number;
}

/** Accepts 1402/5/3 · 1402-05-03 · 1402.05.03 · ۱۴۰۲/۰۵/۰۳ · 14020503 */
function parseValue(value?: string): JParts | null {
  if (!value) return null;
  const raw = toEnDigits(String(value).trim());
  if (!raw) return null;

  // Compact form: 8 digits → yyyymmdd
  const compact = raw.replace(/\D/g, "");
  if (!/[/\-.\s]/.test(raw) && compact.length === 8) {
    return {
      jy: parseInt(compact.slice(0, 4), 10),
      jm: parseInt(compact.slice(4, 6), 10),
      jd: parseInt(compact.slice(6, 8), 10),
    };
  }

  const parts = raw.split(/[/\-.\s]+/).filter(Boolean).map((x) => parseInt(x, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return { jy: parts[0], jm: parts[1], jd: parts[2] };
}

/** Is this a real Jalali date? */
function isValidJalali(p: JParts | null): p is JParts {
  if (!p) return false;
  if (p.jy < 1200 || p.jy > 1600) return false;
  if (p.jm < 1 || p.jm > 12) return false;
  if (p.jd < 1) return false;
  return p.jd <= jalaali.jalaaliMonthLength(p.jy, p.jm);
}

function todayJ(): JParts {
  const now = new Date();
  return jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

const fmt = (p: JParts) =>
  `${p.jy}/${String(p.jm).padStart(2, "0")}/${String(p.jd).padStart(2, "0")}`;

export default function JalaliDatePicker({
  value,
  onChange,
  placeholder = "مثال: ۱۴۰۲/۰۵/۰۳",
  className = "",
  /** Range offered in the year dropdown, relative to the current Jalali year. */
  yearsBack = 80,
  yearsForward = 15,
}: {
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  yearsBack?: number;
  yearsForward?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const parsed = parseValue(value);
  const t = todayJ();

  const [viewY, setViewY] = useState(parsed?.jy ?? t.jy);
  const [viewM, setViewM] = useState(parsed?.jm ?? t.jm);

  // ── Manual typing state ────────────────────────────────────────────────
  // `text` mirrors what the user types; it is only pushed upstream when valid.
  const [text, setText] = useState(parsed ? toFaDigits(fmt(parsed)) : "");
  const [typing, setTyping] = useState(false);

  // Keep the visible text in sync when the value changes from outside.
  useEffect(() => {
    if (typing) return;
    const p = parseValue(value);
    setText(p ? toFaDigits(fmt(p)) : "");
  }, [value, typing]);

  useEffect(() => {
    if (open) {
      const p = parseValue(value);
      setViewY(p?.jy ?? t.jy);
      setViewM(p?.jm ?? t.jm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = t.jy + yearsForward; y >= t.jy - yearsBack; y--) list.push(y);
    // Make sure a stored out-of-range year is still selectable.
    if (parsed && !list.includes(parsed.jy)) {
      list.push(parsed.jy);
      list.sort((a, b) => b - a);
    }
    return list;
  }, [t.jy, yearsBack, yearsForward, parsed?.jy]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Clamp the day when switching to a shorter month (e.g. 31 Esfand). */
  function commit(y: number, m: number, d: number) {
    const maxDay = jalaali.jalaaliMonthLength(y, m);
    const day = Math.min(Math.max(1, d), maxDay);
    onChange(fmt({ jy: y, jm: m, jd: day }));
  }

  function pick(day: number) {
    commit(viewY, viewM, day);
    setTyping(false);
    setOpen(false);
  }

  function onTextChange(next: string) {
    setTyping(true);
    // Allow digits and separators only; auto-insert "/" as the user types.
    let cleaned = toEnDigits(next).replace(/[^\d/\-.]/g, "");
    const digitsOnly = cleaned.replace(/\D/g, "");
    if (!/[/\-.]/.test(cleaned) && digitsOnly.length > 4) {
      cleaned =
        digitsOnly.length <= 6
          ? `${digitsOnly.slice(0, 4)}/${digitsOnly.slice(4)}`
          : `${digitsOnly.slice(0, 4)}/${digitsOnly.slice(4, 6)}/${digitsOnly.slice(6, 8)}`;
    }
    setText(toFaDigits(cleaned));

    const p = parseValue(cleaned);
    if (isValidJalali(p)) {
      onChange(fmt(p));
      setViewY(p.jy);
      setViewM(p.jm);
    } else if (cleaned === "") {
      onChange("");
    }
  }

  function onBlurText() {
    setTyping(false);
    const p = parseValue(text);
    if (isValidJalali(p)) {
      setText(toFaDigits(fmt(p)));
      onChange(fmt(p));
    } else if (text.trim() === "") {
      onChange("");
    } else {
      // Invalid → restore the last good value instead of keeping garbage.
      const prev = parseValue(value);
      setText(prev ? toFaDigits(fmt(prev)) : "");
    }
  }

  const daysInMonth = jalaali.jalaaliMonthLength(viewY, viewM);
  const { gy, gm, gd } = jalaali.toGregorian(viewY, viewM, 1);
  const firstWeekday = (new Date(gy, gm - 1, gd).getDay() + 1) % 7; // Saturday = 0

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const typedInvalid = text.trim() !== "" && !isValidJalali(parseValue(text));

  const selectCls =
    "border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer";

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-stretch gap-1">
        {/* Manual entry — fully typeable */}
        <input
          type="text"
          inputMode="numeric"
          dir="ltr"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onBlur={onBlurText}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onBlurText(); setOpen(false); }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          aria-invalid={typedInvalid}
          className={`w-full border rounded-lg px-3 py-2 text-sm text-center focus:ring-2 outline-none transition-colors ${
            typedInvalid
              ? "border-red-400 focus:ring-red-400 bg-red-50"
              : "border-slate-300 focus:ring-emerald-500"
          } ${className}`}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="انتخاب از تقویم"
          aria-label="انتخاب از تقویم"
          className="shrink-0 px-2.5 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-emerald-600 transition-colors"
        >
          📅
        </button>
        {text && (
          <button
            type="button"
            onClick={() => { setTyping(false); setText(""); onChange(""); }}
            className="shrink-0 px-2 text-slate-400 hover:text-red-500 text-sm"
            title="پاک کردن"
            aria-label="پاک کردن تاریخ"
          >
            ✕
          </button>
        )}
      </div>

      {typedInvalid && (
        <p className="text-[11px] text-red-500 mt-1">تاریخ نامعتبر است — قالب صحیح: ۱۴۰۲/۰۵/۰۳</p>
      )}

      {open && (
        <div className="absolute z-50 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 w-72 right-0">
          {/* ── Year / month dropdowns ── */}
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => (viewM === 1 ? (setViewM(12), setViewY((y) => y - 1)) : setViewM((m) => m - 1))}
              className="w-8 h-8 shrink-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
              title="ماه قبل"
            >
              ‹
            </button>

            <select
              value={viewM}
              onChange={(e) => setViewM(Number(e.target.value))}
              className={`${selectCls} flex-1`}
              aria-label="انتخاب ماه"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>

            <select
              value={viewY}
              onChange={(e) => setViewY(Number(e.target.value))}
              className={`${selectCls} w-24`}
              aria-label="انتخاب سال"
            >
              {years.map((y) => (
                <option key={y} value={y}>{toFaDigits(y)}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => (viewM === 12 ? (setViewM(1), setViewY((y) => y + 1)) : setViewM((m) => m + 1))}
              className="w-8 h-8 shrink-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
              title="ماه بعد"
            >
              ›
            </button>
          </div>

          {/* ── Day grid ── */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[11px] text-slate-400 font-medium">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const isSelected = parsed && parsed.jy === viewY && parsed.jm === viewM && parsed.jd === d;
              const isToday = t.jy === viewY && t.jm === viewM && t.jd === d;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(d)}
                  className={`h-8 rounded-lg text-sm transition ${
                    isSelected
                      ? "bg-emerald-600 text-white font-bold"
                      : isToday
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-300"
                        : "hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {toFaDigits(d)}
                </button>
              );
            })}
          </div>

          {/* ── Quick day picker (for very old dates, avoids long scrolling) ── */}
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2">
            <label className="text-[11px] text-slate-500 shrink-0">روز:</label>
            <select
              value={parsed && parsed.jy === viewY && parsed.jm === viewM ? parsed.jd : ""}
              onChange={(e) => e.target.value && pick(Number(e.target.value))}
              className={`${selectCls} flex-1`}
              aria-label="انتخاب روز"
            >
              <option value="">— انتخاب روز —</option>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{toFaDigits(d)}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                const tt = todayJ();
                setViewY(tt.jy);
                setViewM(tt.jm);
                setTyping(false);
                onChange(fmt(tt));
                setOpen(false);
              }}
              className="text-xs text-emerald-600 hover:underline font-medium"
            >
              امروز
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:underline">
              بستن
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
