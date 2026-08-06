// Satu-satunya tempat yang boleh menentukan harga final sebuah ProductItem.
// Semua titik yang butuh "berapa yang harus dibayar" (checkout, preview di
// halaman produk, kartu katalog, cek margin admin) wajib lewat sini - jangan
// baca sellingPrice/memberPrice/flashPrice mentah di tempat lain, supaya
// hanya ada satu jalur yang bisa salah, bukan lima. Pure function (tidak
// menyentuh DB/crypto) sehingga aman dipakai di server maupun client
// component untuk preview.

export interface PricedItem {
  sellingPrice: bigint;
  memberPrice: bigint;
  flashPrice: bigint | null;
  flashStartAt: Date | null;
  flashEndAt: Date | null;
}

export function isFlashActive(item: PricedItem, now: Date): boolean {
  return (
    item.flashPrice !== null &&
    item.flashStartAt !== null &&
    item.flashEndAt !== null &&
    item.flashStartAt <= now &&
    now <= item.flashEndAt
  );
}

// Prioritas kalau beberapa berlaku sekaligus: flash > member > normal.
export function effectivePrice(item: PricedItem, { isMember, now }: { isMember: boolean; now: Date }): bigint {
  if (isFlashActive(item, now)) return item.flashPrice!;
  if (isMember) return item.memberPrice;
  return item.sellingPrice;
}
