import type { Metadata } from "next";
import { db } from "@/lib/db";
import { parseBenefits } from "@/lib/membership/benefits";
import { formatRupiah } from "@/lib/format";
import { ResellerRegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Daftar Reseller",
  description: "Gabung program reseller dan dapatkan harga lebih murah untuk setiap transaksi.",
};

// Terbuka untuk umum, tanpa penyaringan (keputusan Wildan 2026-08-17): mendaftar
// gratis dan paket gratis memakai harga NORMAL, jadi tidak ada yang bisa
// dirugikan dari pendaftar asal-asalan. Yang menyaring adalah pembayaran paket,
// bukan formulir ini.
export default async function DaftarResellerPage() {
  const tiers = await db.membershipTier.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
    select: {
      id: true,
      name: true,
      price: true,
      discountPercent: true,
      badgeColor: true,
      benefits: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="max-w-2xl">
        <h1 className="font-heading text-3xl font-bold">Program Reseller</h1>
        <p className="mt-3 text-muted-foreground">
          Daftar gratis, langsung bisa transaksi. Ambil paket berbayar kapan saja untuk menurunkan harga
          di setiap pembelian — paketnya <strong className="font-semibold text-foreground">sekali bayar,
          berlaku selamanya</strong>, tanpa perpanjangan.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="order-2 lg:order-1">
          <ResellerRegisterForm />
        </div>

        <aside className="order-1 space-y-3 lg:order-2">
          <h2 className="text-sm font-semibold">Paket yang tersedia</h2>
          <div className="rounded-xl border p-4">
            <p className="text-sm font-medium">Gratis</p>
            <p className="text-xs text-muted-foreground">
              Otomatis didapat setelah aktivasi. Harga normal, tanpa potongan.
            </p>
          </div>
          {tiers.map((tier) => {
            const benefits = parseBenefits(tier.benefits);
            return (
              <div key={tier.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium" style={{ color: tier.badgeColor }}>
                    {tier.name}
                  </p>
                  <p className="text-sm font-semibold">{formatRupiah(tier.price)}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Potongan {(tier.discountPercent / 100).toFixed(2).replace(/\.?0+$/, "")}% dari harga normal
                  {benefits.length > 0 && ` · ${benefits.length} keuntungan tambahan`}
                </p>
              </div>
            );
          })}
          {tiers.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Paket berbayar belum tersedia. Kamu tetap bisa mendaftar sekarang.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
