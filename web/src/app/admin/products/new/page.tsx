import Link from "next/link";
import { db } from "@/lib/db";
import { createProduct, uploadProductBanner } from "@/app/actions/catalog";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  const categories = await db.category.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm text-muted-foreground hover:underline">
          &larr; Kembali ke daftar produk
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Produk baru</h1>
        <p className="text-sm text-muted-foreground">
          Produk dibuat dalam status nonaktif. Tambahkan item &amp; harga dulu, baru aktifkan dari halaman edit.
        </p>
      </div>

      <ProductForm
        action={createProduct}
        categories={categories}
        submitLabel="Buat produk"
        uploadProductBanner={uploadProductBanner}
      />
    </div>
  );
}
