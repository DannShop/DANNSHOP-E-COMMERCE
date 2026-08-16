// Aturan murni ganti email - NOL akses database, NOL kirim email.
//
// Dipisah dari change-email.ts dengan sengaja, mengikuti pola
// lib/voucher/discount.ts: bagian yang memutuskan "boleh atau tidak" bisa diuji
// habis tanpa menyiapkan database, dan bagian yang menyentuh dunia luar tinggal
// memanggilnya. Yang paling ingin dikunci tesnya justru keputusan-keputusan di
// berkas ini - salah satu saja bocor, akun bisa berpindah tangan.

/** Berlaku 30 menit, sama dengan link reset password. */
export const EMAIL_CHANGE_TTL_MS = 30 * 60_000;

export const EMAIL_CHANGE_REQUESTED_OK =
  "Link konfirmasi sudah dikirim ke email baru. Bukalah inbox tersebut dan klik link-nya — email kamu belum berubah sampai itu dilakukan.";

export const EMAIL_CHANGE_CONFIRMED_OK =
  "Email berhasil diubah. Silakan login ulang memakai email baru.";

/**
 * Pesan tolak untuk token yang tidak bisa dipakai.
 *
 * SATU pesan untuk kedaluwarsa, sudah terpakai, maupun tidak ada - persis pola
 * `invalidMessage` di reset-password.ts. Membedakannya akan memberi tahu pemegang
 * token asing mana tebakan yang "hampir benar", dan tidak menolong pemilik sah
 * sama sekali karena tindakannya sama: minta link baru.
 */
export const EMAIL_CHANGE_TOKEN_INVALID =
  "Link konfirmasi tidak valid atau sudah kedaluwarsa. Silakan ajukan ganti email lagi dari halaman pengaturan.";

export type NewEmailCheck = { ok: true } | { ok: false; message: string };

/**
 * Apakah alamat baru masuk akal, dilihat HANYA dari alamat lama.
 *
 * Sengaja tidak menyentuh database: apakah alamatnya sudah dipakai orang lain
 * ditentukan di change-email.ts (butuh query) DAN sekali lagi oleh unique
 * constraint saat token ditukar. Yang di sini cuma penyaring yang tidak butuh
 * tahu apa-apa selain kedua alamat itu.
 *
 * Perbandingannya case-insensitive karena emailField pada validation/auth.ts
 * sudah menormalkan ke huruf kecil - `Budi@Toko.com` dan `budi@toko.com` adalah
 * alamat yang sama, dan menerimanya sebagai "perubahan" cuma akan mengirim link
 * konfirmasi untuk sesuatu yang tidak mengubah apa pun.
 */
export function checkNewEmail(input: { current: string; requested: string }): NewEmailCheck {
  const current = input.current.trim().toLowerCase();
  const requested = input.requested.trim().toLowerCase();

  if (!requested) return { ok: false, message: "Email baru wajib diisi." };
  if (requested === current) {
    return { ok: false, message: "Email baru sama dengan email sekarang." };
  }
  return { ok: true };
}

export type TokenState = "valid" | "expired" | "used";

/**
 * Keadaan sebuah token konfirmasi.
 *
 * `usedAt` diperiksa LEBIH DULU daripada kedaluwarsa supaya token yang sudah
 * ditukar tetap terbaca "used" walau umurnya sudah lewat - bukan demi pesan ke
 * pengguna (dua-duanya dijawab EMAIL_CHANGE_TOKEN_INVALID), tapi supaya tesnya
 * bisa membedakan "sudah dipakai" dari "kedaluwarsa" dan penjaminan sekali-pakai
 * benar-benar terlihat.
 */
export function tokenState(
  token: { expiresAt: Date; usedAt: Date | null },
  now: Date,
): TokenState {
  if (token.usedAt !== null) return "used";
  // `<=` bukan `<`: token yang kedaluwarsa TEPAT sekarang sudah tidak berlaku.
  if (token.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}
