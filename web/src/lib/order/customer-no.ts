export function buildCustomerNo(inputFields: { name: string }[], target: Record<string, string>): string {
  return inputFields.map((f) => target[f.name] ?? "").join("");
}

// Versi TERBACA MANUSIA dari Order.target, untuk notifikasi/struk/email.
//
// Beda tujuan dengan buildCustomerNo di atas: yang itu merangkai nomor tujuan
// apa adanya untuk DIKIRIM ke provider (urutannya ditentukan inputFields dan
// tidak boleh ada pemisah apa pun), yang ini untuk DIBACA orang. Sengaja baca
// langsung dari objek target - bukan lewat inputFields - supaya tetap
// menampilkan sesuatu yang berguna walau definisi field produknya sudah
// berubah setelah order dibuat.
export function describeOrderTarget(target: unknown): string {
  if (target === null || typeof target !== "object") return "";
  return Object.values(target as Record<string, unknown>)
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .map((v) => String(v))
    .join(" · ");
}

/**
 * Versi TERSAMAR dari describeOrderTarget - untuk layar yang bisa dibuka orang
 * lain.
 *
 * Dipakai halaman Cek Transaksi, yang sejak 2026-08-16 menampilkan daftar
 * pesanan hanya berbekal alamat email. Konsekuensinya disadari dan diterima
 * (keputusan Wildan): siapa pun yang tahu email seseorang bisa melihat daftar
 * belanjanya. Yang TIDAK ikut diserahkan adalah nomor tujuannya - nomor HP dan
 * User ID game adalah data yang melekat pada orangnya dan berguna di luar toko
 * ini, sementara untuk sekadar mengenali pesanan sendiri, ujung nomornya sudah
 * lebih dari cukup.
 *
 * Nomor utuhnya tetap ada di halaman invoice, yang dijaga publicToken.
 *
 * Hanya rentetan 5 digit ke atas yang disamarkan: angka pendek (zone ID, nomor
 * server) tidak mengidentifikasi siapa pun, dan menyamarkannya cuma membuat
 * daftar jadi sulit dibaca tanpa melindungi apa-apa.
 */
export function maskOrderTarget(target: unknown): string {
  return describeOrderTarget(target).replace(/\d{5,}/g, (digits) => {
    const tersembunyi = digits.length - 4;
    return `${digits.slice(0, 2)}${"•".repeat(Math.min(tersembunyi, 6))}${digits.slice(-2)}`;
  });
}
