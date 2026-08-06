"use server";

import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/lib/auth";
import { changeUserPassword, type ChangePasswordResult } from "@/lib/account/change-password";

export async function changePassword(formData: FormData): Promise<ChangePasswordResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Harus login untuk ganti password." };

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
