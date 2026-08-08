import { db } from "@/lib/db";

// Penegakan "akun ini masih boleh bertransaksi atau tidak". SATU-SATUNYA tempat
// yang boleh memutuskan itu - pola yang sama dengan effectivePrice() untuk
// harga dan getMembershipContext() untuk tier: satu jalur yang bisa salah,
// bukan lima.
//
// KENAPA HARUS CEK DB SEGAR, BUKAN CUKUP BACA SESI:
// lib/auth.config.ts memakai JWT stateless (`strategy: "jwt"`, maxAge 8 jam).
// Callback jwt/session di sana cuma MENYALIN klaim saat login dan tidak pernah
// membaca DB lagi. Akibatnya sesi yang sudah terlanjur terbit tetap sah sampai
// 8 jam ke depan walaupun admin sudah nge-ban akunnya atau mereset
// passwordnya. Kalau ban cuma dicek di halaman login, user yang sedang aktif
// masih bisa checkout, isi saldo, dan beli tier selama sisa umur token -
// lubang uang nyata, bukan sekadar masalah tampilan.
//
// Biaya satu query berindeks primary key per transaksi itu murah dibanding
// risikonya, dan jalur-jalur ini memang sudah menyentuh DB berkali-kali.

export const BANNED_ERROR = "Akun ini sedang ditangguhkan. Hubungi CS untuk bantuan lebih lanjut.";
export const STALE_SESSION_ERROR =
  "Sesi kamu sudah tidak berlaku karena kredensial akun berubah. Silakan login ulang.";

export interface BanState {
  banned: boolean;
  bannedAt: Date | null;
  banReason: string | null;
}

export async function getBanState(userId: string): Promise<BanState> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { bannedAt: true, banReason: true },
  });
  // Baris user yang sudah tidak ada diperlakukan sebagai diblokir - lebih aman
  // gagal tertutup daripada meloloskan sesi yatim.
  if (!user) return { banned: true, bannedAt: null, banReason: null };
  return { banned: user.bannedAt !== null, bannedAt: user.bannedAt, banReason: user.banReason };
}

/**
 * Guard untuk server action. Mengembalikan pesan error kalau transaksi harus
 * dihentikan, atau null kalau boleh lanjut.
 *
 * `userId` boleh null (checkout tamu) - tamu tidak punya akun untuk
 * ditangguhkan, jadi selalu lolos.
 *
 * `sessionUpdatedAt` adalah klaim `session.user.updatedAt`. Kalau diisi, sesi
 * juga divalidasi kesegarannya terhadap User.updatedAt di DB. Ini yang membuat
 * reset password oleh admin benar-benar berdampak: tanpa cek ini, penyerang
 * yang sudah punya sesi tetap bisa bertransaksi sampai 8 jam setelah
 * passwordnya diganti. Aman dipakai sebagai penanda karena `db.user.update`
 * di codebase ini HANYA dipanggil dua tempat dan keduanya mengganti password
 * (lib/account/change-password.ts & lib/account/reset-password.ts) - tidak ada
 * penulisan rutin yang ikut menaikkan updatedAt dan melogout user tanpa sebab.
 * requireAdmin() di actions/admin-membership.ts sudah lama memakai
 * perbandingan yang sama; ini cuma memperluasnya ke user biasa.
 *
 * Bentuk return-nya sengaja `string | null`, bukan throw, supaya cocok dengan
 * pola ActionResult ({ ok?, error? }) yang dipakai seluruh server action:
 *
 *   const blocked = await requireActiveAccount(userId, session.user.updatedAt);
 *   if (blocked) return { error: blocked };
 */
export async function requireActiveAccount(
  userId: string | null,
  sessionUpdatedAt?: number,
): Promise<string | null> {
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { bannedAt: true, banReason: true, updatedAt: true },
  });
  if (!user) return BANNED_ERROR;

  // Ban diperiksa DULUAN: nge-ban juga menaikkan updatedAt, dan pesan
  // "akun ditangguhkan" jauh lebih berguna buat user daripada "sesi basi".
  if (user.bannedAt !== null) {
    return user.banReason ? `${BANNED_ERROR} Alasan: ${user.banReason}` : BANNED_ERROR;
  }

  if (sessionUpdatedAt !== undefined && user.updatedAt.getTime() !== sessionUpdatedAt) {
    return STALE_SESSION_ERROR;
  }

  return null;
}
