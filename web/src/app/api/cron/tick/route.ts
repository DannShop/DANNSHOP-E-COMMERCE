import { NextResponse } from "next/server";
import { ensureRecurringJobs, runDueJobs } from "@/lib/jobs/runner";
import { checkCronAuth } from "@/lib/jobs/cron-auth";
import { recordCronHeartbeat } from "@/lib/jobs/heartbeat";

// Pemicu job background. Dilindungi secret header — bukan auth session, karena
// pemanggilnya mesin (lihat lib/jobs/cron-auth.ts untuk dua skema header yang didukung).
//
// Kalau endpoint ini berhenti dipanggil, TIDAK ADA gejala yang kelihatan di situs:
// order berhenti auto-expire, sinkronisasi harga mati, callback partner tidak
// pernah terkirim, dan yang paling mahal — job `recheck-fulfillment` tidak jalan,
// sehingga order yang sudah sukses di provider bisa nyangkut "Diproses" selamanya
// kalau webhook-nya juga gagal.
//
// Karena itu tiap tick yang lolos autentikasi MENCATAT DETAK ke SiteSetting, dan
// dashboard admin menampilkan peringatan merah kalau detak terakhir sudah basi.
// Tanpa itu, matinya cron hanya bisa ditemukan dengan sengaja mencurigainya —
// dan pada kejadian nyata di proyek ini, itu butuh empat hari.
async function handleTick(request: Request): Promise<Response> {
  const auth = checkCronAuth(request.headers);
  if (!auth.ok) {
    // `reason` + `message` sengaja ikut di body. Keduanya tidak membocorkan nilai
    // rahasia apa pun, tapi menjawab pertanyaan yang mustahil dijawab dari luar
    // sebelumnya: apakah 401 ini karena secretnya salah, atau karena CRON_SECRET
    // memang belum terpasang di server. Lihat lib/jobs/cron-auth.ts.
    return NextResponse.json({ error: "Unauthorized", reason: auth.reason, message: auth.message }, { status: 401 });
  }

  // Detak dicatat SEBELUM job dijalankan, dengan sengaja: yang ingin dibuktikan
  // adalah "penjadwalnya menyambung", dan itu tetap benar walaupun salah satu
  // job di dalamnya gagal. Kalau dicatat sesudah, satu handler yang melempar
  // akan membuat cron yang sehat terlihat mati.
  await recordCronHeartbeat();

  await ensureRecurringJobs();
  const result = await runDueJobs();
  return NextResponse.json(result);
}

// POST: cron eksternal (cPanel Rumahweb, cron-job.org) — skema asli proyek ini.
export const POST = handleTick;

// GET: Vercel Cron Jobs SELALU memakai GET dan tidak bisa dikonfigurasi memakai
// POST. Tanpa export ini, cron Vercel cuma akan menerima 405 tiap menit —
// gagal diam-diam, karena Vercel tidak menganggap 405 sebagai error yang perlu
// diberitahukan dan tidak pernah mengulang invokasi yang gagal.
export const GET = handleTick;
