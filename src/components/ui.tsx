"use client";

import { toFaDigits } from "@/lib/jalali";

export function StatCard({
  title,
  value,
  icon,
  color = "emerald",
}: {
  title: string;
  value: number | string;
  icon: string;
  color?: string;
}) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color] || colors.emerald}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm opacity-80">{title}</div>
          <div className="text-3xl font-bold mt-1">{toFaDigits(value)}</div>
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </div>
  );
}

export function BarList({
  title,
  data,
  color = "emerald",
}: {
  title: string;
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barColor: Record<string, string> = {
    emerald: "bg-emerald-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    violet: "bg-violet-500",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-bold text-slate-700 mb-4">{title}</h3>
      <div className="space-y-3">
        {data.slice(0, 8).map((d) => (
          <div key={d.label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-600">{d.label}</span>
              <span className="text-slate-500 font-medium">{toFaDigits(d.value)}</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor[color] || barColor.emerald}`}
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {data.length === 0 && <div className="text-sm text-slate-400">داده‌ای موجود نیست</div>}
      </div>
    </div>
  );
}

const DONUT_COLORS = ["#059669", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777"];

export function Donut({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number }[];
}) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  let acc = 0;
  const R = 60;
  const C = 2 * Math.PI * R;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-bold text-slate-700 mb-4">{title}</h3>
      <div className="flex items-center gap-6 flex-wrap">
        <svg width="150" height="150" viewBox="0 0 150 150" className="shrink-0">
          <g transform="translate(75,75) rotate(-90)">
            {data.slice(0, 7).map((d, i) => {
              const frac = d.value / total;
              const dash = frac * C;
              const el = (
                <circle
                  key={d.label}
                  r={R}
                  fill="none"
                  stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                  strokeWidth="22"
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-acc}
                />
              );
              acc += dash;
              return el;
            })}
          </g>
          <text x="75" y="80" textAnchor="middle" className="fill-slate-700 font-bold text-lg">
            {toFaDigits(total)}
          </text>
        </svg>
        <div className="space-y-1.5 text-sm">
          {data.slice(0, 7).map((d, i) => (
            <div key={d.label} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded"
                style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
              />
              <span className="text-slate-600">{d.label}</span>
              <span className="text-slate-400">({toFaDigits(d.value)})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
