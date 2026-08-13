import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partner/session";
import { buildPartnerPriceList } from "@/lib/partner/price-list";
import { CatalogClient } from "./catalog-client";

export const metadata: Metadata = { title: "Katalog Mitra" };
export const dynamic = "force-dynamic";

export default async function MitraCatalogPage() {
  const partner = await getPartnerSession();
  if (!partner) redirect("/account/mitra");

  // Sumber yang sama persis dengan POST /api/v1/price-list — angka di layar ini
  // adalah angka yang akan ditagih API.
  const list = await buildPartnerPriceList(partner.userId);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <p className="rounded-xl border-l-2 border-sky-500/50 bg-sky-500/5 p-3 text-xs text-muted-foreground">
        Daftar ini identik dengan yang dikembalikan{" "}
        <code className="rounded bg-foreground/10 px-1">POST /api/v1/price-list</code>. Untuk produksi,{" "}
        <strong className="text-foreground">tarik lewat API dan simpan hasilnya</strong> — jangan menyalin harga dari
        halaman ini secara manual, karena harga bisa berubah kapan saja dan salinan manual tidak ikut berubah.
      </p>

      <CatalogClient products={list.products} tier={list.tier} />
    </div>
  );
}
