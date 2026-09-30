/**
 * کتابخانه‌ی قالب‌های آماده‌ی نامه.
 * این قالب‌ها هنگام اولین اجرا داخل جدول letter_templates درج می‌شوند و
 * کاملاً قابل ویرایش هستند (کاربر می‌تواند متن، سربرگ و امضا را تغییر دهد).
 */

export interface BuiltinTemplate {
  builtinKey: string;
  name: string;
  category: string;
  description: string;
  subject: string;
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
  pageSize: string;
  params: { key: string; label: string; type?: string; defaultValue?: string; options?: string[] }[];
}

const HEADER = `
<div style="text-align:center;line-height:1.9">
  <div style="font-size:13pt;font-weight:700">بسمه تعالی</div>
  <div style="font-size:12pt;font-weight:700;margin-top:4px">{{سازمان}}</div>
  <div style="font-size:11pt">{{یگان_صادرکننده}}</div>
</div>
<table style="width:100%;margin-top:10px;font-size:10.5pt">
  <tr>
    <td style="text-align:right">شماره: {{شماره_نامه}}</td>
    <td style="text-align:center">تاریخ: {{تاریخ_نامه}}</td>
    <td style="text-align:left">پیوست: {{پیوست}}</td>
  </tr>
</table>
<hr style="border:none;border-top:2px solid #14532d;margin:8px 0 14px" />
`;

