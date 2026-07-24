import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toggleProductActive } from "@/app/actions/catalog";
import { ProductToggleForm } from "./product-toggle-form";

export default async function AdminProductsPage() {
  const products = await db.product.findMany({
    include: { category: true, _count: { select: { items: true } } },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
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
        <Link href="/admin/products/new" className={buttonVariants({})}>
          + Produk baru
        </Link>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead className="text-right">Jumlah item</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Belum ada produk. Klik &quot;+ Produk baru&quot; untuk menambah.
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
                      toggleProductActive={toggleProductActive}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
