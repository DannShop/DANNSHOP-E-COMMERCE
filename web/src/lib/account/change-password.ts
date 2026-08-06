import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { checkRateLimit } from "@/lib/rate-limit";
import { changePasswordSchema } from "@/lib/validation/auth";

export type ChangePasswordResult = { ok?: string; error?: string };

// Dipakai user & admin - keduanya menulis ke field yang sama (User.passwordHash),
// jadi logikanya ditaruh di sini (bukan di file "use server") supaya tidak ada
// server action publik yang menerima userId dari client.
export const CHANGE_PASSWORD_OK = "Password berhasil diubah, silakan login ulang.";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60_000;

export async function changeUserPassword(userId: string, formData: FormData): Promise<ChangePasswordResult> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Rate limit per akun - form ini menerima password saat ini, jadi tanpa limit
  // sesi yang sudah login bisa dipakai untuk menebak password lama berulang kali.
  const limit = await checkRateLimit(`change-password:${userId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) return { error: "Terlalu banyak percobaan ganti password, coba lagi nanti." };

  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) return { error: "Akun tidak ditemukan." };

  // Pesan sengaja generik - jangan bocorkan detail apa pun soal password lama.
  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { error: "Password saat ini salah." };

  const passwordHash = await hashPassword(parsed.data.newPassword);
  // update ini otomatis menaikkan User.updatedAt (@updatedAt), sedangkan
  // updatedAt ikut disimpan di JWT - jadi sesi yang sedang berjalan langsung
  // jadi basi. Pemanggil WAJIB melogout user setelah sukses.
  await db.user.update({ where: { id: userId }, data: { passwordHash } });
  return { ok: CHANGE_PASSWORD_OK };
}
