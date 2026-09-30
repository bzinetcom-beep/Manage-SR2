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
  Signatures,
  DocFooter,
} from "@/lib/doc-utils";

export const dynamic = "force-dynamic";

export default async function KartaxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSoldier(Number(id));
  if (!s) notFound();

  const nationalCode = v(s, "nationalCode") || "نامشخص";
  const fullName = [v(s, "firstName"), v(s, "lastName")].filter(Boolean).join(" ");
  const fname = `${nationalCode}-کارتکس${fullName ? "-" + fullName : ""}`;

  return (
    <DocPage filename={fname} formLabel="کارتکس پرسنلی">
      <Bismillah />

      <DocHeader
        code="جمهوری اسلامی ایران — سپاه پاسداران انقلاب اسلامی"
        doctype="کارتکس مشخصات پرسنلی"
        subtitle="سوابق هویتی، جسمانی، تحصیلی و خدمتی سرباز وظیفه"
        formNo="فرم شماره ۱"
        leftItems={[
          { label: "شماره بایگانی", value: v(s, "archiveNumber") },
          { label: "شماره پرونده", value: v(s, "fileNumber") },
        ]}
        rightItems={[
          { label: "تاریخ تنظیم", value: v(s, "documentDate") },
          { label: "صفحه", value: "۱ از ۱" },
        ]}
      />

      <DocStamp
        cols={4}
        items={[
          { label: "شماره پرسنلی", value: v(s, "personnelCode") },
          { label: "تاریخ شروع خدمت", value: v(s, "serviceStartDate") },
          { label: "رسته خدمتی", value: v(s, "serviceUnit") },
          { label: "درجه", value: v(s, "rank") },
        ]}
      />

      {/* ۱ - اطلاعات فردی */}
      <SectionTitle number={1} title="اطلاعات فردی" />
      <div className="f-grid f-grid--c3">
        <Field label="نام" value={v(s, "firstName")} />
        <Field label="نام خانوادگی" value={v(s, "lastName")} />
        <Field label="نام پدر" value={v(s, "fatherName")} />
        <Field label="شماره شناسنامه" value={v(s, "identityBookletNumber")} />
        <Field label="کد ملی" value={v(s, "nationalCode")} />
        <Field label="تاریخ تولد" value={v(s, "birthDate")} />
        <Field label="محل تولد" value={v(s, "birthPlace")} />
        <Field label="نوع عضویت" value={v(s, "membershipType")} />
        <Field label="وضعیت تأهل" value={v(s, "maritalStatus")} />
      </div>

      {/* ۲ - مشخصات ظاهری */}
      <SectionTitle number={2} title="مشخصات ظاهری" />
      <div className="f-grid f-grid--c4">
        <Field label="رنگ چشم" value={v(s, "eyeColor")} />
        <Field label="رنگ مو" value={v(s, "hairColor")} />
        <Field label="رنگ چهره" value={v(s, "skinColor")} />
        <Field label="قد" value={v(s, "height")} />
        <Field label="وزن" value={v(s, "weight")} />
        <Field label="گروه خون" value={v(s, "bloodType")} />
        <Field label="عینک" value={v(s, "wearsGlasses")} />
        <Field label="علامت ویژه" value={v(s, "specialMark")} />
      </div>

      {/* ۳ - وضعیت جسمانی */}
      <SectionTitle number={3} title="وضعیت جسمانی" />
      <div className="f-grid f-grid--c4">
        <Field label="وضعیت جسمانی" value={v(s, "physicalStatus")} />
        <Field label="مجروحیت" value={v(s, "injuryStatus")} />
        <Field label="علت مجروحیت" value={v(s, "injuryReason")} />
        <Field label="اعضا مجروح" value={v(s, "injuredOrgans")} />
        <Field label="نوع بیماری" value={v(s, "diseaseType")} />
        <Field label="تاریخ مجروحیت" value={v(s, "injuryDate")} />
        <Field label="محدودیت کاری" value={v(s, "workLimitation")} />
        <Field label="درصد جانبازی" value={v(s, "disabilityPercentage")} />
      </div>

      {/* ۴ - مدرک تحصیلی */}
      <SectionTitle number={4} title="مدرک تحصیلی" />
      <div className="f-grid f-grid--c2">
        <Field label="میزان تحصیلات هنگام اخذ برگ اعزام به خدمت" value={v(s, "educationAtDispatch") || v(s, "educationLevel")} />
        <Field label="رشته تحصیلی" value={v(s, "majorAtDispatch") || v(s, "educationMajor")} />
        <Field label="میزان تحصیلات هنگام اخذ کارت پایان خدمت" value={v(s, "educationAtEndCard")} />
        <Field label="رشته تحصیلی" value={v(s, "majorAtEndCard")} />
      </div>

      {/* ۵ - خدمت انجام شده */}
      <SectionTitle number={5} title="خدمت انجام شده" />
      <div className="f-grid f-grid--c3">
        <Field label="مدت قانونی خدمت" value={v(s, "legalServiceDuration")} />
        <Field label="نوع عضویت" value={v(s, "membershipType")} />
        <Field label="از تاریخ" value={v(s, "serviceFromDate")} />
        <Field label="تا تاریخ" value={v(s, "serviceToDate")} />
        <Field label="مدت خدمت انجام شده" value={v(s, "completedServiceDuration")} />
        <Field label="محل خدمت" value={v(s, "serviceLocation")} />
        <Field label="رسته خدمتی" value={v(s, "serviceUnit")} />
        <Field label="وظیفه و مسئولیت" value={v(s, "serviceRole")} fullWidth />
      </div>

      {/* کارت‌های صادر شده */}
      <SectionTitle title="کارت‌های صادر شده" />
      <div className="f-grid f-grid--c3">
        <Field label="کارت پایان خدمت دوره ضرورت به شماره" value={v(s, "endCard1Number")} />
        <Field label="در تاریخ" value={v(s, "endCard1Date")} />
        <Field label="صادر و به" value={v(s, "endCard1Holder")} />
        <Field label="کارت پایان خدمت دوره ضرورت به شماره" value={v(s, "endCard2Number")} />
        <Field label="در تاریخ" value={v(s, "endCard2Date")} />
        <Field label="صادر و به" value={v(s, "endCard2Holder")} />
      </div>

      {/* مشخصات برگ اعزام */}
      <SectionTitle title="مشخصات مربوط به برگ اعزام" />
      <div className="f-grid f-grid--c4">
        <Field label="حوزه اعزام‌کننده" value={v(s, "dispatchOffice")} />
        <Field label="تاریخ اعزام" value={v(s, "dispatchDate")} />
        <Field label="تاریخ صدور برگ اعزام" value={v(s, "dispatchIssueDate")} />
        <Field label="کد ملی" value={v(s, "nationalCode")} />
        <Field label="مدت غیبت" value={v(s, "absenceDuration")} />
        <Field label="مدت اضافه خدمت در برگ اعزام" value={v(s, "extraServiceOnDispatch")} />
        <Field label="حوزه صادرکننده" value={v(s, "issuingOffice")} />
        <Field label="نوع جذب" value={v(s, "recruitmentType")} />
      </div>

      {/* ۸ - آموزش نظامی */}
      <SectionTitle number={8} title="وضعیت آموزش نظامی" />
      <div className="f-grid f-grid--c4">
        <Field label="دوره عمومی" value={v(s, "generalTrainingType")} />
        <Field label="از تاریخ" value={v(s, "generalTrainingFrom")} />
        <Field label="تا تاریخ" value={v(s, "generalTrainingTo")} />
        <Field label="محل آموزش" value={v(s, "generalTrainingLocation")} />
        <Field label="دوره تخصصی" value={v(s, "specializedTrainingType")} />
        <Field label="از تاریخ" value={v(s, "specializedTrainingFrom")} />
        <Field label="تا تاریخ" value={v(s, "specializedTrainingTo")} />
        <Field label="محل آموزش" value={v(s, "specializedTrainingLocation")} />
      </div>

      {/* ۹ - تغییرات خدمتی */}
      <SectionTitle number={9} title="تغییرات خدمتی" />
      <div className="f-grid f-grid--c3">
        <Field label="کد محل خدمت" value={v(s, "serviceLocationCode")} />
        <Field label="اضافه خدمت" value={v(s, "changesExtraService")} />
        <Field label="حضور در جبهه" value={v(s, "frontPresence")} />
        <Field label="اخراج" value={v(s, "expulsionStatus")} />
        <Field label="از تاریخ" value={v(s, "changesFromDate")} />
        <Field label="تا تاریخ" value={v(s, "changesToDate")} />
      </div>

      {/* ۱۰ - نوع انفصال */}
      <SectionTitle number={10} title="نوع انفصال" />
      <div className="f-grid f-grid--c1">
        <Field label="نوع انفصال" value={v(s, "separationType")} />
      </div>

      {/* ۱۱ - نوع مرخصی‌ها */}
      <SectionTitle number={11} title="نوع مرخصی‌ها" />
      <div className="f-grid f-grid--c4">
        <Field label="نوع مرخصی‌ها" value={v(s, "leaveTypes")} />
        <Field label="استحقاقی" value={v(s, "leaveEligible")} />
        <Field label="استعلاجی" value={v(s, "leaveMedical")} />
        <Field label="تشویقی" value={v(s, "leaveIncentive")} />
      </div>

      {/* ۱۲ - تشویقات و تنبیهات */}
      <SectionTitle number={12} title="تشویقات و تنبیهات" />
      <LongField label="تشویقات و تنبیهات" value={v(s, "rewardsAndPunishments")} />

      {/* ۱۳ - کسورات خدمت */}
      <SectionTitle number={13} title="کسورات خدمت" />
      <LongField label="کسورات خدمت" value={v(s, "serviceDeductions")} />

      {/* ۱۴ - آدرس */}
      <SectionTitle number={14} title="آدرس و اطلاعات تماس" />
      <LongField label="آدرس کامل" value={v(s, "fullAddress")} />
      <div className="f-grid f-grid--c3">
        <Field label="تلفن منزل" value={v(s, "homePhone") || v(s, "phoneNumber")} />
        <Field label="تلفن همراه" value={v(s, "mobilePhone")} />
        <Field label="کدپستی" value={v(s, "postalCode")} />
      </div>

      <Signatures
        items={[
          { title: "امضا تنظیم‌کننده", sub: v(s, "preparedBySignature") || "نام و نام خانوادگی" },
          { title: "امضا تأییدکننده", sub: v(s, "confirmedBySignature") || "نام و نام خانوادگی" },
        ]}
      />

      <DocFooter left="فرم کارتکس پرسنلی — SRMS7" right="محرومیت از خدمات پس از تأیید نهایی فاقد اعتبار است." />
    </DocPage>
  );
}
