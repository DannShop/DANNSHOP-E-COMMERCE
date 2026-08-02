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
