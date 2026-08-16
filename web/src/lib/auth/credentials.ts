import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { verifySecondFactor } from "@/lib/auth/two-factor";
import { loginSchema } from "@/lib/validation/auth";

// SATU tempat yang memutuskan apakah sepasang kredensial boleh masuk.
//
// Dipakai DUA pemanggil: authorize() milik NextAuth (yang benar-benar
// menerbitkan sesi) dan langkah pertama form login (yang cuma perlu tahu apakah
// kolom kode 2FA harus ditampilkan). Disatukan dengan sengaja - aturan "kapan
// sebuah login diterima" adalah hal yang paling mahal kalau punya dua salinan
// yang menyimpang: salinan yang lebih longgar jadi pintu masuk, dan tidak ada
// error apa pun yang menandainya.
//
// Alur dua langkah TIDAK dikerjakan lewat pipa error NextAuth (melempar
// CredentialsSignin ber-`code` lalu membacanya lagi di penangkap error). Itu
// bergantung pada bagaimana @auth/core kebetulan membungkus lemparan dari
// authorize(), berubah antar rilis beta, dan mustahil diuji tanpa menjalankan
// seluruh mesin NextAuth. Fungsi murni yang dipanggil dua kali jauh lebih murah
// daripada kebenaran yang bergantung pada detail internal pustaka.

export type CredentialCheck =
  /** Password benar, faktor kedua (kalau ada) sudah terpenuhi. */
  | { kind: "ok"; user: { id: string; email: string; name: string; role: "USER" | "ADMIN"; updatedAt: number } }
  /** Password salah, akun tidak ada, akun ditangguhkan, ATAU kode 2FA salah. */
  | { kind: "invalid" }
  /** Password BENAR, tapi akun ini memakai 2FA dan kodenya belum diisi. */
  | { kind: "totp_required" };

/**
 * @param totp Kosongkan pada langkah pertama. Akun ber-2FA akan menjawab
 *   `totp_required` alih-alih `invalid`, dan itulah satu-satunya cara form tahu
 *   harus menampilkan kolom kedua.
 */
export async function checkCredentials(input: {
  email: unknown;
  password: unknown;
  totp?: unknown;
}): Promise<CredentialCheck> {
  const parsed = loginSchema.safeParse({ email: input.email, password: input.password });
  if (!parsed.success) return { kind: "invalid" };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) return { kind: "invalid" };

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return { kind: "invalid" };

  // Akun ditangguhkan tidak pernah mendapat sesi baru, DAN tidak pernah sampai
  // ke langkah kedua. Dicek setelah verifikasi password (bukan sebelum) supaya
  // password salah pada akun yang di-banned berperilaku persis sama dengan akun
  // biasa - tidak membocorkan status akun ke penebak password. Tapi dicek
  // SEBELUM cabang 2FA di bawah, supaya akun banned tidak balas "totp_required"
  // yang justru menjadi penanda bahwa akun itu ada dan passwordnya benar.
  if (user.bannedAt) return { kind: "invalid" };

  if (user.totpEnabledAt) {
    const second = typeof input.totp === "string" ? input.totp.trim() : "";
    // Password sudah terbukti benar di titik ini. Kosongnya kode BUKAN kegagalan
    // - itu keadaan normal langkah pertama.
    if (!second) return { kind: "totp_required" };
    if (!(await verifySecondFactor(user.id, second))) return { kind: "invalid" };
  }

  return {
    kind: "ok",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      updatedAt: user.updatedAt.getTime(),
    },
  };
}
