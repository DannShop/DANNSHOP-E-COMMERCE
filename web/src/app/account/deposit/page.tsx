import type { Metadata } from "next";
import { db } from "@/lib/db";
import { DepositForm } from "./deposit-form";
import { StorefrontSlot } from "@/components/storefront-slot";

export const metadata: Metadata = { title: "Isi Saldo" };

// Pengecekan sesi tidak ditulis di sini: account/layout.tsx sudah menolak
// pengunjung yang belum login untuk SELURUH /account. Sebelum layout itu ada,
// halaman ini justru satu-satunya di panel yang tidak memeriksa sesi sama sekali.
export default async function DepositPage() {
  const paymentMethods = await db.paymentMethodConfig.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <StorefrontSlot name="deposit_note" className="rounded-lg border p-3 text-sm" />
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
