import { db } from "@/lib/db";
import { createCategory, updateCategory, deleteCategory } from "@/app/actions/categories";
import { CategoryForm } from "./category-form";
import { NewCategoryForm } from "./new-category-form";

export default async function CategoriesPage() {
  const categories = await db.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Kategori</h1>
        <p className="text-sm text-muted-foreground">
          Kelola kategori yang tampil sebagai pills di storefront. Hapus hanya bisa kalau kategori tidak punya produk.
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Tambah Kategori</h2>
        <NewCategoryForm action={createCategory} />
      </div>

      <div className="space-y-3">
        {categories.map((c) => (
          <CategoryForm
            key={c.id}
            category={{ id: c.id, slug: c.slug, name: c.name, sortOrder: c.sortOrder, productCount: c._count.products }}
            updateAction={updateCategory}
            deleteAction={deleteCategory}
          />
        ))}
      </div>
    </div>
  );
}
