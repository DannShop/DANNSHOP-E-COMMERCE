import Link from "next/link";
import { db } from "@/lib/db";
import { bulkImportProducts } from "@/app/actions/catalog";
import { BulkImportPicker } from "./bulk-import-picker";

export default async function BulkImportPage() {
  const categories = await db.category.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm text-muted-foreground hover:underline">
          &larr; Kembali ke daftar produk
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Tambah produk dari Digiflazz</h1>
        <p className="text-sm text-muted-foreground">
          Cari brand yang sudah terdaftar di price-list Digiflazz (hasil &quot;Sync Harga&quot; di halaman Providers),
          lalu centang denominasi yang mau ditambahkan sekaligus — tidak perlu input satu-satu.
        </p>
      </div>
      <BulkImportPicker categories={categories} bulkImportProducts={bulkImportProducts} />
    </div>
  );
}
