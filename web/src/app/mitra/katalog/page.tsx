import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageSizeSelect, Pagination } from "@/components/admin/table-toolbar";
import { buildPagination, parsePage, parsePageSize } from "@/lib/admin/pagination";
import { getPartnerSession } from "@/lib/partner/session";
import { buildPartnerPriceList, countPartnerProducts, getPartnerCategories } from "@/lib/partner/price-list";
import { CatalogClient } from "./catalog-client";

export const metadata: Metadata = { title: "Katalog Mitra" };
export const dynamic = "force-dynamic";

/**
 * Katalog mitra — dipaginasi DI SERVER.
 *
 * Versi pertama halaman ini mengirim SELURUH katalog ke browser sekali jalan
 * supaya pencariannya instan tanpa request. Itu terasa enak sampai katalognya
 * bertambah: satu produk bisa punya puluhan nominal, jadi payload-nya tumbuh
 * perkalian dan halaman ini jadi yang paling berat di seluruh portal.
 *
 * Konsekuensi yang HARUS ikut: pencarian dan filter kategori juga pindah ke
 * server. Memaginasi tapi menyaring di klien akan membuat pencarian hanya
 * melihat halaman yang kebetulan terbuka — mitra menyimpulkan SKU-nya tidak ada
 * padahal cuma ada di halaman lain. Salah diam-diam jauh lebih mahal daripada
 * lambat.
 *
 * Seluruh state hidup di query string (pola yang sama dengan tabel admin), jadi
 * hasil pencarian bisa di-bookmark dan bertahan setelah refresh.
 */
export default async function MitraCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; per?: string; page?: string }>;
}) {
  const partner = await getPartnerSession();
  if (!partner) redirect("/account/mitra");

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const category = params.category?.trim() ?? "";
  const pageSize = parsePageSize(params.per);

  const filter = { categorySlug: category || undefined, search: q || undefined };

  // Total dihitung DULU, lewat query hitung murni. buildPagination() butuh
  // angka itu untuk menjepit nomor halaman yang di luar jangkauan — mitra di
  // halaman 7 yang lalu mempersempit filternya tidak boleh melihat daftar
  // kosong yang terlihat seperti "datanya hilang".
  const [categories, total] = await Promise.all([getPartnerCategories(), countPartnerProducts(filter)]);
  const pagination = buildPagination(total, parsePage(params.page), pageSize);

  const list = await buildPartnerPriceList(partner.userId, {
    ...filter,
    skip: pagination.skip,
    take: pagination.pageSize,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <p className="rounded-xl border-l-2 border-sky-500/50 bg-sky-500/5 p-3 text-xs text-muted-foreground">
        Harga di sini identik dengan yang dikembalikan{" "}
        <code className="rounded bg-foreground/10 px-1">POST /api/v1/price-list</code> — dihitung oleh kode yang sama
        persis. Untuk produksi, <strong className="text-foreground">tarik lewat API dan simpan hasilnya</strong>; jangan
        menyalin harga dari halaman ini secara manual, karena harga bisa berubah kapan saja dan salinan manual tidak
        ikut berubah.
      </p>

      <div className="glass-card flex flex-col gap-3 rounded-2xl p-4">
        <form action="/mitra/katalog" className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* `per` dibawa ikut supaya pilihan jumlah baris tidak ter-reset tiap
              kali mitra menekan Cari. `page` sengaja TIDAK dibawa — filter baru
              harus selalu mulai dari halaman 1. */}
          <input type="hidden" name="per" value={pageSize} />

          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Cari nama produk, nominal, atau SKU..."
              className="h-9 pl-9"
              aria-label="Cari katalog"
            />
          </div>

          <select
            name="category"
            defaultValue={category}
            className="h-9 rounded-md border bg-transparent px-3 text-sm sm:w-52"
            aria-label="Filter kategori"
          >
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>

          <Button type="submit" variant="outline" size="lg">
            Cari
          </Button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {total.toLocaleString("id-ID")} produk cocok · harga sudah termasuk diskon tier{" "}
            <strong className="text-foreground">{list.tier ?? "Free"}</strong>
            {list.tier ? "" : " (tanpa tier, harganya sama dengan harga retail)"}
          </p>
          <PageSizeSelect value={pageSize} />
        </div>
      </div>

      {list.products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {q || category
            ? "Tidak ada produk yang cocok dengan filter itu."
            : "Belum ada produk yang dibuka untuk mitra. Hubungi admin DannShop."}
        </p>
      ) : (
        <CatalogClient products={list.products} />
      )}

      {total > 0 && (
        <div className="glass-card overflow-hidden rounded-2xl">
          <Pagination info={pagination} />
        </div>
      )}
    </div>
  );
}
