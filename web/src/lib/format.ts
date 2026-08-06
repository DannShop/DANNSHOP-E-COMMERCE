// Formatter dibuat sekali di module scope, bukan tiap pemanggilan.
// Intl.NumberFormat termasuk mahal untuk dibangun ulang, dan halaman riwayat
// bisa memanggilnya ratusan kali dalam satu render.
const RUPIAH = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatRupiah(amount: bigint | number): string {
  return RUPIAH.format(Number(amount));
}

// timeZone dikunci ke Asia/Jakarta. Tanpa ini, halaman yang dirender di server
// Vercel (zona UTC) menampilkan jam yang meleset 7 jam dari yang dilihat user -
// dan itu langsung terbaca salah di riwayat transaksi.
const TANGGAL = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

export function formatTanggal(date: Date): string {
  return TANGGAL.format(date);
}
