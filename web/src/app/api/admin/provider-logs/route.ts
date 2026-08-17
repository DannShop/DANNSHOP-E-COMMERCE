import { NextResponse } from "next/server";
import type { Prisma, ProviderKey } from "@prisma/client";
import { requireAdminSession } from "@/lib/auth/admin-gate";
import { db } from "@/lib/db";
import { PROVIDER_API_FAILURE_OUTCOMES, PROVIDER_API_OUTCOMES } from "@/lib/providers/api-log";

// Riwayat panggilan API provider dalam bentuk JSON mentah — admin-only.
//
// Halaman /admin/provider-logs cukup untuk dibaca mata; endpoint ini untuk saat
// datanya perlu DIOLAH: menghitung berapa order yang gagal karena sebab yang sama,
// menyalin satu payload utuh ke tiket support provider, atau mengekspor kejadian
// hari itu. Body respons memuat request & respons apa adanya (kredensial sudah
// diredaksi saat penulisan, bukan di sini).
//
// Query param:
//   orderNumber  — semua panggilan untuk satu order
//   ourRefId     — satu attempt spesifik
//   provider     — DIGIFLAZZ | OKECONNECT | QIOSPAY | SERPUL
//   operation    — transaction | check-status | price-list | cek-saldo
//   outcome      — salah satu PROVIDER_API_OUTCOMES, atau "failed" untuk semua kegagalan
//   since        — ISO date, hanya panggilan setelah waktu ini
//   limit        — default 100, maksimal 500

const MAX_LIMIT = 500;

export async function GET(request: Request) {
  // Gerbang bersama - lihat lib/auth/admin-gate.ts. Termasuk cek ulang ke DB,
  // karena JWT di sini stateless dan sesi yang haknya sudah dicabut tetap
  // membawa role lama sampai tokennya kedaluwarsa.
  const admin = await requireAdminSession("payments.manage");
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: 403 });
  }

  const url = new URL(request.url);
  const orderNumber = url.searchParams.get("orderNumber");
  const ourRefId = url.searchParams.get("ourRefId");
  const provider = url.searchParams.get("provider");
  const operation = url.searchParams.get("operation");
  const outcome = url.searchParams.get("outcome");
  const since = url.searchParams.get("since");
  const rawLimit = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT) : 100;

  if (outcome && outcome !== "failed" && !PROVIDER_API_OUTCOMES.includes(outcome as (typeof PROVIDER_API_OUTCOMES)[number])) {
    return NextResponse.json(
      { error: `outcome tidak dikenal. Pilihan: ${[...PROVIDER_API_OUTCOMES, "failed"].join(", ")}` },
      { status: 400 },
    );
  }
  let sinceDate: Date | undefined;
  if (since) {
    const parsed = new Date(since);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "since bukan tanggal yang valid (pakai format ISO)" }, { status: 400 });
    }
    sinceDate = parsed;
  }

  const where: Prisma.ProviderApiLogWhereInput = {
    ...(orderNumber ? { orderNumber } : {}),
    ...(ourRefId ? { ourRefId } : {}),
    ...(provider ? { provider: provider as ProviderKey } : {}),
    ...(operation ? { operation } : {}),
    ...(outcome === "failed"
      ? { outcome: { in: PROVIDER_API_FAILURE_OUTCOMES } }
      : outcome
        ? { outcome }
        : {}),
    ...(sinceDate ? { createdAt: { gte: sinceDate } } : {}),
  };

  try {
    const [logs, total] = await Promise.all([
      db.providerApiLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
      db.providerApiLog.count({ where }),
    ]);
    return NextResponse.json(
      {
        total, // total yang cocok filter — bisa lebih besar dari logs.length yang dibatasi limit
        returned: logs.length,
        limit,
        logs: logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("GET provider-logs: gagal ambil log panggilan API provider", { error: e });
    return NextResponse.json({ error: "Gagal ambil log, coba lagi." }, { status: 502 });
  }
}
