import { getCurrentUser, isAdmin } from "@/lib/auth";
import { finalizePendingSystemUpdate, listSnapshots, readStatus } from "@/lib/system-package";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** وضعیت آخرین نصب/بازگشت + فهرست نسخه‌های پشتیبان قابل بازگشت */
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const status = (await finalizePendingSystemUpdate()) ?? readStatus();
  return Response.json({ status, snapshots: listSnapshots().slice(0, 10) });
}
