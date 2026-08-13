import { db } from "@/lib/db";
import { effectivePrice } from "@/lib/pricing/effective-price";
import { getMembershipContext } from "@/lib/membership/tier";
import { getActiveProviders } from "@/lib/providers/registry";
import { selectFulfillmentSku } from "@/lib/order/select-provider";

export interface PartnerPriceItem {
  sku: string;
  name: string;
  price: number;
  available: boolean;
}

export interface PartnerPriceProduct {
  product: string;
  product_name: string;
  category: string;
  category_name: string;
  publisher: string | null;
  customer_no_format: string;
  items: PartnerPriceItem[];
}

export interface PartnerPriceList {
  tier: string | null;
  products: PartnerPriceProduct[];
}

/**
 * Katalog + harga yang berlaku untuk satu mitra.
 *
 * SATU sumber hitung untuk dua pemakai: endpoint POST /api/v1/price-list dan
 * halaman Katalog di portal mitra. Kalau keduanya menyusun daftarnya sendiri,
 * mitra akan melihat harga di layar yang berbeda dari harga yang ditagih
 * API-nya — dan mereka baru menyadarinya setelah margin mereka salah hitung.
 * Pola yang sama sudah dipakai lib/membership/tier-price-table.ts.
 */
export async function buildPartnerPriceList(
  userId: string,
  filter: { categorySlug?: string; productSlug?: string } = {},
): Promise<PartnerPriceList> {
  const now = new Date();
  const [products, membership, activeProviders] = await Promise.all([
    db.product.findMany({
      where: {
        isActive: true,
        // Produk manual tidak pernah muncul di price list partner karena API
        // transaksi juga menolaknya — katalog yang memuat barang yang tidak
        // bisa dibeli cuma menghasilkan tiket dukungan.
        fulfillmentMode: "AUTO",
        // Kontrol terpisah dari isActive: admin bisa menyembunyikan produk dari
        // mitra tanpa menurunkannya dari storefront (lihat komentar kolomnya).
        partnerVisible: true,
        ...(filter.productSlug ? { slug: filter.productSlug } : {}),
        ...(filter.categorySlug ? { category: { slug: filter.categorySlug } } : {}),
      },
      include: {
        category: { select: { slug: true, name: true } },
        items: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { providerSkus: true } },
      },
      orderBy: { name: "asc" },
    }),
    getMembershipContext(userId),
    getActiveProviders(),
  ]);

  return {
    tier: membership.tier?.name ?? null,
    products: products.map((product) => ({
      product: product.slug,
      product_name: product.name,
      category: product.category.slug,
      category_name: product.category.name,
      publisher: product.publisher,
      // Bentuk customer_no yang harus dikirim mitra untuk produk ini — menjawab
      // di depan pertanyaan integrasi yang paling sering muncul, alih-alih
      // memaksa mereka menebak dari dokumentasi.
      customer_no_format: (product.inputFields as { label: string }[]).map((f) => f.label).join("|"),
      items: product.items.map((item) => {
        const price = effectivePrice(item, { discountBp: membership.discountBp, now });
        const decision = selectFulfillmentSku({ sellingPrice: price }, item.providerSkus, activeProviders);
        return {
          sku: item.id,
          name: item.name,
          price: Number(price),
          // Ketersediaan dihitung dengan gerbang yang SAMA dengan yang dipakai
          // saat transaksi masuk, bukan sekadar `isActive`. Kalau berbeda,
          // mitra akan melihat produk "tersedia" yang selalu ditolak rc 40.
          available: decision.ok,
        };
      }),
    })),
  };
}
