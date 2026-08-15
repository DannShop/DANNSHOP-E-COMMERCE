// Sidik jari nomor tujuan pesanan.
//
// INI PENJAGA ANTI-ABUSE UTAMA voucher, dan pilihan kuncinya disengaja.
//
// Batas "maksimal N kali per orang" harus dikunci ke sesuatu yang benar-benar
// dimiliki orangnya. Email tidak memenuhi syarat itu: pembeli tanpa akun boleh
// ikut memakai voucher, dan alamat email baru gratis dibuat sebanyak-banyaknya -
// batas per-email praktis tidak membatasi apa pun. Yang mahal dipalsukan adalah
// TUJUAN pesanannya: nomor HP yang harus benar-benar dimiliki, atau akun game
// yang harus benar-benar dimainkan. Voucher yang dibatasi per nomor tujuan tetap
// bisa dinikmati pembeli jujur tanpa akun, tapi tidak bisa dipanen berulang.
//
// Konsekuensi yang HARUS dipahami: satu orang yang punya tiga akun game memang
// bisa memakai voucher tiga kali. Itu memang batas yang dipilih - dan tetap jauh
// lebih ketat daripada batas per-email yang bisa diulang tanpa batas sama sekali.

/**
 * Menyusun kunci kanonik dari objek target sebuah order.
 *
 * Sifat yang wajib dipenuhi:
 *  - STABIL terhadap urutan field. `{zone,user}` dan `{user,zone}` adalah tujuan
 *    yang sama; JSON.stringify biasa akan menghasilkan dua string berbeda.
 *  - TAHAN variasi ketikan. "0812-3456" dan "08123456" adalah nomor yang sama.
 *  - TIDAK bergantung pada definisi inputFields produk, yang bisa berubah
 *    setelah order dibuat (pola sama dengan describeOrderTarget).
 */
export function buildTargetKey(target: Record<string, string>): string {
  const parts = Object.entries(target)
    // Urut berdasarkan NAMA FIELD supaya hasilnya tidak bergantung pada urutan
    // penyisipan objek - form HTML tidak menjamin urutan yang sama tiap kali.
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${normalizeTargetValue(value)}`)
    .filter((part) => !part.endsWith("="));

  return parts.join("&");
}

/**
 * Menyeragamkan satu nilai tujuan.
 *
 * Pemisah dibuang (spasi, tanda hubung, titik) karena orang menuliskan nomor
 * yang sama dengan bermacam pemisah. Huruf dibesarkan karena sebagian ID game
 * mengandung huruf yang tidak peka besar-kecil.
 */
function normalizeTargetValue(value: string): string {
  return value.trim().replace(/[\s.\-()]/g, "").toUpperCase();
}
