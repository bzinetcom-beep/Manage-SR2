"use client";

import { useState, useRef, useEffect } from "react";
import ChatResponseRenderer from "./ChatResponseRenderer";
import { Bot, Send, X, Zap, Loader2, MessageSquare, ChevronDown, Settings } from "lucide-react";

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

const SUGGESTIONS = [
  "سربازان متاهل را نشان بده",
  "تعداد سربازان شهر تهران",
  "توزیع سربازان بر اساس رده خدمتی در نمودار دایره‌ای",
  "سربازان با مدرک کارشناسی",
  "توزیع گروه خونی در نمودار میله‌ای",
  "سربازان مجرد شهر اصفهان",
];

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "سلام! 👋 من دستیار هوشمند سامانه هستم. می‌توانید به زبان فارسی از من سوال بپرسید.\n\n🔎 پرسش درباره یک نفر:\n• تاریخ پایان خدمت احمد کاظمی کیه؟\n• تعداد فرزندان صادق صالحی چندتاست؟\n• کد ملی رضا محمدی چیه؟\n• چند روز از خدمت علی رضایی مانده؟\n\n📋 پرسش‌های گروهی:\n• لیست سربازانی که انتقال در رده خدمتی داشته‌اند\n• سربازانی که کسری خدمت گرفته‌اند\n• سربازانی که بیش از ۲ فرزند دارند\n• سربازانی که تا ۶۰ روز دیگر پایان خدمتشان است\n\n📊 آمار:\n• تعداد سربازان شهر تهران\n• توزیع سربازان بر اساس رده خدمتی",
      success: true,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && !collapsed) {
      inputRef.current?.focus();
    }
  }, [open, collapsed]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setCollapsed(false);

    try {
      const history = messages
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
      });

      const data = await res.json();

      if (data.fallbackMessage) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.fallbackMessage, success: false, error: data.error },
        ]);
      } else if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.message || "نتایج یافت شد",
            data: data.data,
            visualization: data.visualization,
            export: data.export,
            success: true,
            total: data.total,
            groupBy: data.groupBy,
            answerKind: data.answerKind,
            excelReady: data.excelReady,
            excelFileName: data.excelFileName,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "خطا در پردازش", success: false, error: data.error },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "خطای ارتباط با سرور", success: false, error: "خطای شبکه" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function saveApiKey() {
    if (!apiKey.trim()) return;
    try {
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiKey: apiKey.trim() }),
      });
      if (res.ok) {
        setApiKeySaved(true);
        setTimeout(() => setApiKeySaved(false), 3000);
      }
    } catch (e) { console.error(e); }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-50 bg-gradient-to-l from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white w-14 h-14 rounded-2xl shadow-2xl shadow-emerald-500/30 flex items-center justify-center transition-all hover:scale-110"
        title="دستیار آفلاین"
      >
        <Bot size={24} />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-pulse" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 left-6 z-50 w-[420px] max-w-[calc(100vw-2rem)]">
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col" style={{ height: collapsed ? 60 : 580 }}>

        {/* Header */}
        <div className="bg-gradient-to-l from-emerald-600 to-emerald-700 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Bot size={18} />
            </div>
            <div>
              <div className="text-sm font-bold">دستیار هوشمند</div>
              <div className="text-[10px] text-white/60 flex items-center gap-1">
                <Zap size={10} /> هوشمند
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 hover:bg-white/10 rounded-lg transition" title="تنظیمات">
              <Settings size={14} />
            </button>
            <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 hover:bg-white/10 rounded-lg transition" title={collapsed ? "باز کردن" : "جمع کردن"}>
              <ChevronDown size={16} className={`transition-transform ${collapsed ? "" : "rotate-180"}`} />
            </button>
            <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition" title="بستن">
              <X size={16} />
            </button>
          </div>
        </div>

        {!collapsed && (
          <>
            
            {/* Settings Panel */}
            {showSettings && (
              <div className="p-4 border-b border-slate-200 bg-slate-50/50" dir="rtl">
                <div className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
                  <Settings size={12} /> تنظیمات API کلید
                </div>
                <div className="text-[10px] text-slate-400 mb-2">
                  برای استفاده از هوش مصنوعی پیشرفته (OpenAI)، کلید API خود را وارد کنید.
                  <br />
                  بدون کلید، موتور آفلاین داخلی استفاده می‌شود.
                </div>
                <div className="flex gap-2">
                  <input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-emerald-400"
                    type="password"
                  />
                  <button
                    onClick={saveApiKey}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg px-3 py-1.5"
                  >
                    ذخیره
                  </button>
                </div>
                {apiKeySaved && (
                  <div className="text-[10px] text-emerald-600 mt-1">✓ کلید ذخیره شد</div>
                )}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50" dir="rtl">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-emerald-600 text-white rounded-tr-sm"
                      : "bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm"
                  }`}>
                    {msg.content}
                    {msg.role === "assistant" && msg.success && msg.data && (
                      <div className="mt-2 -mx-1">
                        <ChatResponseRenderer message={msg} />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Loading */}
              {loading && (
                <div className="flex justify-end">
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <Loader2 size={16} className="animate-spin" />
                      <span>در حال تحلیل...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions */}
            {messages.length <= 1 && (
              <div className="px-4 pb-2" dir="rtl">
                <div className="text-[10px] text-slate-400 mb-1.5 flex items-center gap-1">
                  <MessageSquare size={10} /> پیشنهادات:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] rounded-full px-3 py-1.5 transition border border-emerald-200"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200 bg-white shrink-0" dir="rtl">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="سوال خود را به فارسی بنویسید..."
                  className="flex-1 bg-slate-50 border border-slate-200 focus:border-emerald-400 rounded-xl px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white p-2.5 rounded-xl transition"
                >
                  <Send size={16} />
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
