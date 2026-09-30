import { getCurrentUser } from "@/lib/auth";
import { readSamplePackage, SAMPLE_UPDATE_PATH } from "@/lib/updates";

export const dynamic = "force-dynamic";

/** Download the sample/template update package shipped with the repo. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "احراز هویت نشده" }, { status: 401 });
  const content = readSamplePackage();
  if (content === null) {
    return Response.json({ error: "فایل نمونه در سرور یافت نشد" }, { status: 404 });
  }
  const fileName = SAMPLE_UPDATE_PATH.split("/").pop() || "sample.srms-update";
  return new Response(content, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
