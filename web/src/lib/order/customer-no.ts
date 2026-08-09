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
