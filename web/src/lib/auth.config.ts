import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/lib/rbac/access";

/**
 * Masa hidup sesi, DIBEDAKAN per peran.
 *
 * Pembeli: 30 hari. Toko ini dipakai dari HP, sering lewat aplikasi yang
 * terpasang di home screen, dan memaksa login ulang tiap hari adalah gesekan
 * yang menghalangi orang membeli - bukan keamanan yang berarti, karena tidak
 * ada yang bisa dilakukan penyerang dengan sesi pembeli selain melihat riwayat
 * pesanannya (jalur uang tetap menuntut password/PIN di titiknya sendiri).
 *
 * Admin: 12 jam. Akun ini memegang kredensial provider, kunci pembayaran, dan
 * seluruh data order - perangkat admin yang tertinggal di suatu tempat tidak
 * boleh tetap terbuka selama sebulan.
 *
 * ℹ️ Ini TIDAK melemahkan penegakan ban. Sesi yang sudah terbit dibatalkan
 * lewat perbandingan `User.updatedAt` di proxy.ts pada SETIAP request, bukan
 * dengan menunggu tokennya kedaluwarsa - jadi mem-banned seseorang tetap
 * menendangnya seketika, mau masa sesinya 8 jam atau 30 hari.
 */
const SESSION_MAX_AGE_USER = 30 * 24 * 60 * 60;
const SESSION_MAX_AGE_ADMIN = 12 * 60 * 60;

export const authConfig = {
  pages: { signIn: "/login" },
  // Angka di sini adalah BATAS ATAS untuk cookie-nya; masa berlaku yang
  // sebenarnya dipersempit per peran lewat `exp` di callback jwt di bawah.
  // NextAuth cuma menerima satu maxAge global, jadi peran yang lebih pendek
  // harus memendekkan dirinya sendiri.
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_USER },
  providers: [], // provider ditambahkan di auth.ts (server-only)
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: UserRole }).role ?? "USER";
        token.updatedAt = (user as { updatedAt?: number }).updatedAt ?? 0;
      }

      // `exp` disetel ULANG di sini, bukan sekali saat login. Kalau cuma disetel
      // saat login, sesi admin yang dipakai terus-menerus tetap mati tepat 12 jam
      // setelah login pertama - benar secara batas waktu, tapi mengusir admin di
      // tengah pekerjaan. Dengan disetel tiap kali token disegarkan, 12 jam itu
      // dihitung dari aktivitas terakhir, bukan dari login.
      const maxAge = token.role === "ADMIN" ? SESSION_MAX_AGE_ADMIN : SESSION_MAX_AGE_USER;
      token.exp = Math.floor(Date.now() / 1000) + maxAge;

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.updatedAt = token.updatedAt as number;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
