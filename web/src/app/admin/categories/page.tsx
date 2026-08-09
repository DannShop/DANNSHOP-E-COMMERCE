import { db } from "@/lib/db";
import { createCategory, updateCategory, deleteCategory } from "@/app/actions/categories";
import { CategoryForm } from "./category-form";
import { NewCategoryForm } from "./new-category-form";
import { PageSizeSelect, Pagination } from "@/components/admin/table-toolbar";
import { buildPagination, parsePage, parsePageSize } from "@/lib/admin/pagination";

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; per?: string }>;
}) {
  const { page: rawPage, per } = await searchParams;
  const pageSize = parsePageSize(per);
  const total = await db.category.count();
  const pagination = buildPagination(total, parsePage(rawPage), pageSize);
  const categories = await db.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
    skip: pagination.skip,
    take: pagination.pageSize,
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

      <div className="flex justify-end">
        <PageSizeSelect value={pageSize} />
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

      <div className="rounded-xl ring-1 ring-foreground/10">
        <Pagination info={pagination} />
      </div>
    </div>
  );
}
