"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";
import { activateReseller } from "@/lib/reseller/registration";

export type ActionResult = { ok?: string; error?: string };

// Dipisah dari actions/reseller.ts dengan sengaja: berkas ini dipanggil dari
// halaman PUBLIK yang tidak menuntut sesi sama sekali, sementara yang di sana
// semuanya menuntut login. Menaruh keduanya bersama membuat "mana yang butuh
// sesi" jadi hal yang harus diingat baris per baris.

export async function activateResellerAction(formData: FormData): Promise<ActionResult> {
  // Token 32 byte acak praktis mustahil ditebak, tapi batas per IP tetap ada
  // supaya percobaan menebaknya tidak gratis - pola yang sama dipakai jalur
  // token publik lain (order-lookup, forgot-password).
  const ip = extractIp(await headers());
  const limit = await checkRateLimit(`reseller-activate:ip:${ip}`, 20, 60_000);
  if (!limit.allowed) return { error: "Terlalu banyak percobaan. Coba lagi sebentar." };

  const result = await activateReseller(String(formData.get("token") ?? ""));
  if (!result.ok) return { error: result.error };

  revalidatePath("/account/reseller");
  return {
    ok: "Akun resellermu aktif. Kamu sekarang bisa bertransaksi seperti biasa — ambil paket berbayar kapan saja untuk mendapat harga lebih murah.",
  };
}
