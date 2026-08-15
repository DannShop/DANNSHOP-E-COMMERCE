"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { sendWelcomeEmail } from "@/lib/notify/email";
import { formatUserRegisteredMessage, notifyTelegram } from "@/lib/notify/telegram";
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
      // Kosong untuk akun tanpa 2FA — authorize() mengabaikannya kecuali akunnya
      // memang mengaktifkan 2FA.
      totp: formData.get("totp") ?? "",
      redirectTo,
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      // Satu kalimat untuk password salah DAN kode 2FA salah, dengan sengaja:
      // membedakannya akan memberi tahu penebak password bahwa passwordnya sudah
      // benar dan tinggal faktor kedua — persis informasi yang paling berharga
      // bagi penyerang yang sudah memegang password bocor.
      return { error: "Email, password, atau kode autentikasi salah." };
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

    // after() - BUKAN await. Fungsi ini sengaja dibuat impas waktunya antara
    // cabang "email baru" dan "email sudah ada" (lihat TIMING_DUMMY_PASSWORD di
    // atas) supaya orang luar tidak bisa menebak email mana yang terdaftar dari
    // selisih waktu respons. Menunggu kiriman email + Telegram di sini akan
    // menambah ratusan milidetik HANYA pada cabang email baru, yang justru
    // membocorkan persis apa yang susah payah ditutup itu.
    //
    // after() juga bukan sekadar promise yang dilepas begitu saja: di runtime
    // serverless, promise yang tidak ditunggu bisa mati saat respons dikirim.
    // after() menjamin tugasnya tetap dijalankan sampai selesai setelahnya.
    after(async () => {
      await sendWelcomeEmail({ name: parsed.data.name, email: parsed.data.email });
      await notifyTelegram(
        "user_registered",
        formatUserRegisteredMessage({ name: parsed.data.name, email: parsed.data.email }),
      );
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
