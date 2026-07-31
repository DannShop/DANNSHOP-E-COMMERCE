import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";

const { auth } = NextAuth(authConfig);

const RATE_LIMITS: { match: (pathname: string) => boolean; method?: string; key: string; limit: number; windowMs: number }[] = [
  // method: "POST" - Next.js prefetch dari <Link href="/login">/<Link href="/register"> di header
  // global mengirim GET diam-diam di production; tanpa filter method itu makan budget rate-limit
  // yang seharusnya untuk submit form asli (paling parah /register yang cuma 3/menit).
  { match: (p) => p === "/login", method: "POST", key: "login", limit: 5, windowMs: 60_000 },
  { match: (p) => p === "/register", method: "POST", key: "register", limit: 3, windowMs: 60_000 },
  { match: (p) => p === "/api/webhooks/midtrans", key: "webhook", limit: 60, windowMs: 60_000 },
  { match: (p) => p === "/api/cron/tick", key: "cron-tick", limit: 10, windowMs: 60_000 },
  // limit 120 (bukan 30) - halaman invoice polling tiap 3000ms (~20 req/menit per tab), dua tab/dua
  // customer di NAT yang sama sebelumnya cukup untuk trip limit 30/menit dan merusak layar tunggu bayar.
  { match: (p) => /^\/api\/orders\/[^/]+\/status$/.test(p), key: "order-status", limit: 120, windowMs: 60_000 },
];

export default auth(async (req) => {
  const { nextUrl } = req;
  const user = req.auth?.user;
  const ip = extractIp(req.headers);

  const rule = RATE_LIMITS.find((r) => r.match(nextUrl.pathname) && (!r.method || r.method === req.method));
  if (rule) {
    // Caller cron-tick yang sudah membawa x-cron-secret valid (divalidasi lagi oleh route itu
    // sendiri) tidak butuh limit berbasis IP tambahan - IP dari X-Forwarded-For bisa dispoof
    // caller, jadi limit IP di sini sebenarnya cuma lubang DoS (starve bucket IP bersama) untuk
    // endpoint yang sudah punya autentikasi sendiri via secret.
    const isTrustedCron =
      rule.key === "cron-tick" &&
      !!process.env.CRON_SECRET &&
      req.headers.get("x-cron-secret") === process.env.CRON_SECRET;
    if (!isTrustedCron) {
      const result = await checkRateLimit(`${rule.key}:ip:${ip}`, rule.limit, rule.windowMs);
      if (!result.allowed) {
        return NextResponse.json(
          { error: "Terlalu banyak percobaan, coba lagi sebentar lagi." },
          {
            status: 429,
            headers: result.retryAfterMs ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) } : undefined,
          },
        );
      }
    }
  }

  if (nextUrl.pathname.startsWith("/admin")) {
    if (!user || user.role !== "ADMIN") {
      return Response.redirect(new URL("/login", nextUrl));
    }
    const fresh = await db.user.findUnique({ where: { id: user.id }, select: { role: true, updatedAt: true } });
    if (!fresh || fresh.role !== "ADMIN" || fresh.updatedAt.getTime() !== user.updatedAt) {
      return Response.redirect(new URL("/login", nextUrl));
    }
  }

  if (nextUrl.pathname.startsWith("/account")) {
    if (!user) {
      return Response.redirect(new URL("/login", nextUrl));
    }
  }
});

export const config = {
  matcher: ["/admin/:path*", "/account/:path*", "/login", "/register", "/api/:path*"],
};
