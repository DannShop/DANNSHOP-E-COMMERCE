import { z } from "zod";

// Dirapikan DULU, baru divalidasi. Urutannya sempat terbalik (validasi dulu,
// transform belakangan), dan akibatnya alamat yang cuma kelebihan spasi di ujung
// ditolak mentah-mentah dengan pesan "Email tidak valid" - padahal alamatnya
// benar. Spasi ikut terbawa jauh lebih sering daripada kelihatannya: salin-tempel
// dari chat, saran otomatis papan ketik HP, dan pengisi otomatis peramban
// semuanya rutin menyisipkannya.
//
// Kena di SEMUA form yang memakai field ini - login, daftar, lupa password -
// jadi gejalanya "kok email saya ditolak padahal sudah benar" di pintu masuk
// aplikasi, jenis kegagalan yang jarang dilaporkan orang dan lebih sering
// membuat mereka menyerah.
//
// Membalik urutannya aman: yang berubah cuma alamat yang dulu DITOLAK sekarang
// diterima setelah dirapikan. Tidak ada alamat yang dulu diterima jadi ditolak,
// dan nilai yang keluar tetap sudah di-trim + huruf kecil seperti sebelumnya -
// jadi tidak ada baris database lama yang mendadak tidak cocok.
const emailField = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.email("Email tidak valid"));

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(8, "Password minimal 8 karakter"),
});

export const registerSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  email: emailField,
  password: z.string().min(8, "Password minimal 8 karakter"),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Token reset tidak valid"),
    newPassword: z.string().min(8, "Password minimal 8 karakter"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirmPassword"],
  });

// Ganti email MINTA password saat ini, bukan cuma alamat baru. Tanpa itu, sesi
// yang terlanjur dibajak (laptop tidak terkunci, cookie tercuri) cukup untuk
// menukar email lalu memicu reset password ke alamat penyerang - akun berpindah
// tangan tanpa penyerang pernah tahu passwordnya.
export const changeEmailSchema = z.object({
  newEmail: emailField,
  currentPassword: z.string().min(1, "Password saat ini wajib diisi"),
});

export const changeNameSchema = z.object({
  name: z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(2, "Nama minimal 2 karakter")
        .max(60, "Nama maksimal 60 karakter"),
    ),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Password saat ini wajib diisi"),
    newPassword: z.string().min(8, "Password minimal 8 karakter"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "Password baru harus berbeda dari password saat ini",
    path: ["newPassword"],
  });
