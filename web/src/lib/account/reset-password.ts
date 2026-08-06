import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/notify/email";
import { hashPassword } from "@/lib/password";
import { checkRateLimit } from "@/lib/rate-limit";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation/auth";

// Logika inti flow "lupa password". Ditaruh di sini (bukan di file "use server")
// mengikuti pola change-password.ts: satu tabel User dipakai USER maupun ADMIN,
// jadi flow ini otomatis melayani keduanya - tidak ada mekanisme reset khusus admin.
export type ResetPasswordResult = { ok?: string; error?: string };

// Pesan HARUS selalu sama, ada/tidaknya email di database, supaya form ini tidak
// bisa dipakai untuk menebak email mana yang terdaftar (user enumeration).
export const FORGOT_PASSWORD_OK =
  "Jika email terdaftar, kami sudah mengirim link reset password ke email tersebut.";
export const RESET_PASSWORD_OK = "Password berhasil diubah, silakan login dengan password baru.";

const TOKEN_TTL_MS = 30 * 60_000;

// Sentinel untuk membatalkan transaksi kalau token keburu dipakai request paralel.
const TOKEN_RACE_LOST = "PASSWORD_RESET_TOKEN_RACE_LOST";

// Password dummy: cuma untuk membuang waktu sebesar satu hash bcrypt di cabang
// "email tidak ditemukan", supaya durasi respons tidak membocorkan apakah email
// terdaftar. Pola sama dengan TIMING_DUMMY_PASSWORD di app/actions/auth.ts.
const TIMING_DUMMY_PASSWORD = "dummy-timing-normalization-only";

const EMAIL_RATE_LIMIT_MAX = 3;
const EMAIL_RATE_LIMIT_WINDOW_MS = 15 * 60_000;
const IP_RATE_LIMIT_MAX = 10;
const IP_RATE_LIMIT_WINDOW_MS = 60 * 60_000;

export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function resetUrl(rawToken: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base}/reset-password?token=${rawToken}`;
}

export async function requestPasswordReset(formData: FormData, ip: string): Promise<ResetPasswordResult> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email } = parsed.data;

  // Limit per email: mencegah inbox satu korban dibanjiri link reset.
  const emailLimit = await checkRateLimit(
    `forgot-password:email:${email}`,
    EMAIL_RATE_LIMIT_MAX,
    EMAIL_RATE_LIMIT_WINDOW_MS,
  );
  // Tetap balas pesan sukses generik - kalau dibedakan, status rate limit itu
  // sendiri jadi sinyal bahwa email tersebut terdaftar/sedang disasar.
  if (!emailLimit.allowed) return { ok: FORGOT_PASSWORD_OK };

  // Limit per IP: lebih longgar, untuk meredam abuse massal dari satu sumber.
  const ipLimit = await checkRateLimit(`forgot-password:ip:${ip}`, IP_RATE_LIMIT_MAX, IP_RATE_LIMIT_WINDOW_MS);
  if (!ipLimit.allowed) return { ok: FORGOT_PASSWORD_OK };

  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    await hashPassword(TIMING_DUMMY_PASSWORD);
    return { ok: FORGOT_PASSWORD_OK };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);

  // Hapus token lama yang belum dipakai supaya cuma link terbaru yang berlaku -
  // menghindari user bingung mengklik link lama dari email sebelumnya.
  await db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  });

  // Gagal kirim email tidak dibocorkan ke user (sendPasswordResetEmail tidak pernah
  // throw dan sudah log sendiri) - pesannya tetap generik.
  await sendPasswordResetEmail(email, resetUrl(rawToken));
  return { ok: FORGOT_PASSWORD_OK };
}

export async function resetPasswordWithToken(formData: FormData): Promise<ResetPasswordResult> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const tokenHash = hashResetToken(parsed.data.token);
  const token = await db.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  const invalidMessage = "Link reset password tidak valid atau sudah kedaluwarsa. Silakan minta link baru.";
  if (!token || token.usedAt !== null || token.expiresAt <= new Date()) return { error: invalidMessage };

  const passwordHash = await hashPassword(parsed.data.newPassword);
  try {
    await db.$transaction(async (tx) => {
      // Tandai terpakai lebih dulu DAN hanya kalau masih usedAt null - kalau ada dua
      // request paralel dengan token sama, cuma satu yang lolos (count === 0 -> abort).
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error(TOKEN_RACE_LOST);
      // update ini menaikkan User.updatedAt (@updatedAt) yang ikut disimpan di JWT,
      // jadi sesi lama (kalau ada) otomatis jadi basi.
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      // Bersihkan sisa token lain milik user ini supaya tidak ada link nganggur.
      await tx.passwordResetToken.deleteMany({ where: { userId: token.userId, usedAt: null } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === TOKEN_RACE_LOST) return { error: invalidMessage };
    throw e;
  }

  return { ok: RESET_PASSWORD_OK };
}
