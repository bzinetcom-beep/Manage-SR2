import { db } from "@/db";
import { soldiers, serviceAdjustments, transfers } from "@/db/schema";
import { isNull, eq, and, or, ilike, inArray, gte, lte, count, sql } from "drizzle-orm";
import type { SessionUser } from "./auth";
import * as XLSX from "xlsx";

// ═══════════════════════════════════════════════════════════
// SECURITY: Strict Whitelist of Allowed Fields
// Only these fields can be queried. No SQL injection possible.
// ═══════════════════════════════════════════════════════════

export const ALLOWED_FILTER_FIELDS = {
  // Identity
  firstName: { type: "string", column: soldiers.firstName, label: "نام" },
  lastName: { type: "string", column: soldiers.lastName, label: "نام خانوادگی" },
  fatherName: { type: "string", column: soldiers.fatherName, label: "نام پدر" },
  nationalCode: { type: "string", column: soldiers.nationalCode, label: "کد ملی" },
  personnelCode: { type: "string", column: soldiers.personnelCode, label: "کد پرسنلی" },
  birthPlace: { type: "string", column: soldiers.birthPlace, label: "محل تولد" },
  city: { type: "string", column: soldiers.city, label: "شهر" },

  // Service
  serviceUnit: { type: "string", column: soldiers.serviceUnit, label: "رده خدمتی" },
  rank: { type: "string", column: soldiers.rank, label: "درجه" },
  membershipType: { type: "string", column: soldiers.membershipType, label: "نوع عضویت" },
  dutyType: { type: "string", column: soldiers.dutyType, label: "وظیفه" },
  recruitmentType: { type: "string", column: soldiers.recruitmentType, label: "نوع جذب" },
  maritalStatus: { type: "string", column: soldiers.maritalStatus, label: "وضعیت تاهل" },
  fileNumber: { type: "string", column: soldiers.fileNumber, label: "شماره پرونده" },

  // Education
  educationLevel: { type: "string", column: soldiers.educationLevel, label: "مدرک تحصیلی" },
  educationMajor: { type: "string", column: soldiers.educationMajor, label: "رشته تحصیلی" },

  // Physical
  bloodType: { type: "string", column: soldiers.bloodType, label: "گروه خون" },
  physicalStatus: { type: "string", column: soldiers.physicalStatus, label: "وضعیت جسمانی" },

  // Status
  separationType: { type: "string", column: soldiers.separationType, label: "نوع جدایی" },
  frontPresence: { type: "string", column: soldiers.frontPresence, label: "حضور در جبهه" },
} as const;

// Allowed aggregation group-by fields
export const ALLOWED_GROUP_FIELDS = [
  "serviceUnit", "city", "maritalStatus", "educationLevel",
  "rank", "membershipType", "bloodType", "physicalStatus",
  "separationType", "recruitmentType", "dutyType",
];

export type AIIntent = "query" | "count" | "aggregate" | "export" | "stats" | "unknown";
export type VisualizationType = "table" | "bar" | "pie" | "line" | "none";

export interface AIQueryRequest {
  intent: AIIntent;
  filters: Record<string, any>;
  groupBy?: string;
  visualization: VisualizationType;
  export: boolean;
  limit: number;
  message?: string;
}

export interface QueryResult {
  success: boolean;
  data?: any[];
  total?: number;
  error?: string;
  visualization?: VisualizationType;
  export?: boolean;
  intent?: AIIntent;
  groupBy?: string;
  message?: string;
}

// ═══════════════════════════════════════════════════════════
// LAYER 2: The Security & Interpreter Layer
// Validates AI JSON → Converts to safe Drizzle query
// ═══════════════════════════════════════════════════════════

/**
 * SECURITY: Validate and sanitize AI-generated query request.
 * - Whitelist all field names
 * - Block any non-read operations
 * - Enforce max result limit
 * - Validate value types
 */
export function validateAndSanitizeAIQuery(raw: any): AIQueryRequest {
  const result: AIQueryRequest = {
    intent: "query",
    filters: {},
    visualization: "table",
    export: false,
    limit: 100,
  };

  // Validate intent (READ-ONLY enforcement)
  if (["query", "count", "aggregate", "export", "stats"].includes(raw.intent)) {
    result.intent = raw.intent as AIIntent;
  } else {
    result.intent = "query"; // Default to safe query
  }

  // SECURITY: Block any write/delete/update intents
  if (raw.intent && ["delete", "update", "insert", "drop", "truncate", "alter"].includes(raw.intent.toLowerCase())) {
    throw new Error("عملیات نوشتن/حذف مجاز نیست. فقط خواندن مجاز است.");
  }

  // Validate and whitelist filters
  if (raw.filters && typeof raw.filters === "object") {
    for (const [key, value] of Object.entries(raw.filters)) {
      const fieldDef = ALLOWED_FILTER_FIELDS[key as keyof typeof ALLOWED_FILTER_FIELDS];
      if (!fieldDef) {
        console.warn(`[AI Security] Blocked unknown filter field: ${key}`);
        continue; // Skip unknown fields silently
      }
      // Sanitize value
      if (typeof value === "string") {
        result.filters[key] = value.substring(0, 200); // Max length
      } else if (typeof value === "number") {
        result.filters[key] = Math.abs(value); // No negative numbers
      } else if (Array.isArray(value)) {
        result.filters[key] = value.slice(0, 20).map((v: any) => String(v).substring(0, 100));
      }
    }
  }

  // Validate groupBy
  if (raw.groupBy && ALLOWED_GROUP_FIELDS.includes(raw.groupBy)) {
    result.groupBy = raw.groupBy;
  }

  // Validate visualization
  if (["table", "bar", "pie", "line", "none"].includes(raw.visualization)) {
    result.visualization = raw.visualization as VisualizationType;
  }

  // Export flag
  result.export = !!raw.export;

  // Enforce max limit (prevents DoS)
  result.limit = Math.min(Math.max(1, Number(raw.limit) || 50), 500);

  return result;
}

