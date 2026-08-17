"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/base-url";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";
import { requireActiveAccount } from "@/lib/account/user-status";
import {
  accountRegisterSchema,
  createResellerUser,
  issueActivationToken,
  publicRegisterSchema,
} from "@/lib/reseller/registration";
import { startTierPurchase } from "@/lib/reseller/purchase";
import {
  sendResellerActivationEmail,
  sendResellerExistingAccountEmail,
} from "@/lib/notify/email";
import type { PaymentActions } from "@/lib/midtrans/client";

export type ActionResult = { ok?: string; error?: string };

// Jawaban yang SELALU sama untuk form publik, apa pun yang terjadi di belakang.
//
// Ini penjaga anti-penyisiran, bukan kemalasan. Kalau form menjawab "email
// sudah terdaftar", ia berubah jadi alat untuk menguji email mana yang punya
// akun di toko ini - kemampuan yang sengaja ditutup di form daftar biasa
// (lihat registerAction, yang selalu mengalihkan ke halaman yang sama).
// Menutupnya di satu pintu tapi membukanya di pintu sebelah = tidak menutup
// apa pun.
const PUBLIC_ACK =
  "Pendaftaran diterima. Cek emailmu untuk link aktivasi — berlaku 30 menit.";

/**
 * Pendaftaran dari halaman publik: orang yang (mungkin) belum punya akun.
 *
 * Tiga cabang, satu jawaban:
 *   1. email belum terdaftar  -> buat akun + reseller, kirim link aktivasi
 *   2. email sudah terdaftar, belum jadi reseller -> kirim email pengarah ke
 *      menu Reseller di dalam akunnya (di sana email & passwordnya terkunci)
 *   3. email sudah terdaftar & sudah reseller -> kirim link aktivasi lagi kalau
 *      belum aktif; kalau sudah aktif, tidak ada yang perlu dikirim
 */
export async function registerResellerPublic(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const ip = extractIp(await headers());
  // Membuat akun + mengirim email adalah dua hal yang mahal disalahgunakan.
  // Batasnya per IP, sejalan dengan /register yang sudah dibatasi di proxy.ts.
  const limit = await checkRateLimit(`reseller-register:ip:${ip}`, 5, 60 * 60_000);
  if (!limit.allowed) {
    return { error: "Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti." };
  }

  const parsed = publicRegisterSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    businessName: formData.get("businessName"),
    phone: formData.get("phone"),
    referralCode: formData.get("referralCode") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  const existing = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true, name: true, resellerAccount: { select: { activatedAt: true } } },
  });

  const baseUrl = await getBaseUrl();

  if (!existing) {
    const userId = await createResellerUser({
      name: input.name,
      email: input.email,
      password: input.password,
      businessName: input.businessName,
      phone: input.phone,
      referralCode: input.referralCode,
    });
    const token = await issueActivationToken(userId);
    // after(): pengiriman email tidak boleh menahan respons, dan yang lebih
    // penting - tidak boleh membuat cabang "email baru" terasa lebih lambat
    // daripada cabang "email sudah ada". Selisih waktu itu sendiri sudah cukup
    // untuk menyisir email mana yang terdaftar, persis yang ditutup PUBLIC_ACK.
    after(async () => {
      await sendResellerActivationEmail(input.email, {
        userName: input.name,
        activationUrl: `${baseUrl}/reseller/aktivasi?token=${token}`,
      });
    });
    return { ok: PUBLIC_ACK };
  }

  if (!existing.resellerAccount) {
    after(async () => {
      await sendResellerExistingAccountEmail(input.email, {
        userName: existing.name,
        resellerUrl: `${baseUrl}/account/reseller`,
      });
    });
    return { ok: PUBLIC_ACK };
  }

  if (!existing.resellerAccount.activatedAt) {
    const token = await issueActivationToken(existing.id);
    after(async () => {
      await sendResellerActivationEmail(input.email, {
        userName: existing.name,
        activationUrl: `${baseUrl}/reseller/aktivasi?token=${token}`,
      });
    });
  }
  return { ok: PUBLIC_ACK };
}

