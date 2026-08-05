import { db } from "@/lib/db";
import { DepositForm } from "./deposit-form";

export default async function DepositPage() {
  const paymentMethods = await db.paymentMethodConfig.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-10">
      <h1 className="font-heading text-2xl font-bold">Isi Saldo</h1>
      <DepositForm
        paymentMethods={paymentMethods.map((m) => ({
          code: m.code,
          label: m.label,
          logoUrl: m.logoUrl,
          feeFlat: m.feeFlat.toString(),
          feePercent: m.feePercent,
        }))}
      />
    </div>
  );
}
