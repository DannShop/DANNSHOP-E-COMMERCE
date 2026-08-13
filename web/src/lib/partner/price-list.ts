import type { Product, ProductItem } from "@prisma/client";
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
  /** Jumlah produk yang cocok dengan filter, SEBELUM dipotong skip/take. */
  total: number;
}

export interface PartnerPriceListFilter {
  categorySlug?: string;
  productSlug?: string;
  /** Cocokkan ke nama/publisher/slug produk, ATAU ke nama/SKU itemnya. */
  search?: string;
  /** Paginasi. Dikosongkan = ambil semuanya (dipakai endpoint API). */
  skip?: number;
  take?: number;
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
/**
 * Kategori yang benar-benar punya produk untuk mitra.
 *
 * Query TERSENDIRI, bukan diturunkan dari produk yang sedang ditampilkan.
 * Begitu daftarnya dipaginasi, menurunkannya dari halaman aktif berarti isi
 * dropdown ikut berubah-ubah tiap kali mitra pindah halaman — dan kategori yang
 * ingin mereka tuju justru menghilang persis saat dibutuhkan.
 */
export async function getPartnerCategories(): Promise<{ slug: string; name: string }[]> {
  const categories = await db.category.findMany({
    where: {
      products: { some: { isActive: true, fulfillmentMode: "AUTO", partnerVisible: true } },
    },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
  return categories;
}

/**
 * Menyempitkan item yang ditampilkan saat ada pencarian.
 *
 * Klausa `where` di atas memilih PRODUK; tanpa langkah ini, mencari satu nominal
 * ("86 Diamond") akan mengembalikan produknya beserta keempat puluh nominal
 * lainnya dan mitra harus mencari lagi dengan mata.
 *
 * Aturannya harus mencerminkan `where` itu, kalau tidak hasilnya bisa kosong
 * secara keliru: kalau yang cocok adalah NAMA PRODUKNYA ("mobile legends"),
 * seluruh itemnya tetap ditampilkan — menyaring item dengan kata itu justru
 * membuang semuanya, karena tidak ada nominal yang bernama "mobile legends".
 */
export function narrowItems<T extends Pick<ProductItem, "id" | "name">>(
  product: Pick<Product, "name" | "publisher" | "slug"> & { items: T[] },
  lowerSearch: string,
  rawSearch: string,
): T[] {
  if (!lowerSearch) return product.items;

  const productMatched =
    product.name.toLowerCase().includes(lowerSearch) ||
    (product.publisher ?? "").toLowerCase().includes(lowerSearch) ||
    product.slug.toLowerCase().includes(lowerSearch);
  if (productMatched) return product.items;

  const narrowed = product.items.filter(
    (item) => item.name.toLowerCase().includes(lowerSearch) || item.id === rawSearch,
  );
  // Jaring pengaman: kalau ternyata tidak ada yang tersisa, tampilkan apa adanya
  // daripada memunculkan kartu produk kosong yang membingungkan.
  return narrowed.length > 0 ? narrowed : product.items;
}

/**
 * Klausa `where` katalog mitra — SATU definisi, dipakai oleh penghitung maupun
 * pengambil datanya.
 *
 * Kalau keduanya menyusun klausanya sendiri, cepat atau lambat keduanya akan
 * berbeda, dan bentuk kegagalannya jahat: jumlah halaman dihitung dari himpunan
 * yang berbeda dari isi halamannya, sehingga muncul halaman kosong di tengah
 * daftar tanpa ada yang salah secara kasat mata.
 */
function partnerCatalogWhere(filter: PartnerPriceListFilter, search: string) {
  return {
    isActive: true,
    // Produk manual tidak pernah muncul di price list partner karena API
    // transaksi juga menolaknya — katalog yang memuat barang yang tidak
    // bisa dibeli cuma menghasilkan tiket dukungan.
    fulfillmentMode: "AUTO" as const,
    // Kontrol terpisah dari isActive: admin bisa menyembunyikan produk dari
    // mitra tanpa menurunkannya dari storefront (lihat komentar kolomnya).
    partnerVisible: true,
    ...(filter.productSlug ? { slug: filter.productSlug } : {}),
    ...(filter.categorySlug ? { category: { slug: filter.categorySlug } } : {}),
    // Pencarian dikerjakan DATABASE, bukan disaring setelah semuanya ditarik.
    // Ini syarat mutlak begitu daftarnya dipaginasi: menyaring belakangan hanya
    // akan mencari di dalam halaman yang kebetulan sedang terbuka, dan mitra
    // akan menyimpulkan SKU-nya tidak ada padahal cuma ada di halaman lain —
    // kesalahan yang jauh lebih mahal daripada lambat.
    //
    // Item ikut dicari: mitra yang sedang mendiagnosis `rc 14` datang membawa
    // SKU dari lognya, bukan nama produknya.
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { publisher: { contains: search } },
            { slug: { contains: search } },
            { items: { some: { isActive: true, OR: [{ name: { contains: search } }, { id: search }] } } },
          ],
        }
      : {}),
  };
}

/**
 * Jumlah produk yang cocok dengan filter — TANPA menyentuh harga sama sekali.
 *
 * Dipisah dari buildPartnerPriceList() karena halaman katalog perlu totalnya
 * DULU untuk menjepit nomor halaman yang di luar jangkauan. Memanggil
 * buildPartnerPriceList() dua kali demi angka ini berarti menjalankan
 * getMembershipContext() dan getActiveProviders() dua kali juga — dua query
 * yang sama sekali tidak dibutuhkan hanya untuk menghitung baris.
 */
export async function countPartnerProducts(filter: PartnerPriceListFilter = {}): Promise<number> {
  const search = filter.search?.trim() ?? "";
  return db.product.count({ where: partnerCatalogWhere(filter, search) });
}

export async function buildPartnerPriceList(
  userId: string,
  filter: PartnerPriceListFilter = {},
): Promise<PartnerPriceList> {
  const now = new Date();
  const search = filter.search?.trim() ?? "";
  const where = partnerCatalogWhere(filter, search);

  const [products, total, membership, activeProviders] = await Promise.all([
    db.product.findMany({
      where,
      include: {
        category: { select: { slug: true, name: true } },
        items: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { providerSkus: true } },
      },
      orderBy: { name: "asc" },
      ...(filter.skip !== undefined ? { skip: filter.skip } : {}),
      ...(filter.take !== undefined ? { take: filter.take } : {}),
    }),
    db.product.count({ where }),
    getMembershipContext(userId),
    getActiveProviders(),
  ]);

  const lowerSearch = search.toLowerCase();

  return {
    tier: membership.tier?.name ?? null,
    total,
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
      items: narrowItems(product, lowerSearch, search).map((item) => {
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
