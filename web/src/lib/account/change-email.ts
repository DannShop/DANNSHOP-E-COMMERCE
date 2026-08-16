import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendEmailChangeNoticeEmail, sendEmailChangeVerifyEmail } from "@/lib/notify/email";
import { verifyPassword } from "@/lib/password";
import { checkRateLimit } from "@/lib/rate-limit";
import { changeEmailSchema } from "@/lib/validation/auth";
import {
  checkNewEmail,
  tokenState,
  EMAIL_CHANGE_CONFIRMED_OK,
  EMAIL_CHANGE_REQUESTED_OK,
  EMAIL_CHANGE_TOKEN_INVALID,
  EMAIL_CHANGE_TTL_MS,
} from "./email-change-rules";

// Flow ganti email. Ditaruh di sini (bukan di file "use server") mengikuti pola
// change-password.ts & reset-password.ts: satu tabel User melayani USER maupun
// ADMIN, jadi flow ini otomatis dipakai keduanya - tidak ada mekanisme khusus
// admin yang harus dijaga tetap sinkron dengan versi user.
export type ChangeEmailResult = { ok?: string; error?: string };

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 15 * 60_000;

// Sentinel pembatal transaksi kalau token keburu ditukar request paralel.
const TOKEN_RACE_LOST = "EMAIL_CHANGE_TOKEN_RACE_LOST";

// Konstruksi yang sama dengan hashResetToken() di reset-password.ts, tapi
// sengaja TIDAK diimpor dari sana. Ini primitif (sha256 atas token mentah), bukan
// aturan bisnis: tiap flow hanya membandingkan hash dengan hasil hash-nya sendiri,
// jadi kalau salah satu berubah, yang lain tetap benar. Menyatukannya cuma akan
// mengikat dua flow yang tidak punya alasan bergerak bersama.
function hashEmailChangeToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function confirmUrl(rawToken: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base}/konfirmasi-email?token=${rawToken}`;
}

/**
 * Langkah 1: catat permintaan & kirim link konfirmasi ke alamat BARU.
 *
 * `User.email` TIDAK disentuh di sini sama sekali. Lihat komentar model
 * EmailChangeToken di schema.prisma untuk alasannya.
 */
export async function requestEmailChange(userId: string, formData: FormData): Promise<ChangeEmailResult> {
  const parsed = changeEmailSchema.safeParse({
    newEmail: formData.get("newEmail"),
    currentPassword: formData.get("currentPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Limit per akun. Dua hal yang ditutup sekaligus: form ini menerima password
  // saat ini (jadi tanpa limit, sesi yang sudah login bisa dipakai menebaknya
  // berulang kali), dan tiap percobaan yang lolos MENGIRIM email (jadi tanpa
  // limit, form ini jadi alat membanjiri inbox orang lain).
  const limit = await checkRateLimit(`change-email:${userId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) return { error: "Terlalu banyak permintaan ganti email, coba lagi nanti." };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, name: true },
  });
  if (!user) return { error: "Akun tidak ditemukan." };

  // Pesan sengaja generik - jangan bocorkan detail apa pun soal password.
  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { error: "Password saat ini salah." };

  const check = checkNewEmail({ current: user.email, requested: parsed.data.newEmail });
  if (!check.ok) return { error: check.message };

  // Dicek di depan supaya orangnya dapat jawaban jelas sekarang, bukan setelah
  // membuka inbox dan mengklik link yang ternyata gagal. Penjamin sebenarnya
  // tetap @unique milik User.email saat token ditukar - di antara dua titik ini
  // alamat tersebut bisa saja didaftarkan orang lain.
  const taken = await db.user.findUnique({ where: { email: parsed.data.newEmail }, select: { id: true } });
  if (taken) return { error: "Email tersebut sudah dipakai akun lain." };

  const rawToken = randomBytes(32).toString("hex");

  // Buang permintaan lama yang belum ditukar supaya cuma link terbaru yang
  // berlaku - kalau tidak, orang yang salah ketik lalu mengulang tetap punya
  // link hidup menuju alamat yang salah.
  await db.emailChangeToken.deleteMany({ where: { userId, usedAt: null } });
  await db.emailChangeToken.create({
    data: {
      userId,
      newEmail: parsed.data.newEmail,
      tokenHash: hashEmailChangeToken(rawToken),
      expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
    },
  });

  // Ke alamat BARU: link konfirmasinya.
  await sendEmailChangeVerifyEmail(parsed.data.newEmail, {
    confirmUrl: confirmUrl(rawToken),
    userName: user.name,
    oldEmail: user.email,
  });

  // Ke alamat LAMA: pemberitahuan saja, TANPA link konfirmasi. Ini kabel
  // pemicunya - kalau ada yang membajak sesi lalu menukar email, pemilik sah
  // mengetahuinya di alamat yang masih dia pegang, selagi masih sempat.
  // Kegagalan kirim tidak dilaporkan sebagai error: permintaannya sendiri sudah
  // tercatat sah, dan sendTemplated tidak pernah throw (sudah log sendiri).
  await sendEmailChangeNoticeEmail(user.email, {
    newEmail: parsed.data.newEmail,
    userName: user.name,
  });

  return { ok: EMAIL_CHANGE_REQUESTED_OK };
}

