import { safeCompare } from "@/lib/crypto";

// Otentikasi pemanggil /api/cron/tick — SATU sumber kebenaran, dipakai bersama oleh
// route handler-nya DAN oleh proxy.ts (untuk memutuskan bypass rate limit). Kalau
// keduanya punya salinan logika sendiri, cron yang sah bisa lolos di satu lapis tapi
// kena 429 di lapis lain, dan gejalanya (job berhenti jalan) tidak menunjuk ke sini.
//
// Ada DUA pemanggil sah dengan skema header yang berbeda, dan keduanya harus didukung:
//
//  1. Cron EKSTERNAL (Hostinger cron / cron-job.org) → header `x-cron-secret`.
//     Skema milik proyek ini sendiri; dipakai sejak awal (lihat docs/06-TROUBLESHOOTING-DEPLOY.md).
//
//  2. Vercel Cron Jobs → header `Authorization: Bearer <CRON_SECRET>`.
//     Formatnya DITENTUKAN VERCEL dan tidak bisa diubah: kalau env `CRON_SECRET`
//     ada, Vercel otomatis menyertakannya sebagai header Authorization. Vercel juga
//     selalu memanggil dengan **GET**, bukan POST.
//
// Mendukung keduanya sekaligus berarti perpindahan antar penjadwal tidak butuh
// perubahan kode lagi, dan keduanya boleh jalan berbarengan saat masa transisi.
export function extractCronSecret(headers: Headers): string | null {
  const direct = headers.get("x-cron-secret");
  if (direct) return direct;

  const authorization = headers.get("authorization");
  if (authorization) {
    // Prefix dicocokkan case-insensitive: header value bukan sesuatu yang dinormalkan
    // browser/proxy, dan "bearer " huruf kecil sah menurut RFC 6750.
    const match = /^bearer\s+(.+)$/i.exec(authorization);
    if (match) return match[1];
  }
  return null;
}

export function isAuthorizedCron(headers: Headers): boolean {
  const expected = process.env.CRON_SECRET;
  // Tanpa CRON_SECRET terpasang, endpoint ini TERTUTUP - bukan terbuka. Kalau
  // env-nya hilang saat deploy, lebih baik job berhenti jalan (kentara, bisa
  // dilacak lewat Monitoring Job) daripada endpoint pemicu job jadi publik.
  if (!expected) return false;

  const given = extractCronSecret(headers);
  if (!given) return false;
  return safeCompare(given, expected);
}
