import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin-gate";
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
  // Gerbang yang sama persis dengan seluruh server action - termasuk pengecekan
  // ulang ke DB, karena JWT di sini stateless dan berumur panjang, jadi sesi
  // yang perannya sudah dicabut tetap membawa role lama sampai kedaluwarsa.
  //
  // Sebelum disatukan, route ini memeriksa `bannedAt` sementara dua route admin
  // lainnya memeriksa `updatedAt` - persis jenis penyimpangan yang membuat 16
  // salinan gerbang berbahaya. Sekarang keduanya diperiksa, di satu tempat.
  const admin = await requireAdminSession("system.manage");
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: 403 });
  }

  const snapshot = await getLiveSnapshot();
  return NextResponse.json({ ...snapshot, revenueLastHour: snapshot.revenueLastHour.toString() });
}