/**
 * Convert validated AI query to safe Drizzle execution.
 * NO raw SQL. All queries are parameterized and type-safe.
 */
export async function executeAIQuery(query: AIQueryRequest, user?: SessionUser | null): Promise<QueryResult> {
  try {
    // Build WHERE conditions from whitelisted filters
    const conditions: any[] = [isNull(soldiers.deletedAt)];

    for (const [key, value] of Object.entries(query.filters)) {
      const fieldDef = ALLOWED_FILTER_FIELDS[key as keyof typeof ALLOWED_FILTER_FIELDS];
      if (!fieldDef) continue;

      const col = fieldDef.column;

      if (typeof value === "string" && value) {
        conditions.push(ilike(col, `%${value}%`));
      } else if (Array.isArray(value) && value.length > 0) {
        conditions.push(inArray(col, value));
      }
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    // Handle different intents
    if (query.intent === "count") {
      const [{ count: total }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(soldiers)
        .where(whereClause as any);
      return {
        success: true,
        data: [{ total: Number(total) }],
        total: Number(total),
        visualization: query.visualization,
        export: query.export,
        intent: query.intent,
        message: `تعداد نتایج: ${Number(total).toLocaleString("fa-IR")} سرباز`,
      };
    }

    if (query.intent === "aggregate" && query.groupBy) {
      const fieldDef = ALLOWED_FILTER_FIELDS[query.groupBy as keyof typeof ALLOWED_FILTER_FIELDS];
      if (!fieldDef) {
        return { success: false, error: "فیلد گروه‌بندی نامعتبر است" };
      }
      const col = fieldDef.column;
      const results = await db
        .select({ value: col, count: sql<number>`count(*)` })
        .from(soldiers)
        .where(whereClause as any)
        .groupBy(col)
        .orderBy(sql`count(*) DESC`);

      const chartData = results
        .filter((r) => r.value)
        .map((r) => ({ label: r.value as string, value: Number(r.count) }));

      return {
        success: true,
        data: chartData,
        total: chartData.reduce((a, d) => a + d.value, 0),
        visualization: query.visualization || "bar",
        export: query.export,
        intent: query.intent,
        groupBy: query.groupBy,
        message: `توزیع بر اساس ${fieldDef.label}`,
      };
    }

    // Default: query soldiers
    const rows = await db
      .select()
      .from(soldiers)
      .where(whereClause as any)
      .orderBy(soldiers.id)
      .limit(query.limit);

    return {
      success: true,
      data: rows,
      total: rows.length,
      visualization: query.visualization,
      export: query.export,
      intent: query.intent,
      message: `${rows.length.toLocaleString("fa-IR")} سرباز یافت شد`,
    };
  } catch (error: any) {
    console.error("[AI Interpreter Error]", error);
    return {
      success: false,
      error: error.message || "خطا در اجرای پرس‌وجو",
      visualization: query.visualization,
      export: query.export,
      intent: query.intent,
    };
  }
}

/**
 * Generate Excel file from query results with Persian headers.
 */
export function generateExcelFromResult(result: QueryResult): Buffer {
  if (!result.data || result.data.length === 0) {
    throw new Error("داده‌ای برای خروجی وجود ندارد");
  }

  const rows = result.data;
  const excelData: any[] = [];

  // For aggregate data
  if (result.intent === "aggregate" && result.groupBy) {
    const fieldDef = ALLOWED_FILTER_FIELDS[result.groupBy as keyof typeof ALLOWED_FILTER_FIELDS];
    excelData.push({ [fieldDef?.label || "دسته"]: "", "تعداد": "" });
    for (const row of rows) {
      excelData.push({
        [fieldDef?.label || "دسته"]: row.label,
        "تعداد": row.value,
      });
    }
  } else if (result.intent === "count") {
    excelData.push({ "تعداد کل": rows[0]?.total || 0 });
  } else {
    // Full soldier data
    excelData.push({
      "ردیف": "", "نام": "", "نام خانوادگی": "", "کد ملی": "",
      "کد پرسنلی": "", "درجه": "", "رده خدمتی": "", "شهر": "",
      "وضعیت تاهل": "", "مدرک تحصیلی": "", "تاریخ اعزام": "",
      "تاریخ پایان خدمت": "", "وضعیت جسمانی": "", "گروه خون": "",
    });
    rows.forEach((soldier: any, i: number) => {
      excelData.push({
        "ردیف": i + 1,
        "نام": soldier.firstName || "",
        "نام خانوادگی": soldier.lastName || "",
        "کد ملی": soldier.nationalCode || "",
        "کد پرسنلی": soldier.personnelCode || "",
        "درجه": soldier.rank || "",
        "رده خدمتی": soldier.serviceUnit || "",
        "شهر": soldier.city || "",
        "وضعیت تاهل": soldier.maritalStatus || "",
        "مدرک تحصیلی": soldier.educationLevel || "",
        "تاریخ اعزام": soldier.dispatchDate || "",
        "تاریخ پایان خدمت": soldier.serviceEndDate || "",
        "وضعیت جسمانی": soldier.physicalStatus || "",
        "گروه خون": soldier.bloodType || "",
      });
    });
  }

  const ws = XLSX.utils.json_to_sheet(excelData, { skipHeader: result.intent !== "query" });
  ws["!cols"] = Array(excelData[0] ? Object.keys(excelData[0]).length : 10).fill({ wch: 20 });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "نتایج هوش مصنوعی");

  const arr: number[] = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return Buffer.from(arr);
}
