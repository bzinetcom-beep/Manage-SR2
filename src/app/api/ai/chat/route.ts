import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { validateAndSanitizeAIQuery, executeAIQuery, generateExcelFromResult } from "@/lib/ai-interpreter";
import { parsePersianQuery, generateResponseMessage } from "@/lib/offline-nlp";
import { parseAdvancedQuery, executeAdvancedQuery } from "@/lib/advanced-nlp";

// ═══════════════════════════════════════════════════════════
// HYBRID AI CHAT API: Offline-first with optional OpenAI
// Priority: 1) OpenAI (if key exists)  2) Offline NLP (always)
// ═══════════════════════════════════════════════════════════

// API key from env or stored in memory
const getOpenAIKey = () => process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "";
const USE_OPENAI = () => {
  const key = getOpenAIKey();
  return key && key.length > 10 && key !== "your-openai-api-key-here" && key !== "sk-test-placeholder-key-for-development" && !key.includes("placeholder");
};

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Security: Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "احراز هویت نشده" }, { status: 401 });
    }

    const body = await req.json();
    const { message } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "پیام نامعتبر است" }, { status: 400 });
    }

    // RBAC: Only admin and operator can use AI chat
    if (!canWrite(user.role)) {
      return NextResponse.json({
        error: "دسترسی غیرمجاز. فقط مدیران و کاربران ثبت مجاز هستند.",
      }, { status: 403 });
    }

    // Rate limiting
    if (message.length > 500) {
      return NextResponse.json({ error: "پیام نباید بیش از ۵۰۰ کاراکتر باشد" }, { status: 400 });
    }

    // ═══════════════════════════════════════════════════════════
    // LAYER 0: Advanced fine-grained parser (deterministic, offline)
    // Handles precise questions the keyword parser cannot:
    //   «تاریخ پایان خدمت احمد کاظمی کیه؟»
    //   «تعداد فرزندان صادق صالحی چندتاست؟»
    //   «لیست سربازانی که انتقال در رده خدمتی داشته‌اند»
    // It only claims a sentence when it is confident, otherwise we fall
    // through to OpenAI / the generic engine exactly as before.
    // ═══════════════════════════════════════════════════════════
    const advanced = parseAdvancedQuery(message);
    if (advanced) {
      try {
        const result = await executeAdvancedQuery(advanced);

        await logAudit({
          entity: "ai_chat",
          action: "query",
          user,
          changes: {
            intent: advanced.kind,
            attribute: advanced.attribute ?? null,
            relation: advanced.relation ?? null,
            person: advanced.personName ?? null,
            resultCount: result.total ?? 0,
            aiSource: "advanced-nlp",
          },
        });

        return NextResponse.json({
          success: result.success,
          data: result.data ?? [],
          total: result.total ?? 0,
          message: result.answer,
          understood: true,
          // A single-person answer is a statement, not a table.
          visualization: advanced.kind === "fact" ? "none" : "table",
          intent: advanced.kind,
          answerKind: advanced.kind,
          candidates: result.candidates,
          aiSource: "advanced-nlp",
        });
      } catch (advancedError) {
        // Never let the advanced layer break the chat — fall through.
        console.warn("[Advanced NLP fallback]", advancedError);
      }
    }

    let parsedQuery: any;

    // ── LAYER 1: Try OpenAI first (if key available), fallback to Offline NLP ──
    if (USE_OPENAI()) {
      try {
        const { default: OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey: getOpenAIKey() });

        const SYSTEM_PROMPT = `You are an AI assistant for a Military Personnel Management System. Convert Persian queries to structured JSON ONLY.

Available Fields: firstName, lastName, nationalCode, personnelCode, city, serviceUnit, rank, membershipType, dutyType, recruitmentType, maritalStatus, educationLevel, educationMajor, bloodType, physicalStatus, separationType, frontPresence, fatherName, birthPlace, fileNumber

Intent: query | count | aggregate | export | stats
Visualization: table | bar | pie | line | none
GroupBy: serviceUnit, city, maritalStatus, educationLevel, rank, membershipType, bloodType, physicalStatus, separationType, recruitmentType, dutyType

Examples:
"سربازان متاهل" → {"intent":"query","filters":{"maritalStatus":"متاهل"},"visualization":"table","export":false,"limit":50}
"تعداد سربازان تهران" → {"intent":"count","filters":{"city":"تهران"},"visualization":"none","export":false,"limit":1}
"توزیع بر اساس رده خدمتی در نمودار دایره‌ای" → {"intent":"aggregate","filters":{},"groupBy":"serviceUnit","visualization":"pie","export":false,"limit":1}

Return ONLY JSON. No other text.`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: message },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 500,
        });

        const content = completion.choices[0]?.message?.content;
        if (content) {
          parsedQuery = JSON.parse(content);
          parsedQuery._source = "openai";
        }
      } catch (openaiError: any) {
        console.warn("[OpenAI Fallback]", openaiError.message);
        // Silently fall through to offline NLP
      }
    }

    // ── Fallback: Offline Persian NLP Engine ──
    if (!parsedQuery) {
      parsedQuery = parsePersianQuery(message);
      parsedQuery._source = "offline-nlp";
    }

    // ── If query is not understood, return early ──
    if (!parsedQuery.understood) {
      const responseMessage = generateResponseMessage(parsedQuery, 0);
      return NextResponse.json({
        success: true,
        data: [],
        total: 0,
        message: responseMessage,
        understood: false,
        aiSource: parsedQuery._source || "offline",
      });
    }

    // ── LAYER 2: Security & Interpreter ──
    let validatedQuery;
    try {
      validatedQuery = validateAndSanitizeAIQuery(parsedQuery);
    } catch (securityError: any) {
      await logAudit({
        entity: "ai_chat",
        action: "blocked",
        user,
        changes: { query: parsedQuery, reason: securityError.message },
      });

      return NextResponse.json({
        success: false,
        error: securityError.message,
      }, { status: 403 });
    }

    // Execute the safe query
    const result = await executeAIQuery(validatedQuery, user);

    // Generate friendly Persian response
    const responseMessage = generateResponseMessage(
      parsedQuery,
      result.total || result.data?.length || 0,
      validatedQuery.groupBy
    );

    // Log
    await logAudit({
      entity: "ai_chat",
      action: "query",
      user,
      changes: {
        intent: validatedQuery.intent,
        filters: validatedQuery.filters,
        resultCount: result.total,
        aiSource: parsedQuery._source || "offline",
        understood: parsedQuery.understood,
      },
    });

    // ── LAYER 3: Response ──
    if (validatedQuery.export && result.success && result.data) {
      try {
        const buffer = generateExcelFromResult(result);
        return NextResponse.json({
          ...result,
          message: responseMessage,
          excelReady: true,
          excelFileName: `srms-ai-export-${Date.now()}.xlsx`,
          aiSource: parsedQuery._source || "offline",
        });
      } catch {
        return NextResponse.json({
          ...result,
          message: responseMessage,
          excelError: "خطا در تولید اکسل",
          aiSource: parsedQuery._source || "offline",
        });
      }
    }

    return NextResponse.json({
      ...result,
      message: responseMessage,
      aiSource: parsedQuery._source || "offline",
    });

  } catch (error: any) {
    console.error("[AI Chat API Error]", error);
    return NextResponse.json(
      { success: false, error: "خطای داخلی سرور" },
      { status: 500 }
    );
  }
}
