import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  createProductItem,
  updateProduct,
  updateProductItem,
  toggleProductActive,
  mapProviderSku,
  unmapProviderSku,
  uploadProductBanner,
} from "@/app/actions/catalog";
import { ProductForm } from "../product-form";
import { ProductItemsManager } from "../product-items-manager";
import { ProductToggleForm } from "../product-toggle-form";

// Sama seperti admin/providers/page.tsx — format tanggal di Server Component
// dan kirim sebagai string jadi, bukan di-format ulang di client component
// (product-items-manager.tsx), supaya tidak ada risiko mismatch locale saat hidrasi.
function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "Belum pernah";
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [product, categories] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: { providerSkus: true },
        },
      },
    }),
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  if (!product) notFound();

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link href="/admin/products" className="text-sm text-muted-foreground hover:underline">
          &larr; Kembali ke daftar produk
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <h1 className="text-xl font-semibold">{product.name}</h1>
          <Badge variant={product.isActive ? "success" : "muted"}>
            {product.isActive ? "Aktif" : "Nonaktif"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {product.items.length === 0
            ? "Produk ini belum punya item — tidak bisa diaktifkan sampai minimal satu item ditambahkan."
            : `${product.items.length} item tersedia.`}
        </p>
        <div className="mt-3">
          <ProductToggleForm
            productId={product.id}
            isActive={product.isActive}
            itemCount={product.items.length}
            toggleProductActive={toggleProductActive}
          />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Detail produk</h2>
        <ProductForm
          action={updateProduct}
          categories={categories}
          submitLabel="Simpan perubahan"
          uploadProductBanner={uploadProductBanner}
          initial={{
            id: product.id,
            categoryId: product.categoryId,
            slug: product.slug,
            name: product.name,
            publisher: product.publisher,
            iconUrl: product.iconUrl,
            banner: product.banner,
            description: product.description,
            inputFields: product.inputFields,
            nicknameCheckKey: product.nicknameCheckKey,
            isTrending: product.isTrending,
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Item &amp; harga</h2>
        <ProductItemsManager
          productId={product.id}
          items={product.items.map((item) => ({
            id: item.id,
            name: item.name,
            sellingPrice: item.sellingPrice.toString(),
            memberPrice: item.memberPrice.toString(),
            sortOrder: item.sortOrder,
            isActive: item.isActive,
            providerSkus: item.providerSkus.map((sku) => ({
              id: sku.id,
              provider: sku.provider,
              providerSkuCode: sku.providerSkuCode,
              costPrice: sku.costPrice.toString(),
              status: sku.status,
              lastSyncedAtDisplay: formatDateTime(sku.lastSyncedAt),
            })),
          }))}
          createProductItem={createProductItem}
          updateProductItem={updateProductItem}
          mapProviderSku={mapProviderSku}
          unmapProviderSku={unmapProviderSku}
        />
      </section>
    </div>
  );
}
