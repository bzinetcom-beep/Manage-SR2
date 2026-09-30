import { getCurrentUser, isAdmin } from "@/lib/auth";
import { parseUpdatePackage, applyUpdatePackage, getSystemVersion, UpdateError } from "@/lib/updates";

export const dynamic = "force-dynamic";

/**
 * Apply an update package. Accepts either:
 *  - multipart/form-data with a "file" field (.srms-update / .json)
 *  - a raw JSON body containing the package itself
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    return Response.json({ error: "فقط مدیر سیستم می‌تواند بروزرسانی اعمال کند" }, { status: 403 });
  }
  try {
    let raw = "";
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      const file = fd.get("file");
      if (!(file instanceof File)) {
        return Response.json({ error: "فایل بسته‌ی بروزرسانی ارسال نشده است" }, { status: 400 });
      }
      raw = await file.text();
    } else {
      raw = await req.text();
    }

    const pkg = parseUpdatePackage(raw);
    const update = await applyUpdatePackage(pkg, user);
    const currentVersion = await getSystemVersion();

    return Response.json({
      ok: true,
      update,
      changelog: pkg.changelog,
      version: pkg.version,
      currentVersion,
      message: `بروزرسانی به نسخه‌ی ${pkg.version} با موفقیت اعمال شد`,
    });
  } catch (e) {
    if (e instanceof UpdateError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    console.error("update apply error:", e);
    return Response.json({ error: "خطای داخلی در اعمال بروزرسانی" }, { status: 500 });
  }
}
