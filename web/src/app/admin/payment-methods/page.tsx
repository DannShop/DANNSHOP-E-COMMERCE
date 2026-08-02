import { db } from "@/lib/db";
import { PaymentMethodForm } from "./payment-method-form";
import { updatePaymentMethod } from "@/app/actions/payment-methods";

export default async function PaymentMethodsPage() {
  const methods = await db.paymentMethodConfig.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Metode Pembayaran</h1>
        <p className="text-sm text-muted-foreground">
          Atur fee dan aktif/nonaktif metode pembayaran yang ditawarkan saat checkout & deposit.
        </p>
      </div>
      <div className="space-y-3">
        {methods.map((m) => (
          <PaymentMethodForm
            key={m.id}
            method={{
              id: m.id,
              code: m.code,
              label: m.label,
              feeFlat: m.feeFlat.toString(),
              feePercent: m.feePercent,
              sortOrder: m.sortOrder,
              isActive: m.isActive,
            }}
            action={updatePaymentMethod}
          />
        ))}
      </div>
    </div>
  );
}
