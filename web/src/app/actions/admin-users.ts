"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { requireAdminSession } from "@/lib/auth/admin-gate";

export type ActionResult = { ok?: string; error?: string };
/** Reset password mengembalikan plaintext SEKALI - tidak pernah bisa dibaca lagi setelah ini. */
export type ResetPasswordResult = ActionResult & { password?: string };

const requireAdmin = () => requireAdminSession("users.manage");

async function logAdmin(adminId: string, action: string, targetId: string, detail?: object) {
  await db.adminActionLog.create({
    data: { adminId, action, targetType: "user", targetId, detail },
  });
}

function revalidateUser(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

// Huruf/angka yang gampang tertukar saat dibacakan lewat telepon atau chat
// (0/O, 1/l/I) sengaja dibuang - password ini memang untuk diteruskan admin ke
// customer secara manual, jadi keterbacaannya bagian dari kegunaannya.
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const PASSWORD_LENGTH = 16;

// Rejection sampling, bukan `byte % panjang`: modulo biasa membuat karakter di
// awal alfabet lebih sering muncul (256 tidak habis dibagi 57), dan ini
// kredensial, bukan angka acak biasa. Byte di atas ambang dibuang supaya
// distribusinya benar-benar rata.
function generatePassword(): string {
  const limit = Math.floor(256 / PASSWORD_ALPHABET.length) * PASSWORD_ALPHABET.length;
  let out = "";
  while (out.length < PASSWORD_LENGTH) {
    for (const byte of randomBytes(PASSWORD_LENGTH)) {
      if (byte >= limit) continue;
      out += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
      if (out.length === PASSWORD_LENGTH) break;
    }
  }
  return out;
}

const banSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().max(500, "Alasan maksimal 500 karakter").optional(),
});

export async function banUser(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = banSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, email: true, role: true, bannedAt: true },
  });
  if (!target) return { error: "User tidak ditemukan" };
  if (target.id === admin.adminId) return { error: "Tidak bisa menangguhkan akun sendiri" };
  // Admin lain sengaja dilindungi: kalau tidak, satu akun admin yang jebol bisa
  // mengunci seluruh tim admin dari panelnya sendiri.
  if (target.role === "ADMIN") return { error: "Akun admin tidak bisa ditangguhkan lewat panel" };
  if (target.bannedAt) return { error: "Akun ini sudah ditangguhkan" };

  const reason = parsed.data.reason || null;
  await db.user.update({
    where: { id: target.id },
    data: { bannedAt: new Date(), banReason: reason },
  });
  await logAdmin(admin.adminId, "user.ban", target.id, { email: target.email, reason });

  revalidateUser(target.id);
  return { ok: `Akun ${target.email} ditangguhkan.` };
}

const unbanSchema = z.object({ userId: z.string().min(1) });

export async function unbanUser(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = unbanSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, email: true, bannedAt: true },
  });
  if (!target) return { error: "User tidak ditemukan" };
  if (!target.bannedAt) return { error: "Akun ini tidak sedang ditangguhkan" };

  await db.user.update({
    where: { id: target.id },
    data: { bannedAt: null, banReason: null },
  });
  await logAdmin(admin.adminId, "user.unban", target.id, { email: target.email });

  revalidateUser(target.id);
  return { ok: `Penangguhan akun ${target.email} dicabut.` };
}

const resetSchema = z.object({ userId: z.string().min(1) });

// Reset paksa oleh admin - dipakai saat customer kehilangan akses email atau
// akunnya diduga dibajak, di mana alur "lupa password" lewat email tidak bisa
// dipakai. Berbeda dari alur itu, di sini TIDAK ada token/email sama sekali:
// admin langsung menerima password barunya untuk diteruskan sendiri.
export async function resetUserPassword(formData: FormData): Promise<ResetPasswordResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = resetSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, email: true, role: true },
  });
  if (!target) return { error: "User tidak ditemukan" };
  // Admin tidak boleh mereset password admin lain (termasuk dirinya sendiri)
  // dari panel: itu jalur pengambilalihan akun yang terlalu mudah kalau satu
  // sesi admin bocor. Admin memakai alur "lupa password" biasa seperti user.
  if (target.role === "ADMIN") return { error: "Password akun admin tidak bisa direset lewat panel" };

  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  await db.$transaction(async (tx) => {
    // Menaikkan User.updatedAt (@updatedAt), dan updatedAt ikut tersimpan di
    // JWT - jadi sesi lama yang masih berjalan langsung dianggap basi oleh
    // requireActiveAccount() di semua jalur uang. Inilah yang membuat reset ini
    // benar-benar mengusir pembajak, bukan cuma mengganti password sementara
    // dia tetap bisa belanja sampai tokennya kedaluwarsa 8 jam lagi.
    await tx.user.update({ where: { id: target.id }, data: { passwordHash } });
    // Link "lupa password" yang mungkin sudah dikirim pembajak ke dirinya
    // sendiri harus ikut mati bersama reset ini.
    await tx.passwordResetToken.deleteMany({ where: { userId: target.id, usedAt: null } });
  });

  // Password TIDAK ikut masuk log - AdminActionLog dibaca banyak mata dan
  // tersimpan permanen. Yang dicatat cuma fakta bahwa resetnya terjadi.
  await logAdmin(admin.adminId, "user.reset_password", target.id, { email: target.email });

  revalidateUser(target.id);
  return { ok: `Password ${target.email} direset.`, password };
}
