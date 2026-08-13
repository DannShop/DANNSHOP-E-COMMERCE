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

/**
 * Kenapa sebuah panggilan cron ditolak. Dipakai untuk menjawab satu pertanyaan
 * yang selama ini MUSTAHIL dijawab dari luar: "401 ini karena secret saya salah,
 * atau karena CRON_SECRET-nya memang belum dipasang di server?"
 *
 * Sebelum ini keduanya membalas 401 polos yang identik, dan akibatnya nyata:
 * cron proyek ini pernah mati 4 hari sementara satu-satunya cara memeriksanya —
 * memanggil endpoint tanpa secret — SELALU membalas 401 apa pun keadaannya,
 * sehingga tidak pernah bisa membedakan "cron tidak menembak" dari "cron
 * menembak tapi ditolak".
 *
 * Membocorkan alasan ini AMAN. Penyerang yang mendengar "secret belum dipasang"
 * justru belajar bahwa endpoint ini tertutup permanen (fail-closed di bawah),
 * dan yang mendengar "secret tidak cocok" cuma mendapat konfirmasi dari hal yang
 * sudah dia ketahui dari status 401 itu sendiri. Tidak ada satu pun nilai
 * rahasia yang ikut keluar.
 */
export type CronAuthFailure = "secret_not_configured" | "no_secret_sent" | "secret_mismatch";

export type CronAuthResult = { ok: true } | { ok: false; reason: CronAuthFailure; message: string };

const FAILURE_MESSAGE: Record<CronAuthFailure, string> = {
  secret_not_configured:
    "CRON_SECRET belum dipasang di environment server. Set di Vercel → Settings → Environment Variables, lalu REDEPLOY (env baru tidak berlaku untuk deployment yang sudah jalan).",
  no_secret_sent:
    "Request tidak membawa secret. Kirim header `x-cron-secret: <nilai>` (cron eksternal) atau `Authorization: Bearer <nilai>` (Vercel Cron).",
  secret_mismatch: "Secret yang dikirim tidak cocok dengan CRON_SECRET di server.",
};

export function checkCronAuth(headers: Headers): CronAuthResult {
  const expected = process.env.CRON_SECRET;
  // Tanpa CRON_SECRET terpasang, endpoint ini TERTUTUP - bukan terbuka. Kalau
  // env-nya hilang saat deploy, lebih baik job berhenti jalan (kentara, bisa
  // dilacak lewat Monitoring Job) daripada endpoint pemicu job jadi publik.
  if (!expected) {
    return { ok: false, reason: "secret_not_configured", message: FAILURE_MESSAGE.secret_not_configured };
  }

  const given = extractCronSecret(headers);
  if (!given) return { ok: false, reason: "no_secret_sent", message: FAILURE_MESSAGE.no_secret_sent };

  if (!safeCompare(given, expected)) {
    return { ok: false, reason: "secret_mismatch", message: FAILURE_MESSAGE.secret_mismatch };
  }
  return { ok: true };
}

export function isAuthorizedCron(headers: Headers): boolean {
  return checkCronAuth(headers).ok;
}
