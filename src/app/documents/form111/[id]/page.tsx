import { getSoldier } from "@/lib/soldier-service";
import { notFound } from "next/navigation";
import {
  v,
  DocPage,
  Bismillah,
  SectionTitle,
  Field,
  LongField,
  VerifyRow,
  Signatures,
  DocFooter,
} from "@/lib/doc-utils";
import { todayJalali } from "@/lib/jalali";

export const dynamic = "force-dynamic";

export default async function Form111Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSoldier(Number(id));
  if (!s) notFound();

  const fullName = [v(s, "firstName"), v(s, "lastName")].filter(Boolean).join(" ");
  const nationalCode = v(s, "nationalCode") || "نامشخص";
  const fname = `${nationalCode}-فرم 111`;

  return (
    <DocPage filename={fname} formLabel="فرم ۱۱۱">
      <Bismillah />

      {/* ═══ هدر سفارشی با قاب عکس در گوشه بالا سمت چپ ═══ */}
      <header className="f111-header">
        <div className="f111-photo-wrap">
          <div className="f111-photo">
            <div className="f111-photo__ribbon">عکس ۴×۳</div>
            <div className="f111-photo__frame">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="f111-photo__icon">
                <circle cx="12" cy="9" r="3.3" />
                <path d="M4 20c1.5-3.4 4.5-5 8-5s6.5 1.6 8 5" strokeLinecap="round" />
              </svg>
              <div className="f111-photo__hint">محل الصاق عکس</div>
            </div>
            <div className="f111-photo__note">با مهر یگان</div>
          </div>
        </div>

        <div className="f111-header__center">
          <div className="f111-header__org">
            <span>جمهوری اسلامی ایران</span>
            <span className="f111-header__dot" />
            <span>سپاه پاسداران انقلاب اسلامی</span>
          </div>
          <h1 className="f111-header__title">فرم مشخصات و سوابق خدمتی</h1>
          <div className="f111-header__subtitle">مخصوص سربازان وظیفه</div>
          <div className="f111-header__badge">فرم ۱۱۱</div>
        </div>

        <div className="f111-header__meta">
          <div className="f111-meta">
            <span className="f111-meta__label">شماره پرونده</span>
            <span className="f111-meta__value">{v(s, "personnelCode") || "—"}</span>
          </div>
          <div className="f111-meta">
            <span className="f111-meta__label">تاریخ</span>
            <span className="f111-meta__value">{todayJalali()}</span>
          </div>
          <div className="f111-meta">
            <span className="f111-meta__label">واحد</span>
            <span className="f111-meta__value">{v(s, "serviceUnit") || "—"}</span>
          </div>
          <div className="f111-meta">
            <span className="f111-meta__label">صفحه</span>
            <span className="f111-meta__value">۱ از ۱</span>
          </div>
        </div>
      </header>

      <SectionTitle title="مشخصات فردی" />
      <div className="f-grid f-grid--c4">
        <Field label="کد ملی" value={v(s, "nationalCode")} />
        <Field label="نام" value={v(s, "firstName")} />
        <Field label="نام خانوادگی" value={v(s, "lastName")} />
        <Field label="نام پدر" value={v(s, "fatherName")} />

        <Field label="شماره شناسنامه" value={v(s, "identityBookletNumber")} />
        <Field label="محل خدمت" value={v(s, "serviceLocation")} />
        <Field label="تاریخ تولد" value={v(s, "birthDate")} />
        <Field label="نوع عضویت" value={v(s, "membershipType")} />

        <Field label="درجه" value={v(s, "rank")} />
        <Field label="گروه خون" value={v(s, "bloodType")} />
        <Field label="رنگ چشم" value={v(s, "eyeColor")} />
        <Field label="رسته خدمتی" value={v(s, "serviceUnit")} />

        <Field label="قد" value={v(s, "height")} />
        <Field label="یگان ترخیص‌کننده" value={v(s, "dischargeUnit")} />
        <Field label="مدرک تحصیلی" value={v(s, "educationLevel")} />
        <Field label="شماره پرسنلی" value={v(s, "personnelCode")} />

        <Field label="مکان آموزشی" value={v(s, "generalTrainingLocation")} />
        <Field label="مدت قانونی خدمت" value={v(s, "legalServiceDuration")} />
        <Field label="مدت خدمت انجام شده" value={v(s, "completedServiceDuration")} />
        <Field label="تاریخ شروع خدمت" value={v(s, "serviceStartDate")} />

        <Field label="تاریخ خاتمه خدمت" value={v(s, "serviceEndDate")} />
        <Field label="تلفن همراه" value={v(s, "mobilePhone")} />
        <Field label="کدپستی" value={v(s, "postalCode")} />
        <Field label="توضیحات" value={v(s, "notes")} />
      </div>

      <LongField label="آدرس کامل" value={v(s, "fullAddress")} />

      {/* بخش گواهی بدون عکس (چون عکس به بالا منتقل شد) */}
      <SectionTitle title="گواهی صحت مندرجات" />
      <div className="f111-statement">
        <p>
          بدینوسیله گواهی می‌گردد مشخصات فوق‌الذکر مطابق با شناسنامه و مدارک ارائه‌شده توسط سرباز وظیفه
          <b style={{ paddingInline: "1.5mm" }}>{fullName || "نامبرده"}</b>
          فرزند
          <b style={{ paddingInline: "1.5mm" }}>{v(s, "fatherName") || "—"}</b>
          مورد بررسی و صحت آن مورد تأیید می‌باشد.
        </p>
      </div>

      <SectionTitle title="تأیید و ثبت" />
      <VerifyRow
        items={[
          "مهر و امضا رده خدمتی",
          "درجه، نام، نام خانوادگی",
          "سامانه",
          "آمار",
          "اسکن",
        ]}
      />

      <Signatures
        items={[
          { title: "ثبت‌کننده اطلاعات" },
          { title: "مسئول آمار" },
          { title: "فرمانده یگان", sub: "مهر و امضا" },
        ]}
      />

      <DocFooter left="فرم ۱۱۱ — مشخصات و سوابق خدمتی" right={`تاریخ چاپ: ${todayJalali()}`} />
    </DocPage>
  );
}
