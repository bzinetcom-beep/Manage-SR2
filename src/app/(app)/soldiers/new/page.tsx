import SoldierForm from "@/components/SoldierForm";

export default function NewSoldierPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">ثبت سرباز جدید</h1>
      <p className="text-slate-500 text-sm mb-6">اطلاعات را در بخش‌های مختلف تکمیل کنید</p>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <SoldierForm />
      </div>
    </div>
  );
}
