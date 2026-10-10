"use client";

import { useMemo } from "react";
import { toFaDigits, isoToJalali } from "@/lib/jalali";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line, CartesianGrid } from "recharts";
import * as XLSX from "xlsx";

const COLORS = ["#059669", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#6366f1"];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  data?: any[];
  visualization?: string;
  answerKind?: string;
  export?: boolean;
  success?: boolean;
  error?: string;
  message?: string;
  total?: number;
  groupBy?: string;
  excelReady?: boolean;
  excelFileName?: string;
}

export default function ChatResponseRenderer({ message }: { message: ChatMessage }) {
  const soldierFields = useMemo(() => {
    if (!message.data || message.data.length === 0) return [];
    const sample = message.data[0];
    return [
      { key: "fullName", label: "نام و نشان" },
      { key: "firstName", label: "نام" },
      { key: "lastName", label: "نام خانوادگی" },
      { key: "personnelCode", label: "کد پرسنلی" },
      { key: "nationalCode", label: "کد ملی" },
      { key: "rank", label: "درجه" },
      { key: "serviceUnit", label: "رده خدمتی" },
      { key: "phoneNumber", label: "شماره تماس", required: true },
      { key: "physicalStatus", label: "وضعیت جسمانی", required: true },
      { key: "maritalStatus", label: "وضعیت تاهل" },
      { key: "educationLevel", label: "مدرک" },
      { key: "dispatchDate", label: "اعزام", date: true },
      { key: "serviceEndDate", label: "پایان خدمت", date: true },
      // Only present on transfer-relation answers
      { key: "transferFrom", label: "از رده" },
      { key: "transferTo", label: "به رده" },
      { key: "transferDate", label: "تاریخ انتقال", date: true },
      { key: "transferStatus", label: "وضعیت انتقال" },
    ].filter((f) => (f as { required?: boolean }).required || sample[f.key] !== undefined);
  }, [message.data]);

  // Handle download Excel
  function downloadExcel() {
    if (!message.data) return;
    const excelRows: any[] = [];
    if (message.groupBy) {
      excelRows.push({ [message.groupBy]: "", "تعداد": "" });
      for (const row of message.data) {
        excelRows.push({ [message.groupBy]: row.label, "تعداد": row.value });
      }
    } else {
      excelRows.push({
        "ردیف": "", "نام": "", "نام خانوادگی": "", "کد ملی": "",
        "کد پرسنلی": "", "درجه": "", "رده خدمتی": "", "شهر": "",
      });
      message.data.forEach((soldier: any, i: number) => {
        excelRows.push({
          "ردیف": i + 1,
          "نام": soldier.firstName || "",
          "نام خانوادگی": soldier.lastName || "",
          "کد ملی": soldier.nationalCode || "",
          "کد پرسنلی": soldier.personnelCode || "",
          "درجه": soldier.rank || "",
          "رده خدمتی": soldier.serviceUnit || "",
          "شهر": soldier.city || "",
        });
      });
    }
    const ws = XLSX.utils.json_to_sheet(excelRows, { skipHeader: false });
    ws["!cols"] = Array(Object.keys(excelRows[0] || {}).length).fill({ wch: 18 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نتایج AI");
    const arr: number[] = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([new Uint8Array(arr)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = message.excelFileName || "srms-ai-export.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Error state
  if (!message.success) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-red-700 font-bold text-sm mb-1">⚠️ خطا</div>
        <p className="text-red-600 text-sm">{message.error || "خطای نامشخص"}</p>
      </div>
    );
  }

  // ── Fine-grained FACT answer (advanced NLP) ──
  // «تاریخ پایان خدمت احمد کاظمی» → a sentence, not a table.
  if (message.answerKind === "fact" && message.data && message.data.length === 1) {
    const p = message.data[0];
    return (
      <div className="rounded-xl border border-emerald-200 bg-gradient-to-l from-emerald-50 to-white p-4">
        <p className="text-[15px] leading-8 font-bold text-emerald-900 whitespace-pre-line">
          {message.message}
        </p>
        <div className="mt-3 pt-3 border-t border-emerald-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <span>👤 {p.firstName} {p.lastName}</span>
          {p.personnelCode && <span>🆔 کد پرسنلی: {toFaDigits(p.personnelCode)}</span>}
          {p.serviceUnit && <span>🏛️ {p.serviceUnit}</span>}
          {p.rank && <span>🎖️ {p.rank}</span>}
          <a href={`/soldiers/${p.id}`} className="text-emerald-700 hover:underline font-medium">
            مشاهده پرونده کامل ←
          </a>
        </div>
      </div>
    );
  }

  // ── Ambiguous name / not-found answer: plain sentence, no empty table ──
  if ((message.answerKind === "fact" || message.answerKind === "profile") && (!message.data || message.data.length !== 1)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm leading-8 text-amber-900 whitespace-pre-line">{message.message}</p>
      </div>
    );
  }

  // Count result
  if (message.data && message.data.length > 0 && message.data[0]?.total !== undefined && !message.groupBy) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
        <div className="text-4xl font-bold text-emerald-700">{toFaDigits(message.data[0].total)}</div>
        <div className="text-sm text-emerald-600 mt-1">سرباز یافت شد</div>
        {message.export && (
          <button onClick={downloadExcel} className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg px-4 py-2">
            📥 دانلود اکسل
          </button>
        )}
      </div>
    );
  }

  // Aggregate / Chart data
  if (message.groupBy && message.data && message.data.length > 0) {
    const chartData = message.data.map((d: any) => ({ name: d.label, value: d.value }));
    return (
      <div className="space-y-3">
        {/* Message */}
        {message.message && (
          <div className="text-sm text-slate-600 font-medium">{message.message}</div>
        )}
        {/* Chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-4" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            {message.visualization === "pie" ? (
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }: any) => `${name} (${toFaDigits((percent * 100).toFixed(0))}٪)`}
                >
                  {chartData.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => toFaDigits(Number(value))} />
              </PieChart>
            ) : message.visualization === "line" ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: any) => toFaDigits(Number(value))} />
                <Legend />
                <Line type="monotone" dataKey="value" stroke="#059669" strokeWidth={2} dot={{ fill: "#059669" }} />
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: any) => toFaDigits(Number(value))} />
                <Bar dataKey="value" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
        {message.export && (
          <button onClick={downloadExcel} className="bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg px-4 py-2">
            📥 دانلود اکسل
          </button>
        )}
      </div>
    );
  }

  // Table data
  if (message.data && message.data.length > 0) {
    return (
      <div className="space-y-3">
        {/* Summary message */}
        {message.message && (
          <div className="text-sm text-slate-600 font-medium">{message.message}</div>
        )}
        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-right font-medium">#</th>
                  {soldierFields.map((f) => (
                    <th key={f.key} className="px-2 py-2 text-right font-medium whitespace-nowrap">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {message.data.slice(0, 50).map((row: any, i: number) => (
                  <tr key={row.id || i} className="hover:bg-slate-50">
                    <td className="px-2 py-1.5 text-slate-400">{toFaDigits(i + 1)}</td>
                    {soldierFields.map((f) => {
                      let v = row[f.key];
                      if (f.date && v) v = isoToJalali(v);
                      return (
                        <td key={f.key} className="px-2 py-1.5 whitespace-nowrap text-slate-700">
                          {v ? toFaDigits(String(v)) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {message.data.length > 50 && (
            <div className="text-center text-xs text-slate-400 py-2 bg-slate-50">
              نمایش ۵۰ از {toFaDigits(message.data.length)} نتیجه
            </div>
          )}
        </div>
        {message.export && (
          <button onClick={downloadExcel} className="bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg px-4 py-2">
            📥 دانلود اکسل ({toFaDigits(message.data.length)} رکورد)
          </button>
        )}
      </div>
    );
  }

  // No data
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
      <div className="text-3xl mb-2">🔍</div>
      <div className="text-slate-500 font-medium text-sm">نتیجه‌ای یافت نشد</div>
      <div className="text-slate-400 text-xs mt-1">فیلترهای دیگری را امتحان کنید</div>
    </div>
  );
}
