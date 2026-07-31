import { NextResponse } from "next/server";
import { ensureRecurringJobs, runDueJobs } from "@/lib/jobs/runner";
import { safeCompare } from "@/lib/crypto";

// Hostinger cron memanggil endpoint ini tiap menit (spec §10).
// Dilindungi secret header — bukan auth session, karena pemanggilnya mesin.
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || !secret || !safeCompare(secret, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureRecurringJobs();
  const result = await runDueJobs();
  return NextResponse.json(result);
}
