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
  LongField,
  Declaration,
  Signatures,
  DocFooter,
} from "@/lib/doc-utils";
import { todayJalali } from "@/lib/jalali";

export const dynamic = "force-dynamic";

const CLEARANCE_UNITS = [
  "مدیریت منابع سرباز",
  "مسئول رده",
  "مهارت آموزی",
  "گردان قرارگاه",
  "دفتر خانه فرماندهی",
  "بخش حقوقی / مرکز عملیات حقوق",
  "معاونت آموزش",
  "عقیدتی",
  "خدمات درمانی نیروهای مسلح",
  "آماد و پشتیبانی",
  "قضایی و انضباطی",
  "حفاظت اطلاعات",
];

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSoldier(Number(id));
  if (!s) notFound();

  const fullName = [v(s, "firstName"), v(s, "lastName")].filter(Boolean).join(" ");

  return (
    <DocPage
      filename={`${v(s, "nationalCode") || "نامشخص"}-فرم تسویه حساب`}
      formLabel="فرم تسویه حساب"
    >
      <Bismillah />

      <DocHeader
        code="جمهوری اسلامی ایران — سپاه پاسداران انقلاب اسلامی"
        doctype="فرم تسویه‌حساب پایان خدمت"
        subtitle="تأییدیه تسویه سرباز وظیفه از یگان‌های مربوطه"
        formNo="فرم شماره ۳"
        leftItems={[
          { label: "شماره نامه", value: v(s, "settlementNumber") || v(s, "fileNumber") },
          { label: "تاریخ", value: todayJalali() },
        ]}
        rightItems={[
          { label: "پیوست", value: v(s, "attachmentRef") || "ندارد" },
          { label: "صفحه", value: "۱ از ۱" },
        ]}
      />

      <DocStamp
        cols={4}
        items={[
          { label: "ارجحیت", value: v(s, "priority") || "عادی" },
          { label: "طبقه‌بندی", value: v(s, "classification") || "عادی" },
          { label: "وضعیت", value: "در جریان" },
          { label: "علت تسویه", value: v(s, "settlementReason") || v(s, "separationType") || "پایان دوره" },
        ]}
      />

      <SectionTitle title="مشخصات سرباز وظیفه" />
      <div className="f-grid f-grid--c3">
        <Field label="نام و نام خانوادگی" value={fullName} />
        <Field label="نام پدر" value={v(s, "fatherName")} />
        <Field label="شماره ملی" value={v(s, "nationalCode")} />
        <Field label="شماره پرسنلی" value={v(s, "personnelCode")} />
        <Field label="تاریخ شروع خدمت" value={v(s, "serviceStartDate")} />
        <Field label="تاریخ پایان خدمت" value={v(s, "serviceEndDate")} />
        <Field label="مدت خدمت انجام شده" value={v(s, "completedServiceDuration")} />
        <Field label="رده خدمتی" value={v(s, "serviceUnit")} />
        <Field label="نوع عضویت" value={v(s, "membershipType")} />
      </div>
      <LongField label="توضیحات" value={v(s, "notes")} />

      <SectionTitle title="تأیید رده‌ها" hint="مهر و امضای مسئول هر واحد الزامی است" />

      {/* ═══ جدول دو ستونه فشرده با فضای امضای کافی ═══ */}
      <div className="f-clear-grid">
        {CLEARANCE_UNITS.map((unit, i) => (
          <div key={unit} className="f-clear-cell">
            <div className="f-clear-cell__head">
              <span className="f-clear-cell__num">{i + 1}</span>
              <span className="f-clear-cell__name">{unit}</span>
              <span className="f-clear-cell__check">
                <span className="f-clear-box">☐</span>
                <span className="f-clear-box-label">تسویه</span>
              </span>
            </div>
            <div className="f-clear-cell__sign">
              <div className="f-clear-cell__sign-labels">
                <span>مهر و امضا</span>
                <span>تاریخ</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="f-clear-note">
        رده‌های فوق‌الذکر پس از بررسی دقیق و دریافت رسید وسایل، اوراق، کارت‌های شناسایی، البسه و تجهیزات تحویلی از سرباز، مراتب تسویه حساب را گواهی می‌نمایند.
        در صورت مشاهده هرگونه نقص مدرک، بدهی یا تعهد باقی‌مانده، فرم تسویه فاقد اعتبار قانونی خواهد بود.
      </div>

      <SectionTitle title="تعهدنامه سرباز" />
      <Declaration title="متن تعهد">
        <>
          اینجانب <span className="f-blank">{fullName}</span> فرزند{" "}
          <span className="f-blank">{v(s, "fatherName")}</span>،
          به شماره ملی <span className="f-blank">{v(s, "nationalCode")}</span>،
          کلیه وسایل، اوراق، کارت‌های شناسایی، البسه و تجهیزاتی را که در طول دوران خدمت وظیفه از یگان‌های مربوطه دریافت نموده‌ام،
          به مراکز ذی‌ربط تحویل داده و هیچ‌گونه بدهی و تعهدی نسبت به سپاه پاسداران انقلاب اسلامی ندارم.
          در صورت اثبات خلاف این مطلب، سپاه مجاز به اخذ تصمیم مقتضی طبق قوانین و مقررات جاری کشور می‌باشد.
        </>
      </Declaration>

      <div className="settlement-signatures">
        <Signatures
          cols={3}
          items={[
            { title: "امضا و اثر انگشت سرباز", sub: fullName || "نام و نام خانوادگی" },
            { title: "مسئول کارگزینی", sub: "مهر و امضا" },
            { title: "فرمانده یگان", sub: "مهر و امضا" },
          ]}
        />
      </div>

      <DocFooter left="فرم تسویه‌حساب پایان خدمت — SRMS7" right="فرم دولتی — بایگانی در پرونده پرسنلی" />
    </DocPage>
  );
}
