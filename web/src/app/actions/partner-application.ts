"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireActiveAccount } from "@/lib/account/user-status";
import { normalizeIpList, partnerApplicationSchema } from "@/lib/partner/application";
import { startPartnerJoinPayment } from "@/lib/partner/join-purchase";
import type { PaymentActions } from "@/lib/midtrans/client";

export type ApplicationResult = { ok?: string; error?: string };

/**
 * Pengajuan bergabung jadi mitra H2H — dikirim dari /account/mitra.
 *
 * Sengaja TIDAK ada versi publiknya. Formnya hidup di dalam panel user, jadi
 * pemohon dijamin sudah punya akun DannShop: kita sudah memegang email, riwayat
 * order, dan riwayat deposit mereka sebelum satu baris price list pun keluar.
 * Price list adalah struktur harga dan margin kita — membukanya untuk pendaftar
 * anonim berarti menyerahkannya ke kompetitor yang cukup mengisi formulir.
 */
export async function submitPartnerApplication(formData: FormData): Promise<ApplicationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Kamu harus login dulu." };
  const userId = session.user.id;

  // Gerbang yang sama dengan seluruh jalur uang lain. Akun yang ditangguhkan
  // tidak boleh mengantre jadi mitra — kalau tidak, ban bisa dilewati cuma
  // dengan menunggu pengajuan disetujui.
  const blocked = await requireActiveAccount(userId, session.user.updatedAt);
  if (blocked) return { error: blocked };

  // Akun admin sengaja tidak boleh jadi mitra: kredensial API yang bocor akan
  // membawa serta hak admin pemiliknya lewat jalur login yang sama. Aturan ini
  // sudah berlaku di createPartnerAction dan harus sama di jalur mandiri ini.
  if (session.user.role === "ADMIN") {
    return { error: "Akun admin tidak bisa mendaftar sebagai mitra. Pakai akun terpisah." };
  }

  const existingAccount = await db.partnerAccount.findUnique({ where: { userId }, select: { id: true } });
  if (existingAccount) return { error: "Akun kamu sudah terdaftar sebagai mitra." };

  const pending = await db.partnerApplication.findFirst({
    where: { userId, status: "PENDING" },
    select: { id: true },
  });
  if (pending) return { error: "Pengajuan kamu masih dalam antrean peninjauan." };

  const parsed = partnerApplicationSchema.safeParse({
    businessName: formData.get("businessName"),
    businessType: formData.get("businessType"),
    businessCity: formData.get("businessCity"),
    websiteUrl: formData.get("websiteUrl"),
    picName: formData.get("picName"),
    picPhone: formData.get("picPhone"),
    picRole: formData.get("picRole"),
    platform: formData.get("platform"),
    serverIps: formData.get("serverIps"),
    callbackUrl: formData.get("callbackUrl"),
    monthlyVolume: formData.get("monthlyVolume"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await db.partnerApplication.create({
      data: {
        userId,
        businessName: parsed.data.businessName,
        businessType: parsed.data.businessType,
        businessCity: parsed.data.businessCity,
        websiteUrl: parsed.data.websiteUrl,
        picName: parsed.data.picName,
        picPhone: parsed.data.picPhone,
        picRole: parsed.data.picRole,
        platform: parsed.data.platform,
        // Disimpan dalam bentuk kanonik "a, b, c" supaya nilainya bisa disalin
        // apa adanya ke PartnerAccount.ipWhitelist saat disetujui, tanpa
        // pembersihan kedua yang bisa berbeda aturannya.
        serverIps: normalizeIpList(parsed.data.serverIps),
        callbackUrl: parsed.data.callbackUrl,
        monthlyVolume: parsed.data.monthlyVolume,
        notes: parsed.data.notes,
      },
    });
    revalidatePath("/account/mitra");
    return { ok: "Pengajuan terkirim. Kami akan meninjau dan mengabari lewat email/WhatsApp." };
  } catch (e) {
    console.error("submitPartnerApplication: gagal menyimpan pengajuan", { userId, error: e });
    return { error: "Gagal mengirim pengajuan, coba lagi." };
  }
}

/**
 * Membatalkan pengajuan yang masih PENDING.
 *
 * Dihapus, bukan ditandai CANCELLED: pengajuan yang belum ditinjau tidak
 * menyimpan keputusan apa pun yang perlu diaudit, dan menyisakannya cuma
 * membuat antrean admin penuh baris mati.
 */
export async function cancelPartnerApplication(): Promise<ApplicationResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Kamu harus login dulu." };

  try {
    const result = await db.partnerApplication.deleteMany({
      where: { userId: session.user.id, status: "PENDING" },
    });
    if (result.count === 0) return { error: "Tidak ada pengajuan yang bisa dibatalkan." };
    revalidatePath("/account/mitra");
    return { ok: "Pengajuan dibatalkan. Kamu bisa mengajukan lagi kapan saja." };
  } catch (e) {
    console.error("cancelPartnerApplication: gagal membatalkan", { userId: session.user.id, error: e });
    return { error: "Gagal membatalkan pengajuan." };
  }
}

export type PayJoinResult = { error?: string; applicationId?: string; actions?: PaymentActions };

/**
 * Menerbitkan tagihan biaya join mitra.
 *
 * Begitu lunas, akun mitra terbit OTOMATIS lewat settleFromMidtrans() - tidak
 * ada langkah persetujuan admin di antaranya. Lihat settlePartnerJoin().
 */
export async function payPartnerJoinFee(
  _prev: PayJoinResult | undefined,
  formData: FormData,
): Promise<PayJoinResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Kamu harus login dulu." };
  // Gerbang yang sama dengan seluruh jalur uang lain - akun yang ditangguhkan
  // tidak boleh menerbitkan tagihan.
  const blocked = await requireActiveAccount(session.user.id, session.user.updatedAt);
  if (blocked) return { error: blocked };

  const methodCode = String(formData.get("paymentMethod") ?? "");
  if (!methodCode) return { error: "Pilih metode pembayaran dulu." };

  const result = await startPartnerJoinPayment({ userId: session.user.id, methodCode });
  if (!result.error) revalidatePath("/account/mitra");
  return result;
}
