"use client";

import { useEffect, useState } from "react";

interface UserRow {
  id: number;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = { admin: "مدیر سیستم", operator: "کاربر ثبت", viewer: "مشاهده‌گر" };

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({ username: "", password: "", fullName: "", role: "operator" });
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(data.data || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "خطا"); return; }
    setForm({ username: "", password: "", fullName: "", role: "operator" });
    load();
  }

  async function changeRole(id: number, role: string) {
    await fetch(`/api/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    load();
  }

  async function toggleActive(id: number, isActive: boolean) {
    await fetch(`/api/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    load();
  }

  async function resetPassword(id: number) {
    const pass = prompt("رمز عبور جدید:");
    if (!pass) return;
    await fetch(`/api/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pass }),
    });
    alert("رمز عبور بروزرسانی شد");
  }

  async function del(id: number) {
    if (!confirm("حذف این کاربر؟")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "خطا در حذف"); return; }
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">مدیریت کاربران</h1>
      <p className="text-slate-500 text-sm mb-6">تعریف کاربران و سطوح دسترسی (مدیر / ثبت / مشاهده)</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-700 mb-3">افزودن کاربر</h2>
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-2 mb-3">{error}</div>}
          <div className="space-y-3">
            <input placeholder="نام و نام خانوادگی" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="نام کاربری" dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="رمز عبور" type="password" dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="admin">مدیر سیستم</option>
              <option value="operator">کاربر ثبت</option>
              <option value="viewer">مشاهده‌گر</option>
            </select>
            <button onClick={add} className="w-full bg-emerald-600 text-white rounded-lg py-2 text-sm">افزودن کاربر</button>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-700 mb-3">کاربران سیستم</h2>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">نام</th>
                <th className="px-3 py-2 text-right">نام کاربری</th>
                <th className="px-3 py-2 text-right">نقش</th>
                <th className="px-3 py-2 text-right">وضعیت</th>
                <th className="px-3 py-2 text-right">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2">{u.fullName}</td>
                  <td className="px-3 py-2 font-mono text-xs" dir="ltr">{u.username}</td>
                  <td className="px-3 py-2">
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
                    >
                      <option value="admin">مدیر سیستم</option>
                      <option value="operator">کاربر ثبت</option>
                      <option value="viewer">مشاهده‌گر</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleActive(u.id, !u.isActive)}
                      className={`text-xs rounded-lg px-2 py-1 ${u.isActive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}
                    >
                      {u.isActive ? "فعال" : "غیرفعال"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button onClick={() => resetPassword(u.id)} className="text-blue-600 hover:underline">تغییر رمز</button>
                      <button onClick={() => del(u.id)} className="text-red-600 hover:underline">حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
