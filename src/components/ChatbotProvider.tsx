"use client";

import dynamic from "next/dynamic";

const Chatbot = dynamic(() => import("@/components/Chatbot/ChatWindow"), {
  ssr: false,
  loading: () => null,
});

export default function ChatbotProvider() {
  return <Chatbot />;
}
