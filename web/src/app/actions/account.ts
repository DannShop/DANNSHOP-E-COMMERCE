"use server";

import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/lib/auth";
import { changeUserPassword, type ChangePasswordResult } from "@/lib/account/change-password";
import { requestEmailChange, confirmEmailChange, type ChangeEmailResult } from "@/lib/account/change-email";
import { changeUserName, type ChangeNameResult } from "@/lib/account/change-name";
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

// Langkah 1 ganti email: kirim link konfirmasi ke alamat baru. TIDAK mengubah
// apa pun pada akun - lihat lib/account/change-email.ts.
export async function requestEmailChangeAction(formData: FormData): Promise<ChangeEmailResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Harus login untuk ganti email." };

  // Alasannya sama dengan changePassword di atas: akun yang ditangguhkan tidak
  // boleh dipindahkan ke alamat lain oleh pemegang sesi lama.
  const blocked = await requireActiveAccount(session.user.id);
  if (blocked) return { error: blocked };

  return requestEmailChange(session.user.id, formData);
}

// Langkah 2: dipanggil dari halaman PUBLIK /konfirmasi-email. Sengaja tanpa
// auth() - link-nya dibuka dari inbox baru, sering di perangkat yang belum
// login, dan tokenlah kredensialnya (32 byte acak, hash-nya saja yang disimpan).
export async function confirmEmailChangeAction(formData: FormData): Promise<ChangeEmailResult> {
  const token = formData.get("token");
  return confirmEmailChange(typeof token === "string" ? token : "");
}

export async function changeName(formData: FormData): Promise<ChangeNameResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Harus login untuk ganti nama." };

  const blocked = await requireActiveAccount(session.user.id);
  if (blocked) return { error: blocked };

  const result = await changeUserName(session.user.id, formData);
  if (result.ok) revalidatePath("/account");
  return result;
}

// Menulis apa pun ke tabel User menaikkan User.updatedAt, dan proxy.ts
// membandingkannya dengan yang tersimpan di JWT - sesi yang sekarang otomatis
// tidak valid lagi. Form memanggil ini setelah sukses supaya user tidak
// ditinggal di sesi rusak yang menolak aksi berikutnya tanpa penjelasan.
//
// Dipakai form ganti password DAN ganti nama. (Ganti email tidak memakainya:
// perubahannya baru terjadi di halaman konfirmasi, yang memang tidak berasumsi
// ada sesi sama sekali.)
export async function logoutAfterAccountChange() {
  await signOut({ redirectTo: "/login" });
}