const FOOTER = `
<div style="margin-top:36px;text-align:left;line-height:2">
  <div style="font-weight:700">{{عنوان_امضاکننده}}</div>
  <div>{{نام_امضاکننده}}</div>
  <div style="margin-top:28px;font-size:9pt;color:#555">مهر و امضا</div>
</div>
<div style="margin-top:18px;border-top:1px dashed #999;padding-top:6px;font-size:8.5pt;color:#666;text-align:center">
  رونوشت: {{رونوشت}}
</div>
`;

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    builtinKey: "rank_decree",
    name: "نامه حکم درجه",
    category: "احکام",
    description:
      "حکم اعطای درجه به سرباز؛ درجه فعلی از پرونده و درجه جدید/تاریخ اجرا از کاربر گرفته می‌شود.",
    subject: "حکم اعطای درجه",
    headerHtml: HEADER,
    bodyHtml: `
<div style="text-align:center;font-size:14pt;font-weight:800;margin-bottom:16px;text-decoration:underline">
  حکم درجه
</div>

<p style="line-height:2.2;text-align:justify;font-size:12pt">
  به استناد {{مستند_قانونی}} و پیرو پیشنهاد شماره {{شماره_پیشنهاد}} یگان مربوطه، بدین‌وسیله
  <b>{{درجه}} {{نام}} {{نام_خانوادگی}}</b> فرزند <b>{{نام_پدر}}</b> به شماره ملی
  <b>{{کد_ملی}}</b> و شماره پرسنلی <b>{{شماره_پرسنلی}}</b>، شاغل در
  <b>{{یگان_خدمتی}}</b>، از تاریخ <b>{{تاریخ_اجرا}}</b> به درجه
  <b>{{درجه_جدید}}</b> نائل می‌گردد.
</p>

<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:11pt">
  <tr>
    <th style="border:1px solid #999;padding:6px;background:#f1f5f9">درجه فعلی</th>
    <th style="border:1px solid #999;padding:6px;background:#f1f5f9">درجه جدید</th>
    <th style="border:1px solid #999;padding:6px;background:#f1f5f9">تاریخ اعزام</th>
    <th style="border:1px solid #999;padding:6px;background:#f1f5f9">تاریخ اجرای حکم</th>
  </tr>
  <tr>
    <td style="border:1px solid #999;padding:6px;text-align:center">{{درجه}}</td>
    <td style="border:1px solid #999;padding:6px;text-align:center">{{درجه_جدید}}</td>
    <td style="border:1px solid #999;padding:6px;text-align:center">{{تاریخ_اعزام}}</td>
    <td style="border:1px solid #999;padding:6px;text-align:center">{{تاریخ_اجرا}}</td>
  </tr>
</table>

<p style="line-height:2.2;text-align:justify;font-size:12pt">
  امید است با اتکال به خداوند متعال و در سایه توجهات حضرت ولی‌عصر (عج) و در پرتو رهنمودهای
  مقام معظم فرماندهی کل قوا (مدظله‌العالی)، در انجام وظایف محوله موفق و مؤید باشید.
</p>
`,
    footerHtml: FOOTER,
    pageSize: "A4",
    params: [
      { key: "سازمان", label: "نام سازمان / ستاد", type: "text", defaultValue: "ستاد فرماندهی" },
      { key: "یگان_صادرکننده", label: "یگان صادرکننده", type: "text", defaultValue: "معاونت سرمایه انسانی" },
      { key: "شماره_نامه", label: "شماره نامه (خودکار)", type: "auto" },
      { key: "تاریخ_نامه", label: "تاریخ نامه", type: "date" },
      { key: "پیوست", label: "پیوست", type: "text", defaultValue: "ندارد" },
      { key: "درجه_جدید", label: "درجه جدید", type: "select", defaultValue: "سرباز یکم", options: ["سرباز", "سرباز یکم", "سرباز دوم", "گروهبان سوم", "گروهبان دوم", "گروهبان یکم", "استوار دوم", "استوار یکم"] },
      { key: "تاریخ_اجرا", label: "تاریخ اجرای حکم", type: "date" },
      { key: "مستند_قانونی", label: "مستند قانونی", type: "text", defaultValue: "ماده ۱۰۳ قانون ارتش جمهوری اسلامی ایران" },
      { key: "شماره_پیشنهاد", label: "شماره پیشنهاد", type: "text", defaultValue: "-" },
      { key: "عنوان_امضاکننده", label: "عنوان امضاکننده", type: "text", defaultValue: "فرمانده یگان" },
      { key: "نام_امضاکننده", label: "نام امضاکننده", type: "text", defaultValue: "" },
      { key: "رونوشت", label: "رونوشت", type: "text", defaultValue: "پرونده پرسنلی، بایگانی" },
    ],
  },
  {
    builtinKey: "unit_introduction",
    name: "نامه معرفی به رده خدمتی",
    category: "معرفی‌نامه",
    description:
      "معرفی سرباز به رده/یگان مقصد جهت ادامه خدمت؛ مقصد و تاریخ معرفی از کاربر دریافت می‌شود.",
    subject: "معرفی جهت ادامه خدمت",
    headerHtml: HEADER,
    bodyHtml: `
<div style="font-size:12.5pt;font-weight:800;margin-bottom:6px">{{رده_مقصد}}</div>
<div style="font-size:11pt;margin-bottom:14px">موضوع: معرفی جهت {{علت_معرفی}}</div>

<p style="line-height:2.2;text-align:justify;font-size:12pt">
  با سلام و احترام؛ بدین‌وسیله <b>{{درجه}} {{نام}} {{نام_خانوادگی}}</b> فرزند
  <b>{{نام_پدر}}</b>، دارای شماره ملی <b>{{کد_ملی}}</b>، شماره پرسنلی
  <b>{{شماره_پرسنلی}}</b>، متولد <b>{{تاریخ_تولد}}</b> و اعزامی مورخ
  <b>{{تاریخ_اعزام}}</b> که هم‌اکنون در <b>{{یگان_خدمتی}}</b> مشغول انجام وظیفه می‌باشد،
  از تاریخ <b>{{تاریخ_معرفی}}</b> جهت <b>{{علت_معرفی}}</b> به آن رده معرفی می‌گردد.
</p>

<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:11pt">
  <tr>
    <th style="border:1px solid #999;padding:6px;background:#f1f5f9;width:25%">مدرک تحصیلی</th>
    <td style="border:1px solid #999;padding:6px">{{مدرک_تحصیلی}} - {{رشته_تحصیلی}}</td>
    <th style="border:1px solid #999;padding:6px;background:#f1f5f9;width:20%">گروه خون</th>
    <td style="border:1px solid #999;padding:6px">{{گروه_خون}}</td>
  </tr>
  <tr>
    <th style="border:1px solid #999;padding:6px;background:#f1f5f9">پایان خدمت</th>
    <td style="border:1px solid #999;padding:6px">{{پایان_خدمت}}</td>
    <th style="border:1px solid #999;padding:6px;background:#f1f5f9">تلفن همراه</th>
    <td style="border:1px solid #999;padding:6px">{{تلفن_همراه}}</td>
  </tr>
</table>

<p style="line-height:2.2;text-align:justify;font-size:12pt">
  خواهشمند است دستور فرمایید پس از انجام مراحل اداری، نتیجه را به این یگان اعلام نمایند.
  ضمناً نامبرده موظف است حداکثر ظرف مدت <b>{{مهلت_معرفی}}</b> خود را به رده مقصد معرفی نماید.
</p>
`,
    footerHtml: FOOTER,
    pageSize: "A4",
    params: [
      { key: "سازمان", label: "نام سازمان / ستاد", type: "text", defaultValue: "ستاد فرماندهی" },
      { key: "یگان_صادرکننده", label: "یگان صادرکننده", type: "text", defaultValue: "معاونت سرمایه انسانی" },
      { key: "شماره_نامه", label: "شماره نامه (خودکار)", type: "auto" },
      { key: "تاریخ_نامه", label: "تاریخ نامه", type: "date" },
      { key: "پیوست", label: "پیوست", type: "text", defaultValue: "ندارد" },
      { key: "رده_مقصد", label: "رده / یگان مقصد", type: "text", defaultValue: "" },
      { key: "علت_معرفی", label: "علت معرفی", type: "select", defaultValue: "ادامه خدمت", options: ["ادامه خدمت", "انتقال", "مأموریت", "آموزش تخصصی", "معاینات پزشکی", "تسویه حساب"] },
      { key: "تاریخ_معرفی", label: "تاریخ معرفی", type: "date" },
      { key: "مهلت_معرفی", label: "مهلت معرفی", type: "text", defaultValue: "۴۸ ساعت" },
      { key: "عنوان_امضاکننده", label: "عنوان امضاکننده", type: "text", defaultValue: "فرمانده یگان" },
      { key: "نام_امضاکننده", label: "نام امضاکننده", type: "text", defaultValue: "" },
      { key: "رونوشت", label: "رونوشت", type: "text", defaultValue: "پرونده پرسنلی، بایگانی" },
    ],
  },
  {
    builtinKey: "service_certificate",
    name: "گواهی اشتغال به خدمت",
    category: "گواهی",
    description: "گواهی اشتغال به خدمت جهت ارائه به سازمان‌ها و مراجع بیرونی.",
    subject: "گواهی اشتغال به خدمت",
    headerHtml: HEADER,
    bodyHtml: `
<div style="text-align:center;font-size:14pt;font-weight:800;margin-bottom:16px;text-decoration:underline">
  گواهی اشتغال به خدمت
</div>
<p style="line-height:2.2;text-align:justify;font-size:12pt">
  بدین‌وسیله گواهی می‌شود <b>{{درجه}} {{نام}} {{نام_خانوادگی}}</b> فرزند <b>{{نام_پدر}}</b>
  به شماره ملی <b>{{کد_ملی}}</b>، از تاریخ <b>{{تاریخ_اعزام}}</b> در
  <b>{{یگان_خدمتی}}</b> مشغول انجام خدمت وظیفه عمومی بوده و تاریخ پایان خدمت نامبرده
  <b>{{پایان_خدمت}}</b> می‌باشد.
</p>
<p style="line-height:2.2;text-align:justify;font-size:12pt">
  این گواهی صرفاً جهت ارائه به <b>{{مرجع_تحویل}}</b> صادر گردیده و فاقد هرگونه ارزش دیگری است.
</p>
`,
    footerHtml: FOOTER,
    pageSize: "A4",
    params: [
      { key: "سازمان", label: "نام سازمان / ستاد", type: "text", defaultValue: "ستاد فرماندهی" },
      { key: "یگان_صادرکننده", label: "یگان صادرکننده", type: "text", defaultValue: "معاونت سرمایه انسانی" },
      { key: "شماره_نامه", label: "شماره نامه (خودکار)", type: "auto" },
      { key: "تاریخ_نامه", label: "تاریخ نامه", type: "date" },
      { key: "پیوست", label: "پیوست", type: "text", defaultValue: "ندارد" },
      { key: "مرجع_تحویل", label: "مرجع تحویل گواهی", type: "text", defaultValue: "کلیه مراجع ذیربط" },
      { key: "عنوان_امضاکننده", label: "عنوان امضاکننده", type: "text", defaultValue: "رئیس سرمایه انسانی" },
      { key: "نام_امضاکننده", label: "نام امضاکننده", type: "text", defaultValue: "" },
      { key: "رونوشت", label: "رونوشت", type: "text", defaultValue: "پرونده پرسنلی" },
    ],
  },
  {
    builtinKey: "leave_notice",
    name: "ابلاغ مرخصی",
    category: "ابلاغ",
    description: "ابلاغ مرخصی استحقاقی/تشویقی با درج مدت و تاریخ شروع.",
    subject: "ابلاغ مرخصی",
    headerHtml: HEADER,
    bodyHtml: `
<div style="text-align:center;font-size:14pt;font-weight:800;margin-bottom:16px;text-decoration:underline">
  برگ ابلاغ مرخصی
</div>
<p style="line-height:2.2;text-align:justify;font-size:12pt">
  به <b>{{درجه}} {{نام}} {{نام_خانوادگی}}</b> فرزند <b>{{نام_پدر}}</b> به شماره ملی
  <b>{{کد_ملی}}</b> شاغل در <b>{{یگان_خدمتی}}</b>، مقدار <b>{{مدت_مرخصی}}</b> روز مرخصی
  <b>{{نوع_مرخصی}}</b> از تاریخ <b>{{تاریخ_شروع_مرخصی}}</b> اعطا می‌گردد.
</p>
<p style="line-height:2.2;text-align:justify;font-size:12pt">
  نامبرده موظف است رأس ساعت مقرر در تاریخ <b>{{تاریخ_بازگشت}}</b> خود را به یگان معرفی نماید.
  عدم مراجعه در موعد مقرر، غیبت محسوب شده و برابر مقررات با وی رفتار خواهد شد.
</p>
`,
    footerHtml: FOOTER,
    pageSize: "A5",
    params: [
      { key: "سازمان", label: "نام سازمان / ستاد", type: "text", defaultValue: "ستاد فرماندهی" },
      { key: "یگان_صادرکننده", label: "یگان صادرکننده", type: "text", defaultValue: "معاونت سرمایه انسانی" },
      { key: "شماره_نامه", label: "شماره نامه (خودکار)", type: "auto" },
      { key: "تاریخ_نامه", label: "تاریخ نامه", type: "date" },
      { key: "پیوست", label: "پیوست", type: "text", defaultValue: "ندارد" },
      { key: "نوع_مرخصی", label: "نوع مرخصی", type: "select", defaultValue: "استحقاقی", options: ["استحقاقی", "تشویقی", "استعلاجی", "ضروری"] },
      { key: "مدت_مرخصی", label: "مدت (روز)", type: "text", defaultValue: "۳" },
      { key: "تاریخ_شروع_مرخصی", label: "تاریخ شروع", type: "date" },
      { key: "تاریخ_بازگشت", label: "تاریخ بازگشت", type: "date" },
      { key: "عنوان_امضاکننده", label: "عنوان امضاکننده", type: "text", defaultValue: "فرمانده یگان" },
      { key: "نام_امضاکننده", label: "نام امضاکننده", type: "text", defaultValue: "" },
      { key: "رونوشت", label: "رونوشت", type: "text", defaultValue: "دژبان، پرونده پرسنلی" },
    ],
  },
];
