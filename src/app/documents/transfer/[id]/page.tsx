import { db } from "@/db";
import { transfers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSoldier } from "@/lib/soldier-service";
import { notFound } from "next/navigation";
import {
  v,
  DocPage,
  Bismillah,
  DocHeader,
  DocStamp,
  SectionTitle,
  Field,
  Proclamation,
  Declaration,
  Signatures,
  DocFooter,
} from "@/lib/doc-utils";
import { isoToJalali, toFaDigits, todayJalali } from "@/lib/jalali";
import { normalizeTransferType, isMission } from "@/lib/transfer-info";

export const dynamic = "force-dynamic";

export default async function TransferDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(transfers).where(eq(transfers.id, Number(id))).limit(1);
  const t = rows[0];
  if (!t) notFound();
  const s = await getSoldier(t.soldierId);
  if (!s) notFound();

  const fa = (x: string | null) => (x ? toFaDigits(x) : "");
  const faDate = (x: string | null) => (x ? toFaDigits(isoToJalali(x)) : "");

  const kind = normalizeTransferType(t.transferType);
  const mission = isMission(t.transferType);
  const fullName = [v(s, "firstName"), v(s, "lastName")].filter(Boolean).join(" ");
  const nationalCode = v(s, "nationalCode") || "نامشخص";
  const fname = `${nationalCode}-حکم انتقال`;

  return (
    <DocPage filename={fname} formLabel="حکم انتقال">
      <Bismillah />

      <DocHeader
        code="سپاه پاسداران انقلاب اسلامی — حکم انتقال"
        doctype="حکم انتقال رده خدمتی"
        subtitle="سند رسمی جابجایی سرباز بین یگان‌ها"
        formNo={kind}
        leftItems={[
          { label: "شماره", value: fa(t.documentNumber) },
          { label: "تاریخ", value: faDate(t.transferDate) || todayJalali() },
        ]}
        rightItems={[
          { label: "وضعیت", value: fa(t.status) || "پیش‌نویس" },
          { label: "صفحه", value: "۱ از ۱" },
        ]}
      />

      <DocStamp
        cols={4}
        items={[
          { label: "نام و نام خانوادگی", value: fullName },
          { label: "کد ملی", value: v(s, "nationalCode") },
          { label: "شماره پرسنلی", value: v(s, "personnelCode") },
          { label: "درجه", value: v(s, "rank") },
        ]}
      />

      <SectionTitle title="متن حکم" />
      <Proclamation>
        <p style={{ margin: 0 }}>
          بدین‌وسیله انتقال سرباز وظیفه <b>{fullName}</b> فرزند <b>{v(s, "fatherName")}</b>،
          از رده خدمتی <b>«{fa(t.fromServiceUnit) || v(s, "serviceUnit")}»</b>
          {" "}به رده خدمتی <b>«{fa(t.toServiceUnit) || "—"}»</b>،
          مطابق با مقررات جاری سپاه پاسداران انقلاب اسلامی اعلام می‌گردد.
        </p>
        {mission ? (
          <p style={{ margin: "2mm 0 0" }}>
            نوع انتقال: <b>مامور</b> — سرباز مذکور به‌صورت <b>موقت</b> از تاریخ معرفی{" "}
            <b>{faDate(t.missionStartDate)}</b> تا پایان ماموریت در تاریخ <b>{faDate(t.missionEndDate)}</b>{" "}
            در رده‌ی مقصد مشغول خدمت خواهد بود و پس از پایان مدت ماموریت، مجدداً به رده‌ی جدیدی منتقل می‌شود.
          </p>
        ) : (
          <p style={{ margin: "2mm 0 0" }}>
            نوع انتقال: <b>انتقال دائم</b> — سرباز مذکور به‌صورت <b>دائم</b> در رده‌ی خدمتی مقصد مشغول خدمت خواهد شد.
          </p>
        )}
        <p style={{ margin: "2mm 0 0" }}>
          مقرر گردید یگان‌های مبدأ و مقصد نسبت به تکمیل فرایند انتقال و تسویه‌حساب سرباز،
          همچنین ارسال سوابق خدمتی به واحد منابع انسانی و کارگزینی حداکثر ظرف مدت <b>۱۰ روز</b> اقدام لازم معمول دارند.
        </p>
      </Proclamation>

      <SectionTitle title="مشخصات انتقال" />
      <div className="f-grid f-grid--c3">
        <Field label="از رده خدمتی (مبدأ)" value={fa(t.fromServiceUnit) || v(s, "serviceUnit")} />
        <Field label="به رده خدمتی (مقصد)" value={fa(t.toServiceUnit)} />
        <Field label="تاریخ انتقال" value={faDate(t.transferDate)} />
        <Field label="تاریخ اعزام" value={v(s, "dispatchDate")} />
        <Field label="تاریخ شروع خدمت" value={v(s, "serviceStartDate")} />
        <Field label="تاریخ پایان خدمت" value={v(s, "serviceEndDate")} />
      </div>

      <SectionTitle title="علت و توضیحات" />
      <div className="f-grid f-grid--c2">
        <Field label="علت انتقال" value={fa(t.transferReason)} />
        <Field label="نوع انتقال" value={kind} />
      </div>
      {mission && (
        <div className="f-grid f-grid--c3">
          <Field label="تاریخ معرفی" value={faDate(t.missionStartDate)} />
          <Field label="تاریخ پایان ماموریت" value={faDate(t.missionEndDate)} />
          <Field label="وضعیت پس از ماموریت" value="انتقال به رده‌ی جدید" />
        </div>
      )}
      <div className="f-grid f-grid--c1">
        <Field label="توضیحات تکمیلی" value={fa(t.description)} />
      </div>

      <SectionTitle title="صادرکننده و تأییدها" />
      <div className="f-grid f-grid--c3">
        <Field label="نام صادرکننده" value={fa(t.issuerName)} />
        <Field label="سمت صادرکننده" value={fa(t.issuerRole)} />
        <Field label="تأییدکننده" value={fa(t.approvedBy)} />
      </div>

      <Declaration title="تذکر مهم">
        <>
          این حکم صرفاً پس از <b>مهر و امضای فرمانده یگان صادرکننده</b> و
          {" "}<b>تأیید یگان‌های مبدأ و مقصد</b> اعتبار قانونی دارد.
          هرگونه کپی‌برداری و رونوشت بدون مهر رسمی یگان، فاقد ارزش اداری می‌باشد.
        </>
      </Declaration>

      <Signatures
        cols={3}
        items={[
          { title: "امضای صادرکننده", sub: fa(t.issuerName) || "نام و نام خانوادگی" },
          { title: "تأیید فرمانده مبدأ", sub: "مهر و امضا" },
          { title: "تأیید فرمانده مقصد", sub: "مهر و امضا" },
        ]}
      />

      <DocFooter left="حکم انتقال رده خدمتی — SRMS7" right="رونوشت: بایگانی پرسنلی" />
    </DocPage>
  );
}
