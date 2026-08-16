import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/lib/auth.config";
import { checkCredentials } from "@/lib/auth/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, totp: {} },
      async authorize(credentials) {
        // Seluruh aturannya ada di checkCredentials() - lihat catatan di sana
        // soal kenapa keputusan ini tidak boleh punya dua salinan. Yang
        // dikerjakan di sini cuma menerjemahkan hasilnya ke bentuk yang
        // dimengerti NextAuth: user, atau null.
        const hasil = await checkCredentials({
          email: credentials?.email,
          password: credentials?.password,
          totp: credentials?.totp,
        });

        // `totp_required` sengaja diperlakukan sama dengan `invalid` DI SINI.
        // Fungsi ini hanya dipanggil saat form benar-benar mencoba masuk, dan
        // pada titik itu kodenya memang sudah diisi. Yang membedakan keduanya
        // adalah langkah pertama di loginAction, yang tidak pernah menerbitkan
        // sesi - jadi tidak ada jalan bagi "butuh kode" untuk berubah jadi
        // "boleh masuk tanpa kode".
        return hasil.kind === "ok" ? hasil.user : null;
      },
    }),
  ],
});
