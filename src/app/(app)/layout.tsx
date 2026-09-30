import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import ChatbotProvider from "@/components/ChatbotProvider";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
      <Sidebar user={{ fullName: user.fullName, role: user.role }} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
      <ChatbotProvider />
    </div>
  );
}
