import { db } from "@/lib/db";
import { previewBulkMarkup, applyBulkMarkup } from "@/app/actions/catalog";
import { MarkupForm } from "./markup-form";

export default async function AdminMarkupPage() {
  const categories = await db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Markup Harga Massal</h1>
        <p className="text-sm text-muted-foreground">
          Hitung ulang harga jual &amp; harga member sekaligus untuk banyak produk, berdasarkan persentase markup di
          atas harga modal provider. Selalu lihat preview dulu sebelum menerapkan.
        </p>
      </div>
      <MarkupForm categories={categories} previewAction={previewBulkMarkup} applyAction={applyBulkMarkup} />
    </div>
  );
}
