// Slug turunan dari nama brand Digiflazz (mis. "Mobile Legends" -> "mobile-legends"),
// dipakai sebagai default slug produk saat bulk-import — admin masih bisa override.
export function slugifyBrand(brand: string): string {
  return brand
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface BrandBucket {
  brand: string;
  rowCount: number;
}

/**
 * Ambil brand UTUH sebanyak yang muat dalam anggaran baris.
 *
 * KENAPA per-brand, bukan `LIMIT n` biasa: bulk-import bekerja per brand — satu
 * brand jadi satu Product, baris yang dicentang jadi ProductItem-nya. Kalau
 * daftar dipotong per BARIS, brand bisa sampai ke layar dalam keadaan setengah,
 * dan admin akan mengimpor produk yang kekurangan denominasi tanpa satu pun
 * tanda bahwa ada yang hilang. Itu kegagalan senyap: produknya jadi, tampak
 * benar, dan barunya ketahuan saat pembeli mencari nominal yang tidak ada.
 *
 * Angkanya nyata: price list OkeConnect punya 471 brand / 5.571 baris, dan
 * "TPG Diamond Mobile Legends" sendirian berisi 114 denominasi — batas 50 baris
 * yang lama memotongnya di tengah.
 *
 * Anggaran hanyalah pagar ukuran halaman, jadi brand PERTAMA selalu ikut walau
 * sendirian sudah melebihi anggaran: mengembalikan daftar kosong untuk brand
 * raksasa akan terbaca sebagai "produknya tidak ada", yang jauh lebih
 * menyesatkan daripada satu halaman yang kepanjangan.
 *
 * Urutan masukan dipertahankan dan brand yang kebesaran TIDAK dilompati demi
 * menjejalkan brand kecil sesudahnya — hasil yang melompat-lompat membuat admin
 * mengira brand yang hilang memang tidak ada di provider.
 */
export function selectBrandsWithinBudget(brands: BrandBucket[], maxRows: number): BrandBucket[] {
  const out: BrandBucket[] = [];
  let used = 0;
  for (const bucket of brands) {
    if (out.length > 0 && used + bucket.rowCount > maxRows) break;
    out.push(bucket);
    used += bucket.rowCount;
  }
  return out;
}

// Hitung harga jual dari harga modal Digiflazz + markup persen. BigInt tidak
// bisa dikali float langsung — dibawa ke basis integer 10_000 dulu (presisi
// 2 desimal persen) baru dibagi balik, supaya pembulatan konsisten & tidak
// ada drift floating-point pada harga yang dibayar customer.
export function applyMarkup(costPrice: bigint, markupPercent: number): bigint {
  if (!Number.isFinite(markupPercent) || markupPercent < 0) {
    throw new Error("Markup harus angka >= 0");
  }
  const BASIS = 10_000n;
  const factor = BigInt(Math.round((1 + markupPercent / 100) * 10_000));
  return (costPrice * factor) / BASIS;
}
