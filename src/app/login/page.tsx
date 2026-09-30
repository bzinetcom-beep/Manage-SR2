"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toFaDigits, todayJalali, isoToJalali } from "@/lib/jalali";
import * as jalaali from "jalaali-js";
import { Quote, BookOpen, Clock, CalendarDays, User, Lock, ArrowLeft, ShieldCheck } from "lucide-react";
// Flag image is loaded dynamically from widget-settings API

// ═══════════════════════════════════════════════════════════
// DATA: Quran Verses
// ═══════════════════════════════════════════════════════════
const QURAN_VERSES = [
  { ar: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", fa: "به نام خداوند بخشنده مهربان", ref: "سوره حمد، آیه ۱" },
  { ar: "إِنَّ اللَّهَ مَعَ الصَّابِرِينَ", fa: "خداوند با صبرکنندگان است", ref: "سوره بقره، آیه ۱۵۳" },
  { ar: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ", fa: "هر کس بر خدا توکل کند، خداوند او را کافی است", ref: "سوره طلاق، آیه ۳" },
  { ar: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً", fa: "پروردگارا، به ما در دنیا و آخرت نیکی عطا فرما", ref: "سوره بقره، آیه ۲۰۱" },
  { ar: "وَقُل رَّبِّ زِدْنِي عِلْمًا", fa: "بگو پروردگارا، بر دانش من بیفزا", ref: "سوره طه، آیه ۱۱۴" },
  { ar: "رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي", fa: "پروردگارا، سینه‌ام را گشاده کن و کارم را آسان گردان", ref: "سوره طه، آیه ۲۵-۲۶" },
  { ar: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا", fa: "پس بی‌گمان با سختی آسانی است", ref: "سوره انشراح، آیه ۵" },
  { ar: "وَلَسَوْفَ يُعْطِيكَ رَبُّكَ فَتَرْضَىٰ", fa: "و به‌زودی پروردگارت آنقدر عطا خواهد کرد که خشنود شوی", ref: "سوره ضحی، آیه ۵" },
  { ar: "وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ عَلَيْهِ تَوَكَّلْتُ", fa: "توفیق من جز از جانب خدا نیست، بر او توکل کردم", ref: "سوره هود، آیه ۸۸" },
];

// ═══════════════════════════════════════════════════════════
// DATA: Dr. Ali Shariati Quotes
// ═══════════════════════════════════════════════════════════
const SHARIATI_QUOTES = [
  "خدا را باید در آینه دل جست، نه در آسمان‌ها.",
  "انسان، موجودی است که همیشه در جستجوی معنای زندگی خویش است.",
  "آزادی، هنر انسان بودن است.",
  "هر انسانی یک تاریخ است، یک فرهنگ است، یک تمدن است.",
  "ایمان، حرکت است نه توقف. ایمان، ساختن است نه یافتن.",
  "عاشق کسی است که معشوقش را در همه چیز ببیند.",
  "تمدن‌ها با ایمان ساخته می‌شوند و با بی‌ایمانی ویران.",
  "آگاهی، دردناک‌ترین موهبت خداوند به انسان است.",
  "مسئولیت، رنج آگاهی است.",
  "بزرگ‌ترین ظلم، ظلم به خویشتن است.",
];

// ═══════════════════════════════════════════════════════════
// DATA: Persian Calendar Holidays
// ═══════════════════════════════════════════════════════════
const HOLIDAYS: Record<string, string> = {
  "1/1": "عید نوروز", "1/2": "عید نوروز", "1/3": "عید نوروز", "1/4": "عید نوروز",
  "1/12": "روز جمهوری اسلامی", "1/13": "سیزده‌بدر",
  "3/14": "رحلت امام خمینی (ره)", "3/15": "قیام ۱۵ خرداد",
  "7/8": "عید فطر", "7/9": "عید فطر",
  "9/9": "ولادت امام حسین (ع)", "9/10": "عاشورای حسینی",
  "10/10": "عید قربان",
  "11/22": "ولادت حضرت محمد (ص)", "11/27": "مبعث پیامبر (ص)",
  "12/29": "ملی شدن صنعت نفت",
};

function getHoliday(jm: number, jd: number): string | null {
  return HOLIDAYS[`${jm}/${jd}`] || null;
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => setIsClient(true), []);

  // ── Clock State ──
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Jalali Date ──
  const now = new Date();
  const { jy, jm, jd } = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const holiday = getHoliday(jm, jd);
  const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  const WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
  const dayOfWeek = WEEKDAYS[(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getDay() + 1) % 7];

  // ── Calendar Grid ──
  const [calendarDays, setCalendarDays] = useState<(number | null)[]>([]);
  useEffect(() => {
    const days = getJalaliMonthDays(jy, jm);
    const first = getFirstWeekdayOfMonth(jy, jm);
    const result: (number | null)[] = [];
    for (let i = 0; i < first; i++) result.push(null);
    for (let d = 1; d <= days; d++) result.push(d);
    setCalendarDays(result);
  }, [jy, jm]);

  // ── Rotations ──
  // Note: Quote section is now STATIC (fixed text + fixed image).
  // Only the Quran verse continues to rotate daily.
  const [verseIdx, setVerseIdx] = useState(0);
  useEffect(() => {
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    setVerseIdx(diff % QURAN_VERSES.length);
  }, []);

  const currentVerse = QURAN_VERSES[verseIdx] || QURAN_VERSES[0];

  // ── Quote Widget (loaded from DB via API; falls back to defaults) ──
  const [quoteText, setQuoteText] = useState("خطرناک تر از ناو، سلاحی است که آن را به قعر دریا می فرستد");
  const [quoteAuthor, setQuoteAuthor] = useState("قائد شهید امت");
  const [quoteImage, setQuoteImage] = useState<string>("");
  const [quoteImageFit, setQuoteImageFit] = useState<"cover" | "contain">("contain");
  const [flagImage, setFlagImage] = useState<string>("/iran-flag.jpg"); // default fallback
  useEffect(() => {
    fetch("/api/widget-settings/quote", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        if (d.data.quoteText) setQuoteText(d.data.quoteText);
        if (d.data.quoteAuthor) setQuoteAuthor(d.data.quoteAuthor);
        if (d.data.quoteImage) setQuoteImage(d.data.quoteImage);
        if (d.data.quoteImageFit === "cover" || d.data.quoteImageFit === "contain") {
          setQuoteImageFit(d.data.quoteImageFit);
        }
        if (d.data.flagImage) setFlagImage(d.data.flagImage);
      })
      .catch(() => {});
  }, []);
  const FIXED_QUOTE_IMAGE = quoteImage;
  const FIXED_FLAG_IMAGE = flagImage;

  // ── Form Submit ──
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "خطا در ورود"); return; }
      router.push("/dashboard");
      router.refresh();
    } catch { setError("خطای ارتباط با سرور"); }
    finally { setLoading(false); }
  }

  const hours = toFaDigits(time.getHours().toString().padStart(2, "0"));
  const minutes = toFaDigits(time.getMinutes().toString().padStart(2, "0"));
  const seconds = toFaDigits(time.getSeconds().toString().padStart(2, "0"));
  const isAm = time.getHours() < 12;

  if (!isClient) return null; // Prevent hydration mismatch

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#020817] flex items-center justify-center p-4 sm:p-8" dir="rtl" suppressHydrationWarning>
      {/* ═══ Background Effects ═══ */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-emerald-950/20 to-indigo-950/20" />
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-emerald-500/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[100px] mix-blend-screen pointer-events-none" />
      
      {/* ═══ Main Unified Container ═══ */}
      <div className="relative z-10 w-full max-w-7xl bg-white/[0.03] backdrop-blur-2xl rounded-[2.5rem] border border-white/[0.08] shadow-2xl overflow-hidden flex flex-col lg:flex-row shadow-black/50">
        
        {/* ═══════════════════════════════════════════
            LEFT COLUMN (Widgets: Clock + Calendar) 
            (It's on the right visually in RTL, but flex-col lg:flex-row puts it first by default in RTL layout if ordered, let's keep physical layout logical)
            Actually in RTL, flex-row makes the first DOM element appear on the RIGHT.
            So we place Clock+Calendar on the right, Form in middle, Quotes on the left.
            ═══════════════════════════════════════════ */}
        <div className="w-full lg:w-1/3 p-8 lg:p-10 border-b lg:border-b-0 lg:border-l border-white/[0.08] flex flex-col gap-8 bg-white/[0.01]">
          
          {/* Header */}
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-tight">سامانه مدیریت سرباز</h1>
              <p className="text-emerald-400/80 text-sm font-medium mt-0.5">پنل سازمانی</p>
            </div>
          </div>

          {/* ── Clock Widget (Professional Redesign) ── */}
          <div className="relative p-6 rounded-3xl bg-white/[0.03] border border-white/[0.05] shadow-inner overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
              <Clock className="w-24 h-24 text-white -mt-8 -mr-8" />
            </div>
            
            <div className="relative z-10">
              <div className="flex items-baseline justify-center gap-2" dir="ltr">
                <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-white/60 tracking-tighter">
                  {hours}:{minutes}
                </span>
                <span className="text-2xl font-bold text-emerald-400/80 w-8">{seconds}</span>
              </div>
              <div className="flex items-center justify-center gap-3 mt-4 text-sm font-medium">
                <span className="px-3 py-1 rounded-full bg-white/5 text-white/80 border border-white/10">
                  {dayOfWeek}
                </span>
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {isAm ? 'قبل از ظهر' : 'بعد از ظهر'}
                </span>
              </div>
            </div>
          </div>

          {/* ── Calendar Widget (Professional Redesign) ── */}
          <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/[0.05] flex-1">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-emerald-400" />
                <span className="text-white/90 font-bold">{JALALI_MONTHS[jm - 1]} {toFaDigits(jy)}</span>
              </div>
              <div className="text-sm font-bold text-white bg-white/10 px-3 py-1 rounded-lg">
                امروز: {toFaDigits(jd)}
              </div>
            </div>

            <div className="grid grid-cols-7 gap-y-2 gap-x-1">
              {["ش", "ی", "د", "س", "چ", "پ", "ج"].map((d, i) => (
                <div key={i} className="text-center text-xs font-medium text-white/40 pb-2 border-b border-white/5">{d}</div>
              ))}
              
              {calendarDays.map((d, i) => {
                const isToday = d === jd;
                const isHol = d ? getHoliday(jm, d) : null;
                
                return (
                  <div
                    key={i}
                    className={`aspect-square flex items-center justify-center text-sm rounded-xl relative transition-all duration-300 ${
                      isToday 
                        ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/30 scale-110 z-10" 
                        : d !== null 
                          ? isHol 
                            ? "text-rose-400 font-bold bg-rose-500/5 hover:bg-white/10" 
                            : "text-white/70 hover:bg-white/10 hover:text-white cursor-default" 
                          : ""
                    }`}
                    title={isHol || ""}
                  >
                    {d !== null ? toFaDigits(d) : ""}
                    {isHol && !isToday && <span className="absolute bottom-1 w-1 h-1 bg-rose-400 rounded-full" />}
                  </div>
                );
              })}
            </div>
            
            {holiday && (
              <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                <span className="text-amber-400">🎉</span>
                <span className="text-xs font-medium text-amber-200/90">{holiday}</span>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            CENTER COLUMN (Login Form)
            ═══════════════════════════════════════════ */}
        <div className="w-full lg:w-1/3 p-8 lg:p-12 flex flex-col justify-center relative bg-gradient-to-b from-white/[0.02] to-transparent">
          <div className="max-w-sm mx-auto w-full">
            {/* Waving Iran Flag above "Welcome" */}
            <div className="flex justify-center mb-6">
              <IranFlag className="w-44" src={FIXED_FLAG_IMAGE} />
            </div>

            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-white mb-2">خوش آمدید</h2>
              <p className="text-white/50 text-sm">لطفاً برای ورود به پنل، اطلاعات خود را وارد کنید.</p>
            </div>

            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/70 ml-1 block">نام کاربری</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-white/40 group-focus-within:text-emerald-400 transition-colors">
                    <User className="w-5 h-5" />
                  </div>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 focus:border-emerald-500 focus:bg-white/[0.06] rounded-2xl pr-12 pl-4 py-3.5 text-white outline-none transition-all placeholder-white/20 shadow-inner"
                    placeholder="admin"
                  />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/70 ml-1 block">رمز عبور</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-white/40 group-focus-within:text-emerald-400 transition-colors">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 focus:border-emerald-500 focus:bg-white/[0.06] rounded-2xl pr-12 pl-4 py-3.5 text-white outline-none transition-all placeholder-white/20 shadow-inner"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm rounded-xl p-3 text-center flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 group relative flex items-center justify-center gap-2 bg-gradient-to-l from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold rounded-2xl py-4 transition-all duration-300 disabled:opacity-70 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40"
              >
                {loading ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>در حال تأیید...</span>
                  </>
                ) : (
                  <>
                    <span>ورود به سامانه</span>
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-white/[0.08] flex items-center justify-between text-xs">
              <div className="text-white/40 flex items-center gap-1">
                تست: <strong className="text-white/70">admin / admin123</strong>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400/80">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                ارتباط امن
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            RIGHT COLUMN (Visually Left in RTL: Quotes & Quran)
            ═══════════════════════════════════════════ */}
        <div className="w-full lg:w-1/3 p-8 border-t lg:border-t-0 lg:border-r border-white/[0.08] flex flex-col gap-6 bg-black/20">
          
          {/* ── Quote Widget (STATIC — fixed image, fixed text, fixed author, glassmorphism) ── */}
          <div className="flex-1 relative rounded-3xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] overflow-hidden flex flex-col shadow-2xl">
            {/* Image area with glassmorphism effect */}
            <div className="relative h-64 w-full overflow-hidden bg-gradient-to-br from-slate-800 via-emerald-950/40 to-slate-900">
              {FIXED_QUOTE_IMAGE ? (
                <>
                  {/* Blurred background (always fills) */}
                  <div 
                    className="absolute inset-0 bg-cover bg-center blur-xl scale-110 opacity-50"
                    style={{ backgroundImage: `url(${FIXED_QUOTE_IMAGE})` }}
                  />
                  {/* Main image — full frame, respects fit mode */}
                  <img 
                    src={FIXED_QUOTE_IMAGE} 
                    alt={quoteAuthor} 
                    className="absolute inset-0 w-full h-full"
                    style={{ objectFit: quoteImageFit }}
                  />
                </>
              ) : (
                /* Placeholder when no image uploaded */
                <div className="absolute inset-0 flex items-center justify-center">
                  <Quote className="w-24 h-24 text-white/10" />
                </div>
              )}
              {/* Gradient overlay for label readability */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70 pointer-events-none" />

              {/* Label at top */}
              <div className="absolute top-4 right-4 left-4 flex items-center justify-center gap-2">
                <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center gap-1.5">
                  <Quote className="w-4 h-4 text-emerald-300" />
                  <span className="text-xs font-bold text-white/90">سخن بزرگان</span>
                </div>
              </div>

              {/* Author at bottom */}
              <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                <div className="px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
                  <span className="text-sm font-bold text-emerald-300 tracking-wider">{quoteAuthor}</span>
                </div>
              </div>
            </div>
            
            {/* Quote text area */}
            <div className="p-6 flex-1 flex flex-col justify-center bg-gradient-to-b from-transparent to-black/20">
              <p className="text-base text-white/90 leading-loose italic font-medium text-center px-2">
                «{quoteText}»
              </p>
            </div>
          </div>

          {/* ── Quran Verse Widget (Refined Typography) ── */}
          <div className="p-6 rounded-3xl bg-emerald-950/20 border border-emerald-900/30 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-10 transform group-hover:scale-110 transition-transform duration-700">
              <BookOpen className="w-32 h-32 text-emerald-400" />
            </div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  📖
                </div>
                <span className="text-sm font-bold text-emerald-400/90">آیه برگزیده روز</span>
              </div>

              <div className="mb-4">
                <p className="text-lg text-emerald-100 leading-loose text-justify font-arabic" dir="rtl" style={{ fontFamily: "'Traditional Arabic', 'Scheherazade New', serif" }}>
                  ﴿ {currentVerse.ar} ﴾
                </p>
              </div>

              <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                <p className="text-sm text-white/70 leading-relaxed">
                  {currentVerse.fa}
                </p>
                <div className="mt-3 flex justify-end">
                  <span className="inline-block px-3 py-1 bg-white/5 rounded-lg text-[10px] text-white/40 font-medium">
                    {currentVerse.ref}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* ═══ Global Keyframes (flag waving, etc.) ═══ */}
      <style>{`
        @keyframes flagWave {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
        @keyframes flagFloat {
          0%, 100% { transform: perspective(600px) rotateY(-6deg) skewY(-1.5deg) translateY(0); }
          50%      { transform: perspective(600px) rotateY(6deg)  skewY(1.5deg)  translateY(-2px); }
        }
        @keyframes flagPoleShine {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// IRAN FLAG — Real photo with waving animation overlay
// ═══════════════════════════════════════════════════════════
function IranFlag({ className = "", src }: { className?: string; src?: string }) {
  return (
    <div className={`relative ${className}`} aria-label="پرچم جمهوری اسلامی ایران">
      <div
        className="relative overflow-hidden rounded-xl shadow-2xl border border-white/20"
        style={{
          aspectRatio: "16/9",
          animation: "flagFloat 4s ease-in-out infinite",
          transformOrigin: "left center",
        }}
      >
        {/* Real flag photo */}
        <img
          src={src || "/iran-flag.jpg"}
          alt="پرچم جمهوری اسلامی ایران"
          className="w-full h-full object-cover"
        />
        {/* Waving light streak overlay */}
        <div
          className="absolute inset-0 pointer-events-none mix-blend-overlay"
          style={{
            background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)",
            animation: "flagWave 3.5s ease-in-out infinite",
          }}
        />
        {/* Subtle vignette for depth */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)",
          }}
        />
      </div>
      {/* Golden glow behind flag */}
      <div
        className="absolute inset-0 -z-10 blur-2xl opacity-40 rounded-xl"
        style={{ background: "linear-gradient(135deg, #239f40, #ffffff, #da0000)" }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CALENDAR HELPERS
// ═══════════════════════════════════════════════════════════
function getJalaliMonthDays(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return jalaali.isLeapJalaaliYear(jy) ? 30 : 29;
}

function getFirstWeekdayOfMonth(jy: number, jm: number): number {
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, 1);
  return (new Date(gy, gm - 1, gd).getDay() + 1) % 7;
}
