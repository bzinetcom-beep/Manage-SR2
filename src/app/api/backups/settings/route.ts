import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getBackupSettings, updateBackupSettings, resolveDir } from "@/lib/backup";
import fs from "node:fs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const data = await getBackupSettings();
  let writable = false;
  try {
    const dir = resolveDir(data.directory);
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }
  return Response.json({ data: { ...data, absolutePath: resolveDir(data.directory), writable } });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const body = (await req.json()) as {
    directory?: string;
    autoEnabled?: boolean;
    frequency?: string;
    timeOfDay?: string;
    dayOfWeek?: number;
    retentionCount?: number;
    includeAudit?: boolean;
  };
  try {
    const data = await updateBackupSettings({
      ...(body.directory !== undefined ? { directory: body.directory } : {}),
      ...(body.autoEnabled !== undefined ? { autoEnabled: Boolean(body.autoEnabled) } : {}),
      ...(body.frequency ? { frequency: body.frequency } : {}),
      ...(body.timeOfDay ? { timeOfDay: body.timeOfDay } : {}),
      ...(body.dayOfWeek !== undefined ? { dayOfWeek: Number(body.dayOfWeek) } : {}),
      ...(body.retentionCount !== undefined ? { retentionCount: Number(body.retentionCount) } : {}),
      ...(body.includeAudit !== undefined ? { includeAudit: Boolean(body.includeAudit) } : {}),
    });
    return Response.json({ data: { ...data, absolutePath: resolveDir(data.directory) } });
  } catch (e) {
    return Response.json({ error: `ذخیره تنظیمات ناموفق بود: ${(e as Error).message}` }, { status: 500 });
  }
}
