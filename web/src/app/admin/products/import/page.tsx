import Link from "next/link";
import type { ProviderKey } from "@prisma/client";
import { db } from "@/lib/db";
import { bulkImportProducts } from "@/app/actions/catalog";
import { getCatalogSources } from "@/lib/providers/catalog-sources";
import { BulkImportPicker } from "./bulk-import-picker";

export default async function BulkImportPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string }>;
}) {
  const [{ provider: rawProvider }, categories, sources] = await Promise.all([
    searchParams,
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    getCatalogSources(),
  ]);

  // ?provider= datang dari menu "Tambah produk" di halaman daftar. Divalidasi
  // terhadap provider yang benar-benar tersedia, bukan dipercaya apa adanya:
  // nilai ngawur di URL harus jatuh ke pilihan pertama yang masuk akal, bukan
  // menyisakan dropdown dalam keadaan tidak memilih apa pun.
  const initialProvider =
    sources.find((s) => s.key === rawProvider)?.key ?? sources[0]?.key ?? ("DIGIFLAZZ" as ProviderKey);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm text-muted-foreground hover:underline">
          &larr; Kembali ke daftar produk
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Tambah produk dari provider</h1>
        <p className="text-sm text-muted-foreground">
          Cari brand yang sudah ada di price list provider (hasil &quot;Sync Harga&quot; di halaman Providers), lalu
          centang denominasi mana saja yang mau ditambahkan. Yang tidak dicentang tidak ikut masuk.
        </p>
      </div>

      {sources.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Belum ada provider yang kredensialnya tersimpan. Isi dulu di{" "}
          <Link href="/admin/providers" className="font-medium underline">
            halaman Providers
          </Link>
          , lalu jalankan &quot;Sync Harga&quot; supaya price list-nya terbaca di sini.
        </p>
      ) : (
        <BulkImportPicker
          categories={categories}
          sources={sources}
          initialProvider={initialProvider}
          bulkImportProducts={bulkImportProducts}
        />
      )}
    </div>
  );
}
