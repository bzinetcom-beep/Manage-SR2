"use client";

import { useState } from "react";

type PaperSize = "a4" | "a5";

export default function PrintButton() {
  const [size, setSize] = useState<PaperSize>("a4");

  function applySize(s: PaperSize) {
    setSize(s);
    document.body.classList.toggle("size-a5", s === "a5");
    const styleId = "print-page-size-style";
    let el = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = styleId;
      document.head.appendChild(el);
    }
    el.innerHTML = s === "a5"
      ? "@page { size: A5 portrait; margin: 0; }"
      : "@page { size: A4 portrait; margin: 0; }";
  }

  function doPrint() {
    applySize(size);
    // Save current title so we can restore it after print
    const originalTitle = document.title;
    // Prefer doc-filename meta, otherwise use current title (already set by page)
    const meta = document.querySelector('meta[name="doc-filename"]') as HTMLMetaElement | null;
    const targetName = (meta?.content || originalTitle || "فرم").replace(/\.pdf$/i, "") + ".pdf";
    document.title = targetName;

    const restore = () => {
      document.title = originalTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    setTimeout(() => window.print(), 80);
  }

  return (
    <div className="no-print fixed top-4 left-4 z-50 flex flex-wrap gap-2 items-center bg-white/95 backdrop-blur p-2 rounded-xl shadow-lg border border-slate-200">
      <span className="text-xs text-slate-600 font-bold px-1">اندازه کاغذ:</span>
      <button
        onClick={() => applySize("a4")}
        className={`text-xs rounded-lg px-3 py-1.5 border transition ${
          size === "a4"
            ? "bg-emerald-600 text-white border-emerald-600"
            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
        }`}
      >
        A4
      </button>
      <button
        onClick={() => applySize("a5")}
        className={`text-xs rounded-lg px-3 py-1.5 border transition ${
          size === "a5"
            ? "bg-emerald-600 text-white border-emerald-600"
            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
        }`}
      >
        A5
      </button>
      <button
        onClick={doPrint}
        className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg px-4 py-1.5 shadow font-bold"
      >
        🖨️ چاپ / PDF
      </button>
      <button
        onClick={() => window.close()}
        className="bg-slate-200 text-slate-700 text-sm rounded-lg px-4 py-1.5 shadow"
      >
        بستن
      </button>
    </div>
  );
}
