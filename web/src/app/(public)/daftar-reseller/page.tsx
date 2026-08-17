import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, Infinity as InfinityIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BENEFIT_CATALOG, parseBenefits } from "@/lib/membership/benefits";
import { formatRupiah } from "@/lib/format";
import { ResellerRegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Daftar Reseller",
  description: "Gabung program reseller dan dapatkan harga lebih murah untuk setiap transaksi.",
};

const BENEFIT_LABEL = new Map(BENEFIT_CATALOG.map((b) => [b.key, b.label]));

// Terbuka untuk umum, tanpa penyaringan (keputusan Wildan 2026-08-17): mendaftar
// gratis dan paket gratis memakai harga NORMAL, jadi tidak ada yang bisa
// dirugikan dari pendaftar asal-asalan. Yang menyaring adalah pembayaran paket,
// bukan formulir ini.
export default async function DaftarResellerPage() {
  // Yang SUDAH login diantar ke menu Reseller di dalam akunnya, tidak
  // ditampilkan formulir publik ini.
  //
  // Formulir publik meminta email & password karena memang untuk orang yang
  // belum punya akun. Menyodorkannya ke orang yang sudah login berarti memberi
  // dua kolom yang bisa dia isi berbeda dari akunnya sendiri - persis yang
  // ingin dihindari keputusan "email & password terkunci untuk yang sudah
  // login". Menguncinya di sini tidak cukup: formulir ini juga jadi pintu bagi
  // yang belum punya akun, jadi kolomnya harus tetap ada.
  const session = await auth();
  if (session?.user?.id) redirect("/account/reseller");

  const tiers = await db.membershipTier.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
    select: {
      id: true,
      name: true,
      price: true,
      discountPercent: true,
      discountFlatManual: true,
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
          di setiap pembelian — paketnya{" "}
          <strong className="font-semibold text-foreground">sekali bayar, berlaku selamanya</strong>, tanpa
          perpanjangan.
        </p>
      </div>

      {/* ===== Paket ===== */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Paket yang tersedia</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Semua paket berlaku selamanya. Naik paket kapan saja — kamu cuma membayar selisihnya.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Paket gratis ikut dipajang sebagai kartu setara, bukan catatan kaki:
              inilah yang benar-benar didapat setiap pendaftar baru, dan
              menyembunyikannya membuat halaman ini terbaca seolah mendaftar
              itu berbayar. */}
          <div className="flex flex-col rounded-2xl border p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold">Gratis</p>
              <p className="font-heading text-xl font-bold">Rp 0</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Otomatis didapat setelah aktivasi</p>
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>Bisa bertransaksi seperti biasa</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-muted-foreground">Harga normal, belum ada potongan</span>
              </li>
            </ul>
          </div>

          {tiers.map((tier) => {
            const benefits = parseBenefits(tier.benefits);
            return (
              <div
                key={tier.id}
                className="flex flex-col rounded-2xl border p-5"
                style={{ borderColor: `${tier.badgeColor}55` }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold" style={{ color: tier.badgeColor }}>
                    {tier.name}
                  </p>
                  <p className="font-heading text-xl font-bold">{formatRupiah(tier.price)}</p>
                </div>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <InfinityIcon className="size-3.5" aria-hidden="true" />
                  Sekali bayar, berlaku selamanya
                </p>

                <ul className="mt-4 flex flex-col gap-2 text-sm">
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0" style={{ color: tier.badgeColor }} aria-hidden="true" />
                    <span>
                      Potongan{" "}
                      <strong className="font-semibold">
                        {(tier.discountPercent / 100).toFixed(2).replace(/\.?0+$/, "")}%
                      </strong>{" "}
                      di setiap transaksi
                    </span>
                  </li>
                  {/* Potongan flat diberi barisnya SENDIRI, bukan digabung ke
                      baris persen dengan kata "atau": pembaca tidak boleh
                      disuruh menebak kapan yang mana berlaku. */}
                  {tier.discountFlatManual > 0n && (
                    <li className="flex items-start gap-2">
                      <Check
                        className="mt-0.5 size-4 shrink-0"
                        style={{ color: tier.badgeColor }}
                        aria-hidden="true"
                      />
                      <span>
                        Potongan <strong className="font-semibold">{formatRupiah(tier.discountFlatManual)}</strong>{" "}
                        untuk produk manual
                      </span>
                    </li>
                  )}
                  {/* Benefit ditampilkan dengan LABEL dari katalog di kode, bukan
                      key mentahnya - key seperti "no_unique_code_order" tidak
                      berarti apa-apa bagi calon reseller. */}
                  {benefits.map((key) => (
                    <li key={key} className="flex items-start gap-2">
                      <Check
                        className="mt-0.5 size-4 shrink-0"
                        style={{ color: tier.badgeColor }}
                        aria-hidden="true"
                      />
                      <span>{BENEFIT_LABEL.get(key) ?? key}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {tiers.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Paket berbayar belum tersedia. Kamu tetap bisa mendaftar sekarang dan mengambil paket nanti.
          </p>
        )}
      </section>

      {/* ===== Formulir ===== */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold">Daftar sekarang</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Gratis. Setelah mendaftar, cek emailmu untuk link aktivasi.
        </p>
        <div className="mt-5 max-w-xl">
          <ResellerRegisterForm />
        </div>
      </section>
    </div>
  );
}
