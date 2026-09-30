import SoldierForm from "@/components/SoldierForm";
import { getSoldier } from "@/lib/soldier-service";
import { notFound } from "next/navigation";

export default async function EditSoldierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const soldier = await getSoldier(Number(id));
  if (!soldier) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">
        ویرایش سرباز: {soldier.firstName} {soldier.lastName}
      </h1>
      <p className="text-slate-500 text-sm mb-6">اطلاعات سرباز را ویرایش کنید</p>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <SoldierForm initial={soldier as unknown as Record<string, unknown>} soldierId={soldier.id} />
      </div>
    </div>
  );
}
