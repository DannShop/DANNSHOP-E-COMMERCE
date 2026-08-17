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

// PERUBAHAN PERILAKU (Fase B): login SENDIRI tidak lagi otomatis memberi
// diskon. Diskon sekarang HANYA datang dari tier member aktif (dibeli lewat
// /membership) - lihat lib/membership/tier.ts. `memberPrice` yang dulu jadi
// "harga otomatis untuk siapa pun yang login" sekarang berperan sebagai LANTAI
// harga: diskon tier setinggi apa pun tidak akan pernah membuat harga jatuh
// di bawah angka itu, supaya admin tidak perlu menghitung ulang floor per
// tier per item satu-satu.
//
// PENAMAAN (2026-08-08): di seluruh panel admin field ini dilabeli
// **"Harga modal"**, bukan lagi "Harga member" - nama lamanya menyesatkan
// karena tidak ada seorang pun yang membayar angka ini. Kolom DB-nya SENGAJA
// tetap `memberPrice`: menggantinya menuntut migrasi tanpa satu pun perubahan
// perilaku. Kalau membaca kode ini sambil melihat panel, "memberPrice" di sini
// = "Harga modal" di sana.
//
// Prioritas kalau beberapa berlaku sekaligus: flash > diskon tier (dilantai
// memberPrice) > normal. Flash tetap menang di atas tier karena flash adalah
// promosi bertenggat waktu yang sengaja mengalahkan semua diskon lain
// (perilaku ini sudah ada sebelum Fase B, dipertahankan apa adanya).
export function effectivePrice(
  item: PricedItem,
  {
    discountBp,
    discountFlat = 0n,
    isManual = false,
    now,
  }: {
    discountBp: number;
    /**
     * Potongan FLAT rupiah dari paket reseller. HANYA dipakai kalau item ini
     * milik produk MANUAL - lihat `isManual`.
     */
    discountFlat?: bigint;
    /**
     * Apakah produk pemilik item ini dikirim manual.
     *
     * Bawaannya `false` DENGAN SENGAJA: pemanggil lama yang belum meneruskan
     * dua field baru ini berperilaku persis seperti sebelumnya (murni
     * persentase). Tidak ada jalur harga yang diam-diam berubah hanya karena
     * tanda tangan fungsinya bertambah.
     */
    isManual?: boolean;
    now: Date;
  },
): bigint {
  if (isFlashActive(item, now)) return item.flashPrice!;

  // Produk MANUAL dengan potongan flat: flat MENGGANTIKAN persentase, bukan
  // ditumpuk di atasnya. Menumpuk keduanya berarti satu paket memberi dua
  // potongan sekaligus di produk yang justru marginnya paling tipis.
  if (isManual && discountFlat > 0n) {
    const discounted = item.sellingPrice - discountFlat;
    return discounted < item.memberPrice ? item.memberPrice : discounted;
  }

  if (discountBp > 0) {
    const discounted = item.sellingPrice - (item.sellingPrice * BigInt(discountBp)) / 10_000n;
    return discounted < item.memberPrice ? item.memberPrice : discounted;
  }
  return item.sellingPrice;
}
