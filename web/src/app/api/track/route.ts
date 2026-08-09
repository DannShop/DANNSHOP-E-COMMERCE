import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractIp, checkRateLimit } from "@/lib/rate-limit";
import { isLikelyBot, recordPageView } from "@/lib/analytics/track";

// Endpoint beacon untuk statistik kunjungan.
//
// Sengaja endpoint terpisah, BUKAN pencatatan di middleware/proxy.ts:
// middleware berjalan untuk setiap permintaan aset, prefetch Next.js, dan
// perayap - menulis satu baris DB untuk masing-masing akan menghabiskan biaya
// database jauh sebelum menghasilkan data yang berguna. Beacon hanya menyala
// dari browser sungguhan yang benar-benar merender halaman.
//
// SELALU membalas 204, apa pun yang terjadi di dalam. Balasan error di sini
// tidak ada yang bisa memanfaatkannya (pengirimnya sendiri mengabaikan hasil),
// tapi tetap muncul sebagai error merah di konsol pengunjung.

export async function POST(request: Request) {
  try {
    const userAgent = request.headers.get("user-agent") ?? "";
    if (isLikelyBot(userAgent)) return new NextResponse(null, { status: 204 });

    const ip = extractIp(request.headers);
    // 60/menit per IP: satu orang membuka-buka katalog dengan cepat masih jauh
    // di bawah itu, sementara skrip yang mencoba menggelembungkan statistik
    // (atau menghabiskan kuota tulis DB) tertahan.
    const limit = await checkRateLimit(`track:ip:${ip}`, 60, 60_000);
    if (!limit.allowed) return new NextResponse(null, { status: 204 });

    const body = (await request.json()) as { path?: unknown; sessionId?: unknown };
    if (typeof body.path !== "string" || typeof body.sessionId !== "string") {
      return new NextResponse(null, { status: 204 });
    }

    const session = await auth();
    let selfHost: string | null = null;
    try {
      selfHost = new URL(request.url).hostname;
    } catch {
      selfHost = null;
    }

    await recordPageView({
      path: body.path,
      sessionId: body.sessionId,
      referrer: request.headers.get("referer"),
      ip,
      userAgent,
      selfHost,
      userId: session?.user?.id ?? null,
    });
  } catch (e) {
    console.error("api/track: gagal memproses beacon", { error: e instanceof Error ? e.message : String(e) });
  }
  return new NextResponse(null, { status: 204 });
}
