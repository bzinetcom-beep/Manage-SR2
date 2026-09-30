import { getCurrentUser } from "@/lib/auth";
import { getSystemVersion } from "@/lib/updates";

export const dynamic = "force-dynamic";

/** Lightweight version probe used by the sidebar (any authenticated user). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "احراز هویت نشده" }, { status: 401 });
  const currentVersion = await getSystemVersion();
  return Response.json({ currentVersion });
}
