import { NextResponse } from "next/server";
import { ensureRecurringJobs, runDueJobs } from "@/lib/jobs/runner";
import { isAuthorizedCron } from "@/lib/jobs/cron-auth";

// Pemicu job background. Dilindungi secret header — bukan auth session, karena
// pemanggilnya mesin (lihat lib/jobs/cron-auth.ts untuk dua skema header yang didukung).
//
// Kalau endpoint ini berhenti dipanggil, TIDAK ADA gejala yang kelihatan di situs:
// order berhenti auto-expire, sinkronisasi harga mati, dan yang paling mahal —
// job `recheck-fulfillment` tidak jalan, sehingga order yang sudah sukses di
// provider bisa nyangkut "Diproses" selamanya kalau webhook-nya juga gagal.
// Cara memastikan dia hidup: Admin → Monitoring Job, cari job PENDING dengan
// `runAt` yang sudah lewat jauh.
async function handleTick(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureRecurringJobs();
  const result = await runDueJobs();
  return NextResponse.json(result);
}

// POST: cron eksternal (Hostinger cron, cron-job.org) — skema asli proyek ini.
export const POST = handleTick;

// GET: Vercel Cron Jobs SELALU memakai GET dan tidak bisa dikonfigurasi memakai
// POST. Tanpa export ini, cron Vercel cuma akan menerima 405 tiap menit —
// gagal diam-diam, karena Vercel tidak menganggap 405 sebagai error yang perlu
// diberitahukan dan tidak pernah mengulang invokasi yang gagal.
export const GET = handleTick;
