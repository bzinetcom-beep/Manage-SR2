import { getCurrentUser, canWrite, isAdmin } from "@/lib/auth";
import { createBackup, listBackups, ensureBackupTables } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  await ensureBackupTables();
  const data = await listBackups();
  return Response.json({ data });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  await ensureBackupTables();
  let kind: "manual" | "pre_update" = "manual";
  try {
    const body = (await req.json()) as { kind?: string };
    if (body?.kind === "pre_update") kind = "pre_update";
  } catch {
    /* body اختیاری است */
  }
  try {
    const res = await createBackup({ kind, user });
    return Response.json({ data: res }, { status: 201 });
  } catch (e) {
    return Response.json({ error: `تهیه نسخه پشتیبان ناموفق بود: ${(e as Error).message}` }, { status: 500 });
  }
}
