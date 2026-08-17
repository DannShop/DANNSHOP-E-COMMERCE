import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { encryptJson } from "@/lib/crypto";
import { randomToken } from "@/lib/random-token";
import { suggestPartnerUsername } from "@/lib/partner/application";

// Menerbitkan akun mitra dari sebuah pengajuan.
//
// ⚠️ SATU-SATUNYA tempat akun mitra lahir. Ada DUA pemicu yang berbeda jauh -
// persetujuan manual admin dan pelunasan biaya join lewat Midtrans - dan
// keduanya harus menghasilkan akun yang identik. Sebelum ini disatukan,
// menambahkan satu langkah (mis. membuat Wallet di depan) berarti mengingat
// mengubahnya di dua tempat, dan yang terlupa tidak menghasilkan error apa pun:
// mitra cuma mendapat akun yang diam-diam kurang lengkap.

export const API_KEY_LENGTH = 40;
export const CALLBACK_SECRET_LENGTH = 48;

export interface ActivateInput {
  applicationId: string;
  userId: string;
  username: string;
  callbackUrl: string | null;
  serverIps: string | null;
  /** Admin yang menyetujui. null = terbit otomatis setelah pembayaran lunas. */
  reviewedById: string | null;
}

/**
 * Membuat PartnerAccount + Wallet + menandai pengajuan APPROVED, dalam satu
 * transaksi.
 *
 * Menerima `tx` supaya pemanggil bisa menyertakannya ke dalam transaksi yang
 * lebih besar (settlement melakukan itu: klaim pembayaran dan penerbitan akun
 * harus jadi/gagal bersama, kalau tidak ada uang masuk tanpa akun terbit).
 */
export async function activatePartnerFromApplication(
  tx: Prisma.TransactionClient,
  input: ActivateInput,
): Promise<{ apiKey: string; callbackSecret: string }> {
  const apiKey = randomToken(API_KEY_LENGTH);
  const callbackSecret = randomToken(CALLBACK_SECRET_LENGTH);

  await tx.partnerAccount.create({
    data: {
      userId: input.userId,
      username: input.username,
      // Kredensial DIENKRIPSI, bukan di-hash: skema tanda tangan md5 menuntut
      // server menghitung ulang hash yang sama, jadi kunci aslinya harus bisa
      // dibaca kembali. Lihat catatan panjang di schema.prisma.
      apiKeyEnc: encryptJson(apiKey),
      callbackSecretEnc: encryptJson(callbackSecret),
      // Data teknis yang sudah diisi di formulir dipakai langsung - menanyakan
      // ulang hal yang sudah dijawab adalah cara tercepat membuat mitra baru
      // tertahan rc 12 di panggilan pertamanya.
      callbackUrl: input.callbackUrl,
      ipWhitelist: input.serverIps,
      applicationId: input.applicationId,
    },
  });

  // Dompet dibuat di depan supaya mitra bisa langsung isi saldo - tanpa ini,
  // baris Wallet baru lahir saat deposit pertama dan cek saldo membalas 0
  // tanpa penjelasan.
  await tx.wallet.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId },
    update: {},
  });

  await tx.partnerApplication.update({
    where: { id: input.applicationId },
    data: {
      status: "APPROVED",
      reviewedById: input.reviewedById,
      reviewedAt: new Date(),
      reviewNote: null,
    },
  });

  return { apiKey, callbackSecret };
}

/**
 * Username yang dijamin belum terpakai, diturunkan dari nama usaha.
 *
 * Dipakai jalur OTOMATIS (pelunasan biaya join), yang tidak punya admin untuk
 * memilihkan nama. Jalur manual tetap membiarkan admin mengetik sendiri.
 *
 * Tabrakan diselesaikan dengan menambahkan angka, bukan dengan menolak: nama
 * usaha yang sama persis adalah hal wajar, dan pembayaran yang sudah lunas
 * tidak boleh gagal berubah jadi akun hanya karena namanya bentrok.
 */
export async function resolveAvailableUsername(businessName: string): Promise<string> {
  const base = suggestPartnerUsername(businessName) || "mitra";
  const existing = await db.partnerAccount.findMany({
    where: { username: { startsWith: base } },
    select: { username: true },
  });
  const taken = new Set(existing.map((p) => p.username));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}${i}`.slice(0, 40);
    if (!taken.has(candidate)) return candidate;
  }
  // Praktis mustahil sampai sini; kalau toh terjadi, acak lebih baik daripada
  // melempar galat pada pembayaran yang uangnya sudah masuk.
  return `${base.slice(0, 32)}${randomToken(6)}`.toLowerCase();
}
