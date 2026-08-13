"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { randomToken } from "@/lib/random-token";
import { requireActiveAccount } from "@/lib/account/user-status";
import { getPartnerSession } from "@/lib/partner/session";
import { isAcceptableCallbackUrl, normalizeIpList, parseIpList } from "@/lib/partner/application";

export type MitraResult = { ok?: string; error?: string };

const API_KEY_LENGTH = 40;
const CALLBACK_SECRET_LENGTH = 48;

/**
 * Gerbang bersama seluruh aksi self-service mitra.
 *
 * Mengembalikan partner HANYA kalau akunnya masih aktif dan tidak ditangguhkan.
 * Mitra nonaktif tetap boleh MEMBACA portalnya (lihat getPartnerSession), tapi
 * tidak boleh mengubah konfigurasi — kalau tidak, akun yang sengaja dimatikan
 * admin bisa mengganti IP whitelist-nya sendiri lalu mencoba masuk lagi.
 */
async function requireActivePartner(): Promise<
  { partnerId: string; userId: string; username: string } | { error: string }
> {
  const partner = await getPartnerSession();
  if (!partner) return { error: "Kamu bukan mitra terdaftar." };
  if (!partner.isActive) {
    return { error: "Akun mitra kamu sedang dinonaktifkan admin. Hubungi CS sebelum mengubah konfigurasi." };
  }
  const blocked = await requireActiveAccount(partner.userId);
  if (blocked) return { error: blocked };
  return { partnerId: partner.partnerId, userId: partner.userId, username: partner.username };
}

const configSchema = z.object({
  callbackUrl: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || isAcceptableCallbackUrl(v), {
      message: "URL callback harus https (http hanya boleh untuk localhost saat pengetesan)",
    }),
  serverIps: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || parseIpList(v).ok, {
      message: "Daftar IP tidak valid. Pisahkan dengan koma, contoh: 103.28.14.5, 103.28.14.6",
    }),
});

/**
 * Mitra mengatur sendiri URL callback dan whitelist IP-nya.
 *
 * Ini bagian yang paling banyak menghemat waktu admin: keduanya adalah nilai
 * yang PALING sering berubah di sisi partner (pindah hosting, tambah server,
 * ganti endpoint) dan sebelumnya setiap perubahan harus lewat chat ke admin.
 * Tidak ada risiko baru yang dibuka — mitra hanya bisa mengubah miliknya
 * sendiri, dan mempersempit whitelist justru mengurangi permukaan serangan.
 */
