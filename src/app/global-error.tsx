"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center text-2xl font-bold mb-4">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-white mb-2">خطایی در سامانه رخ داده است</h2>
          <p className="text-sm text-slate-400 mb-6">
            سامانه با خطای سیستمی مواجه شد. لطفاً صفحه را مجدداً بارگذاری کنید یا دکمه زیر را بزنید.
          </p>
          <button
            onClick={() => reset()}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition"
          >
            تلاش مجدد
          </button>
        </div>
      </body>
    </html>
  );
}
