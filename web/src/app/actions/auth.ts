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
import { checkCredentials } from "@/lib/auth/credentials";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/validation/auth";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";

// Password dummy dipakai HANYA untuk membuang waktu (samakan cost bcrypt),
// tidak pernah dibandingkan/disimpan - mencegah timing side-channel di registerAction
// (cabang admin-email/email-sudah-ada vs cabang create-baru harus impas waktunya).
const TIMING_DUMMY_PASSWORD = "dummy-timing-normalization-only";

export interface LoginState {
  error?: string;
  /**
   * Password sudah benar, tapi akun ini memakai 2FA — form berpindah ke langkah
   * kedua. TIDAK ada sesi yang terbit saat nilai ini dikembalikan.
   */
  needsTotp?: boolean;
}

export async function loginAction(
  _prev: LoginState | undefined,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email) {
    const emailLimit = await checkRateLimit(`login:email:${email}`, 20, 60 * 60_000);
    if (!emailLimit.allowed) return { error: "Terlalu banyak percobaan login untuk akun ini, coba lagi nanti." };
  }

  // ===== Langkah pertama: email + password saja =====
  //
  // Dijalankan HANYA saat kode belum diisi. Kalau akunnya memakai 2FA, form
  // dikembalikan ke langkah kedua tanpa satu pun sesi diterbitkan. Kalau tidak,
  // fungsi ini lanjut ke signIn seperti biasa - jadi akun tanpa 2FA tidak pernah
  // melihat langkah kedua sama sekali.
  //
  // Konsekuensi yang disadari dan diterima (keputusan Wildan 2026-08-16):
  // penyerang yang SUDAH memegang password valid jadi tahu akun itu memakai 2FA.
  // Rate limit per email di atas (20/jam) tetap berlaku untuk langkah ini, jadi
  // dia tidak bisa dipakai menyapu daftar password.
  const totpInput = String(formData.get("totp") ?? "").trim();
  if (!totpInput) {
    const cek = await checkCredentials({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (cek.kind === "totp_required") return { needsTotp: true };
    // "invalid" TIDAK dikembalikan sebagai error di sini - biarkan jatuh ke
    // signIn di bawah, supaya jalur gagal tetap satu dan waktu tempuhnya tidak
    // berbeda antara "password salah" dan "password benar tanpa 2FA".
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
      // Di langkah KEDUA, pesannya boleh menyebut kode — form hanya sampai ke
      // sana setelah passwordnya terbukti benar, jadi tidak ada rahasia baru
      // yang dibocorkan, dan "email/password salah" di layar yang cuma meminta
      // enam angka justru membuat orang mengira harus mengulang dari awal.
      //
      // `needsTotp` ikut dikembalikan supaya form TETAP di langkah kedua saat
      // kodenya salah. Tanpa itu, satu salah ketik melempar pembeli kembali ke
      // layar email dan dia harus mengetik ulang semuanya.
      if (totpInput) {
        return { needsTotp: true, error: "Kode autentikasi salah atau sudah kedaluwarsa." };
      }
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
