import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLiveSnapshot } from "@/lib/analytics/query";

// Sumber data "tampilan langsung" di panel analytics. Di-poll klien tiap
// beberapa detik lewat react-query.
//
// Polling, BUKAN SSE/WebSocket: di runtime serverless, koneksi yang dibuka
// terus dibayar per detik selama halaman tetap terbuka - satu tab admin yang
// lupa ditutup semalaman jadi tagihan compute semalam penuh. Polling ringan
// tiap 10 detik hanya membayar saat benar-benar mengambil data.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }
  // Dicek ulang ke DB, bukan percaya klaim di JWT: JWT bersifat stateless
  // dengan masa berlaku 8 jam, jadi sesi admin yang perannya sudah dicabut
  // (atau akunnya di-ban) tetap membawa role "ADMIN" sampai token kedaluwarsa.
  // Pola yang sama dipakai requireAdmin() di seluruh server action.
  const fresh = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, bannedAt: true },
  });
  if (!fresh || fresh.role !== "ADMIN" || fresh.bannedAt) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  const snapshot = await getLiveSnapshot();
  return NextResponse.json({ ...snapshot, revenueLastHour: snapshot.revenueLastHour.toString() });
}
