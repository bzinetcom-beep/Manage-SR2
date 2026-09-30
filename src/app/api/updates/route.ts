import { getCurrentUser, isAdmin } from "@/lib/auth";
import { listUpdates, getSystemVersion, getBaseVersion } from "@/lib/updates";

export const dynamic = "force-dynamic";

/** Full update history + version info (admin only). */
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }
  const [updates, currentVersion, baseVersion] = await Promise.all([
    listUpdates(),
    getSystemVersion(),
    getBaseVersion(),
  ]);
  return Response.json({ currentVersion, baseVersion, updates });
}
