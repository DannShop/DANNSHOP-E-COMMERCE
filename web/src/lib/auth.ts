import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validation/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user) return null;

        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        // Akun ditangguhkan tidak pernah mendapat sesi baru. Dicek SETELAH
        // verifikasi password (bukan sebelum) supaya password salah pada akun
        // yang di-banned berperilaku persis sama dengan akun biasa - tidak
        // membocorkan status akun ke penebak password.
        //
        // Ini baru separuh penegakan: sesi yang SUDAH terbit sebelum ban tetap
        // hidup sampai 8 jam (JWT stateless, lihat auth.config.ts). Separuh
        // lainnya ada di requireNotBanned() yang dipanggil tiap jalur uang.
        if (user.bannedAt) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role, updatedAt: user.updatedAt.getTime() };
      },
    }),
  ],
});
