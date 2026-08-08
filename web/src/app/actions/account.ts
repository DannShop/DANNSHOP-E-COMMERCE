"use server";

import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/lib/auth";
import { changeUserPassword, type ChangePasswordResult } from "@/lib/account/change-password";
import { requireActiveAccount } from "@/lib/account/user-status";

export async function changePassword(formData: FormData): Promise<ChangePasswordResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Harus login untuk ganti password." };

  // Bukan jalur uang, tapi tetap ditutup: kalau admin menangguhkan akun lalu
  // mereset passwordnya, pemegang sesi lama tidak boleh bisa menyetel ulang
  // password itu dan merebut kembali akunnya.
  // Sengaja TANPA cek kesegaran sesi di sini: changeUserPassword() sudah
  // memverifikasi password lama, dan justru inilah jalur yang dipakai user sah
  // untuk memulihkan diri. Yang ditutup cuma akun yang ditangguhkan - supaya
  // pemegang sesi lama tidak bisa merebut kembali akun yang baru direset admin.
  const blocked = await requireActiveAccount(session.user.id);
  if (blocked) return { error: blocked };

  const result = await changeUserPassword(session.user.id, formData);
  if (result.ok) revalidatePath("/account");
  return result;
}

// Ganti password menaikkan User.updatedAt, sementara updatedAt dipakai untuk
// mendeteksi sesi basi - sesi yang sekarang otomatis tidak valid lagi. Form
// memanggil ini setelah sukses supaya user tidak ditinggal di sesi rusak.
export async function logoutAfterPasswordChange() {
  await signOut({ redirectTo: "/login" });
}
