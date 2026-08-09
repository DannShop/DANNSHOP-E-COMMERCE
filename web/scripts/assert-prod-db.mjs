// Penjaga sebelum menjalankan migrasi ke produksi.
//
// KENAPA INI ADA. `prisma.config.ts` memanggil `import "dotenv/config"`, dan
// dotenv secara default hanya memuat `.env` — yang di repo ini menunjuk ke
// MySQL lokal (127.0.0.1). Artinya `npx prisma migrate deploy` polos akan
// melapor "sukses" setelah memigrasi database di laptop, sementara TiDB Cloud
// yang dipakai Vercel tidak tersentuh sama sekali.
//
// Kegagalan itu SENYAP dan sangat mahal: kode baru sudah live di produksi
// sementara tabelnya masih skema lama, jadi setiap query yang menyentuh kolom
// baru langsung 500 — termasuk halaman detail produk dan invoice, yaitu jalur
// uang. Sudah pernah benar-benar terjadi (9 Agustus 2026).
//
// Skrip ini menolak melanjutkan kalau targetnya ternyata database lokal.

const url = process.env.DATABASE_URL ?? "";

if (!url) {
  console.error("\n✖ DATABASE_URL kosong. Pastikan file .env.production ada dan berisi DATABASE_URL.\n");
  process.exit(1);
}

let host;
try {
  host = new URL(url).hostname;
} catch {
  console.error("\n✖ DATABASE_URL tidak bisa dibaca sebagai URL yang sah.\n");
  process.exit(1);
}

const LOCAL_HOST = /^(localhost|127\.|0\.0\.0\.0$|::1$|\[::1\]$)/i;
if (LOCAL_HOST.test(host)) {
  console.error(
    `\n✖ DITOLAK: DATABASE_URL menunjuk ke "${host}" — itu database LOKAL, bukan produksi.` +
      `\n  Migrasi produksi harus dijalankan dengan: npm run migrate:prod` +
      `\n  (skrip itu memuat .env.production, bukan .env)\n`,
  );
  process.exit(1);
}

console.log(`→ Target migrasi: ${host}`);
