import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { changeNameSchema } from "@/lib/validation/auth";

// Ganti nama tampilan. Berkas terpisah dari change-email.ts karena alurnya
// memang berbeda jenis: nama BUKAN kredensial - tidak dipakai login, tidak jadi
// tujuan link pemulihan - jadi tidak perlu password saat ini maupun konfirmasi
// lewat email. Menggabungkan keduanya ke satu form cuma akan memaksa aturan
// yang ketat milik email ikut berlaku untuk sesuatu yang tidak membutuhkannya.
export type ChangeNameResult = { ok?: string; error?: string };

export const CHANGE_NAME_OK = "Nama berhasil diubah, silakan login ulang.";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60_000;

export async function changeUserName(userId: string, formData: FormData): Promise<ChangeNameResult> {
  const parsed = changeNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Longgar - tidak ada rahasia yang bisa ditebak lewat form ini. Ada semata
  // supaya satu sesi tidak bisa dipakai menulis ke tabel User tanpa henti.
  const limit = await checkRateLimit(`change-name:${userId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) return { error: "Terlalu banyak perubahan nama, coba lagi nanti." };

  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) return { error: "Akun tidak ditemukan." };
  if (user.name === parsed.data.name) return { error: "Nama baru sama dengan nama sekarang." };

  // Menaikkan User.updatedAt (@updatedAt), yang dibandingkan dengan JWT di
  // proxy.ts - jadi sesi ini langsung basi dan PEMANGGIL WAJIB melogout.
  //
  // Sesi sengaja TIDAK diselamatkan lewat $executeRaw di sini: nama yang tampil
  // di header & halaman akun dibaca dari JWT, jadi sesi yang bertahan hidup
  // justru akan terus menampilkan nama LAMA sampai token 8 jam itu habis -
  // terlihat persis seperti perubahan yang gagal tersimpan. Login ulang sekali
  // jauh lebih jujur daripada layar yang berbohong selama delapan jam.
  await db.user.update({ where: { id: userId }, data: { name: parsed.data.name } });
  return { ok: CHANGE_NAME_OK };
}
