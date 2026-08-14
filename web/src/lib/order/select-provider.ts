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

  const [best] = affordable.sort((a, b) => {
    const pa = a.priority ?? DEFAULT_PRIORITY;
    const pb = b.priority ?? DEFAULT_PRIORITY;
    if (pa !== pb) return pa - pb;
    if (a.costPrice !== b.costPrice) return a.costPrice < b.costPrice ? -1 : 1;
    // Pemecah seri terakhir: nama provider. Tanpa ini, dua SKU dengan priority dan
    // harga identik bisa terpilih berbeda antar-pemanggilan (urutan dari DB tidak
    // dijamin), dan order yang sama bisa dikirim ke provider berbeda saat di-retry.
    return a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0;
  });

  return {
    ok: true,
    sku: { provider: best.provider, providerSkuCode: best.providerSkuCode, costPrice: best.costPrice },
  };
}