export async function updateMitraConfig(formData: FormData): Promise<MitraResult> {
  const partner = await requireActivePartner();
  if ("error" in partner) return partner;

  const parsed = configSchema.safeParse({
    callbackUrl: formData.get("callbackUrl"),
    serverIps: formData.get("serverIps"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await db.partnerAccount.update({
      where: { id: partner.partnerId },
      data: {
        callbackUrl: parsed.data.callbackUrl,
        ipWhitelist: normalizeIpList(parsed.data.serverIps),
      },
    });
    revalidatePath("/mitra/kredensial");
    revalidatePath("/mitra");
    return {
      ok: parsed.data.serverIps
        ? "Konfigurasi disimpan. Mulai sekarang hanya IP di daftar itu yang bisa memanggil API."
        : "Konfigurasi disimpan. Whitelist IP kosong — semua IP boleh memanggil.",
    };
  } catch (e) {
    console.error("updateMitraConfig: gagal menyimpan", { partnerId: partner.partnerId, error: e });
    return { error: "Gagal menyimpan konfigurasi." };
  }
}

export type MitraSecretResult = MitraResult & { apiKey?: string; callbackSecret?: string };

/**
 * Menampilkan kembali kredensial milik mitra yang sedang login.
 *
 * Ini perbedaan yang disengaja dari panel admin, yang menampilkan kredensial
 * SEKALI lalu tidak pernah lagi. Alasannya bukan inkonsistensi:
 *  - Di panel admin, satu sesi admin yang bocor akan membocorkan API key SEMUA
 *    mitra sekaligus. Di sini seorang mitra hanya bisa membaca miliknya sendiri.
 *  - Mitra memang WAJIB bisa membacanya: skema md5(username+apiKey+ref_id)
 *    menuntut mereka menyimpan key aslinya, dan key yang hilang tanpa jalan
 *    dibaca ulang berarti integrasi harus dimatikan lalu dibangun ulang.
 *
 * Diambil lewat aksi (bukan dikirim bersama HTML halaman) supaya rahasianya
 * hanya melintas saat benar-benar diminta, dan tidak pernah ikut mengendap di
 * sumber halaman atau cache browser.
 */
export async function revealMitraCredentials(): Promise<MitraSecretResult> {
  const partner = await requireActivePartner();
  if ("error" in partner) return partner;

  const account = await db.partnerAccount.findUnique({
    where: { id: partner.partnerId },
    select: { apiKeyEnc: true, callbackSecretEnc: true },
  });
  if (!account) return { error: "Akun mitra tidak ditemukan." };

  try {
    return {
      apiKey: decryptJson<string>(account.apiKeyEnc),
      callbackSecret: account.callbackSecretEnc ? decryptJson<string>(account.callbackSecretEnc) : undefined,
    };
  } catch (e) {
    console.error("revealMitraCredentials: gagal dekripsi", { partnerId: partner.partnerId, error: e });
    return { error: "Kredensial tidak bisa dibaca. Terbitkan ulang API key atau hubungi admin." };
  }
}

/**
 * Mitra menerbitkan ulang API key-nya sendiri.
 *
 * Sebelumnya ini hanya bisa dilakukan admin, dan konsekuensinya buruk: mitra
 * yang API key-nya bocor harus menunggu admin bangun sementara siapa pun yang
 * memegang key itu bisa menghabiskan saldonya. Kebocoran kredensial adalah
 * keadaan darurat — orang yang paling ingin menghentikannya harus bisa
 * menghentikannya sendiri, saat itu juga.
 */
export async function regenerateMitraApiKey(): Promise<MitraSecretResult> {
  const partner = await requireActivePartner();
  if ("error" in partner) return partner;

  const apiKey = randomToken(API_KEY_LENGTH);
  try {
    await db.partnerAccount.update({
      where: { id: partner.partnerId },
      data: { apiKeyEnc: encryptJson(apiKey) },
    });
    revalidatePath("/mitra/kredensial");
    return {
      // Peringatan ini bagian dari fungsinya: begitu tombol ditekan, integrasi
      // yang sedang berjalan MATI sampai key barunya dipasang.
      ok: "API key baru terbit. Key lama langsung tidak berlaku — pasang yang baru di sistemmu sekarang.",
      apiKey,
    };
  } catch (e) {
    console.error("regenerateMitraApiKey: gagal", { partnerId: partner.partnerId, error: e });
    return { error: "Gagal menerbitkan API key baru." };
  }
}

export async function regenerateMitraCallbackSecret(): Promise<MitraSecretResult> {
  const partner = await requireActivePartner();
  if ("error" in partner) return partner;

  const callbackSecret = randomToken(CALLBACK_SECRET_LENGTH);
  try {
    await db.partnerAccount.update({
      where: { id: partner.partnerId },
      data: { callbackSecretEnc: encryptJson(callbackSecret) },
    });
    revalidatePath("/mitra/kredensial");
    return { ok: "Secret callback baru terbit. Callback berikutnya ditandatangani dengan secret ini.", callbackSecret };
  } catch (e) {
    console.error("regenerateMitraCallbackSecret: gagal", { partnerId: partner.partnerId, error: e });
    return { error: "Gagal menerbitkan secret callback baru." };
  }
}

/**
 * Menjadwalkan ulang callback untuk satu order.
 *
 * Job baru, bukan menghidupkan lagi job yang FAILED: `runDueJobs` sudah selesai
 * dengan baris itu (attempts habis), dan menulis ulang statusnya berarti
 * menghapus jejak kegagalan yang justru sedang dilihat mitra. Baris baru
 * membuat riwayatnya bertambah, bukan berubah.
 */
export async function resendMitraCallback(formData: FormData): Promise<MitraResult> {
  const partner = await requireActivePartner();
  if ("error" in partner) return partner;

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { error: "Transaksi tidak dikenal." };

  // Kepemilikan diverifikasi lewat partnerId, bukan sekadar keberadaan order —
  // tanpa ini mitra mana pun bisa memicu callback untuk order milik mitra lain
  // hanya dengan menebak id-nya.
  const order = await db.order.findFirst({
    where: { id: orderId, partnerId: partner.partnerId },
    select: { id: true, status: true },
  });
  if (!order) return { error: "Transaksi tidak ditemukan di akun kamu." };

  const FINAL_STATUSES = ["COMPLETED", "FAILED", "REFUNDED", "EXPIRED"];
  if (!FINAL_STATUSES.includes(order.status)) {
    return { error: "Transaksi ini belum final. Callback dikirim otomatis begitu statusnya selesai." };
  }

  const account = await db.partnerAccount.findUnique({
    where: { id: partner.partnerId },
    select: { callbackUrl: true },
  });
  if (!account?.callbackUrl) {
    return { error: "Kamu belum mengisi URL callback. Isi dulu di halaman Kredensial." };
  }

  try {
    await db.job.create({ data: { type: "partner-callback", payload: { orderId: order.id }, runAt: new Date() } });
    revalidatePath("/mitra/callback");
    return { ok: "Callback dijadwalkan ulang. Hasilnya muncul di daftar ini dalam beberapa saat." };
  } catch (e) {
    console.error("resendMitraCallback: gagal menjadwalkan", { orderId, error: e });
    return { error: "Gagal menjadwalkan ulang callback." };
  }
}