/**
 * Langkah 2: tukar token jadi perubahan email betulan.
 *
 * Dipanggil dari halaman publik /konfirmasi-email - TOKEN-lah kredensialnya,
 * bukan sesi. Disengaja: link-nya dibuka dari inbox baru, yang sering ada di
 * perangkat lain yang belum login.
 */
export async function confirmEmailChange(rawToken: string): Promise<ChangeEmailResult> {
  if (!rawToken) return { error: EMAIL_CHANGE_TOKEN_INVALID };

  const token = await db.emailChangeToken.findUnique({
    where: { tokenHash: hashEmailChangeToken(rawToken) },
    select: { id: true, userId: true, newEmail: true, expiresAt: true, usedAt: true },
  });
  if (!token || tokenState(token, new Date()) !== "valid") {
    return { error: EMAIL_CHANGE_TOKEN_INVALID };
  }

  try {
    await db.$transaction(async (tx) => {
      // Tandai terpakai LEBIH DULU, dan hanya kalau masih null - kalau dua
      // request datang bersamaan dengan token yang sama, cuma satu yang lolos.
      const claimed = await tx.emailChangeToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error(TOKEN_RACE_LOST);

      // update ini menaikkan User.updatedAt (@updatedAt) yang ikut disimpan di
      // JWT, jadi sesi yang sedang berjalan langsung basi - lihat proxy.ts.
      // Itu memang yang diinginkan di sini: identitas login baru saja berubah,
      // dan sesi lama masih membawa email lama di dalam tokennya.
      //
      // emailVerifiedAt ikut diisi karena flow ini justru BUKTI kepemilikan
      // alamat baru: orangnya membuka inbox itu dan mengklik link-nya.
      await tx.user.update({
        where: { id: token.userId },
        data: { email: token.newEmail, emailVerifiedAt: new Date() },
      });

      // Sisa permintaan ganti email lain milik user ini ikut dibuang.
      await tx.emailChangeToken.deleteMany({ where: { userId: token.userId, usedAt: null } });

      // Link reset password yang masih menggantung DIBATALKAN juga. Alasannya
      // bukan basa-basi: orang yang mengganti email justru sering melakukannya
      // karena inbox lamanya bermasalah, dan link reset yang sudah terlanjur
      // dikirim ke inbox lama itu adalah pintu belakang yang masih hidup menuju
      // akun yang sama.
      await tx.passwordResetToken.deleteMany({ where: { userId: token.userId, usedAt: null } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === TOKEN_RACE_LOST) return { error: EMAIL_CHANGE_TOKEN_INVALID };
    // Alamatnya didaftarkan orang lain setelah permintaan ini dibuat. Constraint
    // @unique-lah yang menangkapnya, bukan pengecekan di requestEmailChange.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Email tersebut sudah dipakai akun lain. Silakan ajukan ganti email dengan alamat berbeda." };
    }
    throw e;
  }

  return { ok: EMAIL_CHANGE_CONFIRMED_OK };
}
