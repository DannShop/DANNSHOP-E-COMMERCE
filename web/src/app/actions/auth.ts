"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ResetPasswordResult } from "@/lib/account/reset-password";
import { requestPasswordReset, resetPasswordWithToken } from "@/lib/account/reset-password";
import { signIn, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/validation/auth";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";

// Password dummy dipakai HANYA untuk membuang waktu (samakan cost bcrypt),
// tidak pernah dibandingkan/disimpan - mencegah timing side-channel di registerAction
// (cabang admin-email/email-sudah-ada vs cabang create-baru harus impas waktunya).
const TIMING_DUMMY_PASSWORD = "dummy-timing-normalization-only";

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email) {
    const emailLimit = await checkRateLimit(`login:email:${email}`, 20, 60 * 60_000);
    if (!emailLimit.allowed) return { error: "Terlalu banyak percobaan login untuk akun ini, coba lagi nanti." };
  }

  // Lookup role duluan buat nentuin tujuan redirect (admin -> /admin, user -> /account).
  // Query ini SELALU dijalankan terlepas email ada/tidak/passwordnya benar, jadi tidak
  // menambah timing side-channel baru — signIn di bawah tetap satu-satunya yang
  // memvalidasi password asli (pola timing-safe sama seperti TIMING_DUMMY_PASSWORD
  // di registerAction).
  const user = email ? await db.user.findUnique({ where: { email }, select: { role: true } }) : null;
  const redirectTo = user?.role === "ADMIN" ? "/admin" : "/account";

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo,
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Email atau password salah." };
    }
    throw err; // redirect() dari signIn dilempar sebagai error — biarkan lewat
  }
}

export async function registerAction(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid." };
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (parsed.data.email === adminEmail) {
    await hashPassword(TIMING_DUMMY_PASSWORD);
    redirect("/login?registered=1");
  }

  const existing = await db.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (!existing) {
    const passwordHash = await hashPassword(parsed.data.password);
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          passwordHash,
        },
      });
      await tx.wallet.create({ data: { userId: user.id } });
    });
  } else {
    await hashPassword(TIMING_DUMMY_PASSWORD);
  }

  redirect("/login?registered=1");
}

export async function forgotPasswordAction(
  _prev: ResetPasswordResult | undefined,
  formData: FormData
): Promise<ResetPasswordResult> {
  const ip = extractIp(await headers());
  return requestPasswordReset(formData, ip);
}

export async function resetPasswordAction(
  _prev: ResetPasswordResult | undefined,
  formData: FormData
): Promise<ResetPasswordResult> {
  return resetPasswordWithToken(formData);
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
