import type { ProviderKey, ProviderSkuStatus } from "@prisma/client";

export type SelectSkuResult =
  | { ok: true; sku: { provider: ProviderKey; providerSkuCode: string; costPrice: bigint } }
  | { ok: false; reason: "no_provider" | "price_increased" | "provider_inactive" };

export interface CandidateSku {
  provider: ProviderKey;
  providerSkuCode: string;
  costPrice: bigint;
  status: ProviderSkuStatus;
  /** Angka kecil dicoba lebih dulu. Opsional supaya pemanggil lama tetap jalan. */
  priority?: number;
}

/** Nilai yang dipakai kalau baris belum punya priority (data lama sebelum migrasi). */
const DEFAULT_PRIORITY = 100;

/**
 * Bentuk minimal yang dibutuhkan pengurutan - sengaja lebih longgar dari
 * CandidateSku. `provider` bertipe string, bukan ProviderKey: panel admin
 * menyimpannya sebagai string biasa, dan pembanding ini cuma memakai namanya
 * sebagai pemecah seri terakhir. Mempersempitnya hanya akan memaksa pemakai
 * melakukan cast tanpa menambah keamanan apa pun.
 */
export interface SortableSku {
  provider: string;
  costPrice: bigint;
  priority?: number;
}

/**
 * Urutan pemakaian SKU: priority admin -> harga modal -> nama provider.
 *
 * DIEKSPOR, dan itu disengaja. Panel admin menandai satu mapping sebagai "Utama"
 * berdasarkan urutan yang sama, dan sebelumnya panel itu MENYALIN aturan ini,
 * disertai komentar yang memperingatkan bahaya kalau kedua salinannya menyimpang
 * - peringatan yang benar, tapi peringatan tidak pernah menghentikan siapa pun.
 * Gejala kalau menyimpang: admin melihat label "Utama" di satu provider padahal
 * order lari ke provider lain, jenis ketidakcocokan yang paling lama ketahuannya
 * karena tidak ada yang error. Dengan satu pembanding yang dipakai bersama,
 * menyimpang jadi mustahil, bukan sekadar tidak dianjurkan.
 *
 * Pemecah seri TERAKHIR selalu nama provider. Tanpa itu, dua SKU dengan angka
 * yang identik bisa terurut berbeda antar-pemanggilan (urutan baris dari DB
 * tidak dijamin), dan order yang sama bisa dikirim ke provider yang berbeda
 * saat di-retry.
 */
export function compareFulfillmentSku(a: SortableSku, b: SortableSku): number {
  const pa = a.priority ?? DEFAULT_PRIORITY;
  const pb = b.priority ?? DEFAULT_PRIORITY;
  if (pa !== pb) return pa - pb;
  if (a.costPrice !== b.costPrice) return a.costPrice < b.costPrice ? -1 : 1;
  return a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0;
}

/**
 * Pilih SKU provider mana yang dipakai untuk memenuhi satu item order.
 *
 * SEBELUMNYA fungsi ini meng-hardcode DIGIFLAZZ. Sekarang provider-agnostik, tapi
 * SENGAJA BUKAN "routing engine termurah-menang" seperti yang dirancang di spec
 * awal: yang menentukan urutan adalah `priority` yang diatur admin per item, bukan
 * harga. Alasannya, keputusan "produk ini dari provider mana" itu keputusan bisnis
 * (mis. game tetap di Digiflazz walau provider lain lebih murah), dan mengambil
 * alih keputusan itu secara otomatis justru menghilangkan kendali yang dibutuhkan.
 * Harga modal hanya jadi pemecah seri supaya urutannya deterministik.
 *
 * `excludeProviders` dipakai jalur failover: mencari kandidat BERIKUTNYA setelah
 * provider tertentu terbukti gagal, tanpa menduplikasi aturan kelayakan di sini.
 */
export function selectFulfillmentSku(
  item: { sellingPrice: bigint },
  skus: CandidateSku[],
  activeProviders: Set<ProviderKey>,
  excludeProviders?: Set<ProviderKey>,
): SelectSkuResult {
  const available = skus.filter(
    (s) => s.status === "ACTIVE" && !(excludeProviders?.has(s.provider) ?? false),
  );
  if (available.length === 0) return { ok: false, reason: "no_provider" };

  const enabled = available.filter((s) => activeProviders.has(s.provider));
  // Semua SKU-nya ada, tapi provider-nya dimatikan admin lewat kill-switch.
  // Dibedakan dari "no_provider" supaya pesan ke admin menunjuk sebab yang benar.
  if (enabled.length === 0) return { ok: false, reason: "provider_inactive" };

  const affordable = enabled.filter((s) => s.costPrice <= item.sellingPrice);
  // Guard anti-jual-rugi: harga modal naik di atas harga jual sejak terakhir sync.
  if (affordable.length === 0) return { ok: false, reason: "price_increased" };

  // Aturan urutannya ada di compareFulfillmentSku, bukan di sini: panel admin
  // memakai pembanding yang sama untuk menandai mapping "Utama".
  const [best] = affordable.sort(compareFulfillmentSku);

  return {
    ok: true,
    sku: { provider: best.provider, providerSkuCode: best.providerSkuCode, costPrice: best.costPrice },
  };
}
