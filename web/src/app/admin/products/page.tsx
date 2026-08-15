import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageSizeSelect, Pagination } from "@/components/admin/table-toolbar";
import { buildPagination, parsePage, parsePageSize } from "@/lib/admin/pagination";
import { Trash2 } from "lucide-react";
import { deleteProduct, toggleProductActive } from "@/app/actions/catalog";
import { getCatalogSources } from "@/lib/providers/catalog-sources";
import { AddProductMenu } from "./add-product-menu";
import { DeleteConfirm } from "./delete-confirm";
import { ProductToggleForm } from "./product-toggle-form";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; per?: string; q?: string; cat?: string }>;
}) {
  const { page: rawPage, per, q, cat } = await searchParams;
  const pageSize = parsePageSize(per);

  const where = {
    ...(q ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }] } : {}),
    ...(cat ? { categoryId: cat } : {}),
  };

  // count dijalankan bersama findMany, bukan setelahnya - keduanya tidak saling
  // bergantung, jadi menunggunya berurutan cuma menggandakan latensi halaman.
  const [total, categories, catalogSources] = await Promise.all([
    db.product.count({ where }),
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    getCatalogSources(),
  ]);
  const pagination = buildPagination(total, parsePage(rawPage), pageSize);

  const products = await db.product.findMany({
    where,
    include: { category: true, _count: { select: { items: true } } },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    skip: pagination.skip,
    take: pagination.pageSize,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Produk</h1>
          <p className="text-sm text-muted-foreground">
            Kelola produk dan daftar item/harga yang tampil di katalog member.
          </p>
        </div>
        <AddProductMenu sources={catalogSources} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form action="/admin/products" className="flex items-center gap-2">
          <Input name="q" defaultValue={q ?? ""} placeholder="Cari nama / slug produk" className="h-8 w-56 text-sm" />
          <select
            name="cat"
            defaultValue={cat ?? ""}
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
            aria-label="Filter kategori"
          >
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {/* per ikut dibawa supaya pilihan jumlah baris tidak hilang tiap kali
              admin mencari sesuatu. */}
          <input type="hidden" name="per" value={pageSize} />
          <Button type="submit" variant="outline" size="sm">
            Cari
          </Button>
        </form>
        <PageSizeSelect value={pageSize} />
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead className="text-right">Jumlah item</TableHead>
              <TableHead>Pengiriman</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {q || cat
                    ? "Tidak ada produk yang cocok."
                    : 'Belum ada produk. Klik "Tambah produk" di kanan atas untuk mulai.'}
                </TableCell>
              </TableRow>
            )}
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-medium whitespace-normal">
                  <Link href={`/admin/products/${product.id}`} className="hover:underline">
                    {product.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{product.slug}</div>
                </TableCell>
                <TableCell>{product.category.name}</TableCell>
                <TableCell className="text-right tabular-nums">{product._count.items}</TableCell>
                <TableCell>
                  {product.fulfillmentMode === "MANUAL" ? (
                    <Badge variant="warning">Manual</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Otomatis</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={product.isActive ? "success" : "muted"}>
                    {product.isActive ? "Aktif" : "Nonaktif"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className={buttonVariants({ size: "xs", variant: "outline" })}
                    >
                      Edit
                    </Link>
                    <ProductToggleForm
                      productId={product.id}
                      isActive={product.isActive}
                      itemCount={product._count.items}
                      toggleProductActive={toggleProductActive}
                    />
                    <DeleteConfirm
                      action={deleteProduct}
                      hiddenFields={{ id: product.id }}
                      title={`Hapus produk "${product.name}"?`}
                      confirmLabel="Hapus produk"
                      trigger={
                        <Button size="xs" variant="destructive" aria-label={`Hapus produk ${product.name}`}>
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </Button>
                      }
                      description={
                        <>
                          <p>
                            <strong>{product._count.items} item</strong> beserta seluruh pemetaan SKU providernya ikut
                            terhapus, dan produk ini langsung hilang dari katalog.
                          </p>
                          <p>Tidak bisa dibatalkan.</p>
                        </>
                      }
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination info={pagination} />
      </div>
    </div>
  );
}