/**
 * Pendaftaran dari DALAM akun.
 *
 * Email & password tidak diminta sama sekali - keduanya sudah dimiliki, dan
 * meminta ulang hanya membuka kemungkinan salah ketik pada identitas yang sudah
 * benar. Link aktivasi tetap dikirim ke alamat yang terdaftar: itu satu-satunya
 * cara membuktikan inbox-nya memang bisa dibuka orang ini.
 */
export async function registerResellerFromAccount(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Harus login." };
  const blocked = await requireActiveAccount(session.user.id, session.user.updatedAt);
  if (blocked) return { error: blocked };

  const parsed = accountRegisterSchema.safeParse({
    businessName: formData.get("businessName"),
    phone: formData.get("phone"),
    referralCode: formData.get("referralCode") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const me = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { name: true, email: true, resellerAccount: { select: { activatedAt: true } } },
  });
  if (me.resellerAccount?.activatedAt) {
    return { error: "Akun resellermu sudah aktif." };
  }

  // upsert: pendaftar yang mengulang form (mis. karena link aktivasinya keburu
  // kedaluwarsa) memperbarui datanya, bukan menabrak unique constraint dengan
  // galat yang tidak bisa dia mengerti.
  await db.resellerAccount.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      businessName: parsed.data.businessName,
      phone: parsed.data.phone,
      referralCode: parsed.data.referralCode || null,
    },
    update: {
      businessName: parsed.data.businessName,
      phone: parsed.data.phone,
      referralCode: parsed.data.referralCode || null,
    },
  });

  const token = await issueActivationToken(session.user.id);
  const baseUrl = await getBaseUrl();
  after(async () => {
    await sendResellerActivationEmail(me.email, {
      userName: me.name,
      activationUrl: `${baseUrl}/reseller/aktivasi?token=${token}`,
    });
  });

  revalidatePath("/account/reseller");
  return { ok: `Link aktivasi dikirim ke ${me.email}. Berlaku 30 menit.` };
}

/** Mengirim ulang link aktivasi dari dalam akun. */
export async function resendResellerActivation(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Harus login." };

  const limit = await checkRateLimit(`reseller-activation:${session.user.id}`, 5, 60 * 60_000);
  if (!limit.allowed) return { error: "Terlalu sering meminta link baru. Coba lagi nanti." };

  const me = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { name: true, email: true, resellerAccount: { select: { activatedAt: true } } },
  });
  if (!me.resellerAccount) return { error: "Kamu belum mengisi formulir pendaftaran reseller." };
  if (me.resellerAccount.activatedAt) return { error: "Akun resellermu sudah aktif." };

  const token = await issueActivationToken(session.user.id);
  const baseUrl = await getBaseUrl();
  after(async () => {
    await sendResellerActivationEmail(me.email, {
      userName: me.name,
      activationUrl: `${baseUrl}/reseller/aktivasi?token=${token}`,
    });
  });

  revalidatePath("/account/reseller");
  return { ok: `Link aktivasi baru dikirim ke ${me.email}. Link lama otomatis hangus.` };
}

export interface BuyTierResult {
  error?: string;
  purchaseId?: string;
  actions?: PaymentActions;
}

/** Membeli / menaikkan paket reseller. Uangnya lewat Midtrans, bukan saldo. */
export async function buyResellerTier(
  _prev: BuyTierResult | undefined,
  formData: FormData,
): Promise<BuyTierResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Harus login." };
  const blocked = await requireActiveAccount(session.user.id, session.user.updatedAt);
  if (blocked) return { error: blocked };

  const tierId = String(formData.get("tierId") ?? "");
  const methodCode = String(formData.get("paymentMethod") ?? "");
  if (!tierId) return { error: "Pilih paket dulu." };
  if (!methodCode) return { error: "Pilih metode pembayaran dulu." };

  const result = await startTierPurchase({ userId: session.user.id, tierId, methodCode });
  if (!result.error) revalidatePath("/account/reseller");
  return result;
}
