import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";

const { auth } = NextAuth(authConfig);

const RATE_LIMITS: { match: (pathname: string) => boolean; key: string; limit: number; windowMs: number }[] = [
  { match: (p) => p === "/login", key: "login", limit: 5, windowMs: 60_000 },
  { match: (p) => p === "/register", key: "register", limit: 3, windowMs: 60_000 },
  { match: (p) => p === "/api/webhooks/midtrans", key: "webhook", limit: 60, windowMs: 60_000 },
  { match: (p) => p === "/api/cron/tick", key: "cron-tick", limit: 10, windowMs: 60_000 },
  { match: (p) => /^\/api\/orders\/[^/]+\/status$/.test(p), key: "order-status", limit: 30, windowMs: 60_000 },
];

export default auth(async (req) => {
  const { nextUrl } = req;
  const user = req.auth?.user;
  const ip = extractIp(req.headers);

  const rule = RATE_LIMITS.find((r) => r.match(nextUrl.pathname));
  if (rule) {
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
