import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, canWrite } from "@/lib/auth";

// Store API key in memory (per-session)
// In production, use a proper key management system
let storedApiKey: string | null = null;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canWrite(user.role)) {
      return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
    }

    const body = await req.json();
    const { openaiKey } = body;

    if (!openaiKey || typeof openaiKey !== "string" || openaiKey.length < 10) {
      return NextResponse.json({ error: "کلید نامعتبر است" }, { status: 400 });
    }

    // Store the key in memory
    storedApiKey = openaiKey.trim();

    // Also set the environment variable for the current process
    process.env.OPENAI_API_KEY = storedApiKey;

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !canWrite(user.role)) {
      return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
    }

    return NextResponse.json({
      hasKey: !!(storedApiKey || process.env.OPENAI_API_KEY),
      keyLength: (storedApiKey || process.env.OPENAI_API_KEY || "").length,
      source: storedApiKey ? "user-provided" : process.env.OPENAI_API_KEY ? "env-variable" : "none",
    });
  } catch {
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}
