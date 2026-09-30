"use client";

import { useEffect, useState } from "react";
import PrintButton from "@/components/PrintButton";

interface LetterDoc {
  id: number;
  bodyHtml: string;
  pageSize: string;
  subject: string;
  soldierName: string;
  templateName?: string;
}

export default function LettersPrintPage() {
  const [docs, setDocs] = useState<LetterDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = new URLSearchParams(window.location.search).get("ids") || "";
    const list = ids.split(",").map((s) => Number(s.trim())).filter(Boolean);
    (async () => {
      const out: LetterDoc[] = [];
      for (const id of list) {
        try {
          const r = await fetch(`/api/letters/${id}`).then((x) => x.json());
          if (r?.data) out.push(r.data);
        } catch {
          /* ignore */
        }
      }
      setDocs(out);
      setLoading(false);
      if (out.length) document.title = out.length === 1 ? `${out[0].templateName ?? "نامه"}-${out[0].soldierName}` : `نامه‌ها (${out.length})`;
    })();
  }, []);

  return (
    <div className="print-root bg-slate-300 min-h-screen py-6">
      <PrintButton />
      {loading && <div className="text-center text-slate-600 no-print">در حال بارگذاری نامه‌ها…</div>}
      {!loading && !docs.length && <div className="text-center text-slate-600 no-print">نامه‌ای یافت نشد.</div>}
      <div className="flex flex-col items-center gap-6">
        {docs.map((d) => (
          <div
            key={d.id}
            dir="rtl"
            className="letter-sheet bg-white text-black shadow-xl"
            style={{
              width: d.pageSize === "A5" ? "148mm" : "210mm",
              minHeight: d.pageSize === "A5" ? "210mm" : "297mm",
              padding: "15mm",
              fontFamily: "Vazirmatn, Tahoma, sans-serif",
              fontSize: "12pt",
              lineHeight: 2,
              boxSizing: "border-box",
            }}
            dangerouslySetInnerHTML={{ __html: d.bodyHtml }}
          />
        ))}
      </div>
      <style>{`
        @media print {
          body { background: #fff !important; }
          .letter-sheet {
            box-shadow: none !important;
            margin: 0 !important;
            page-break-after: always;
            break-after: page;
          }
          .letter-sheet:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>
    </div>
  );
}
