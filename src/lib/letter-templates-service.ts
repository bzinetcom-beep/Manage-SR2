import { db } from "@/db";
import { letterTemplates } from "@/db/schema";
import { BUILTIN_TEMPLATES } from "@/lib/builtin-letter-templates";
import { eq, sql } from "drizzle-orm";

let seeded = false;

/** درج یک‌باره‌ی قالب‌های آماده در پایگاه داده (idempotent) */
export async function ensureBuiltinTemplates(): Promise<void> {
  if (seeded) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS letter_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'عمومی',
        description TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT '',
        header_html TEXT NOT NULL DEFAULT '',
        body_html TEXT NOT NULL DEFAULT '',
        footer_html TEXT NOT NULL DEFAULT '',
        page_size TEXT NOT NULL DEFAULT 'A4',
        source TEXT NOT NULL DEFAULT 'custom',
        builtin_key TEXT,
        params JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT true,
        usage_count INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER,
        created_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS letter_batches (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        template_id INTEGER,
        template_name TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'selection',
        params JSONB NOT NULL DEFAULT '{}'::jsonb,
        total INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER,
        created_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS letters (
        id SERIAL PRIMARY KEY,
        batch_id INTEGER,
        template_id INTEGER,
        template_name TEXT NOT NULL DEFAULT '',
        soldier_id INTEGER,
        soldier_name TEXT NOT NULL DEFAULT '',
        national_code TEXT,
        service_unit TEXT,
        subject TEXT NOT NULL DEFAULT '',
        letter_number TEXT,
        letter_date TEXT,
        body_html TEXT NOT NULL DEFAULT '',
        page_size TEXT NOT NULL DEFAULT 'A4',
        status TEXT NOT NULL DEFAULT 'generated',
        created_by INTEGER,
        created_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS letters_batch_idx ON letters (batch_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS letters_soldier_idx ON letters (soldier_id);`);

    for (const t of BUILTIN_TEMPLATES) {
      const existing = await db
        .select({ id: letterTemplates.id })
        .from(letterTemplates)
        .where(eq(letterTemplates.builtinKey, t.builtinKey))
        .limit(1);
      if (existing.length) continue;
      await db.insert(letterTemplates).values({
        name: t.name,
        category: t.category,
        description: t.description,
        subject: t.subject,
        headerHtml: t.headerHtml,
        bodyHtml: t.bodyHtml,
        footerHtml: t.footerHtml,
        pageSize: t.pageSize,
        source: "builtin",
        builtinKey: t.builtinKey,
        params: t.params,
        createdByName: "سیستم",
      });
    }
    seeded = true;
  } catch (err) {
    console.error("ensureBuiltinTemplates error:", err);
  }
}
