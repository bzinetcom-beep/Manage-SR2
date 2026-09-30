import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ensureBuiltinTemplates } from "@/lib/letter-templates-service";
import LettersWorkspace from "@/components/letters/LettersWorkspace";

export const dynamic = "force-dynamic";

export default async function LettersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await ensureBuiltinTemplates();
  return <LettersWorkspace role={user.role} />;
}
