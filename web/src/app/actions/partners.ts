"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { encryptJson } from "@/lib/crypto";
import { randomToken } from "@/lib/random-token";
import { requireAdminSession } from "@/lib/auth/admin-gate";
import { activatePartnerFromApplication } from "@/lib/partner/activate";
import { parsePartnerBenefits } from "@/lib/membership/benefits";
import { savePartnerPackage, type PartnerPackage } from "@/lib/partner/package";

export type ActionResult = { ok?: string; error?: string };
/** Kredensial dikembalikan SEKALI di sini dan tidak pernah bisa dibaca lagi lewat UI. */
export type SecretResult = ActionResult & { username?: string; apiKey?: string; callbackSecret?: string };

const requireAdmin = () => requireAdminSession("system.manage");

async function logAdmin(adminId: string, action: string, targetId: string, detail?: object) {
  await db.adminActionLog.create({ data: { adminId, action, targetType: "partner", targetId, detail } });
}

const API_KEY_LENGTH = 40;
const CALLBACK_SECRET_LENGTH = 48;

// Username partner dipakai apa adanya di dalam tanda tangan md5, jadi bentuknya
// dikunci ketat: spasi/karakter aneh membuat partner salah menyusun string yang
// di-hash dan menghasilkan "signature salah" yang tidak akan pernah mereka temukan.
const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username minimal 3 karakter")
  .max(40, "Username maksimal 40 karakter")
  .regex(/^[a-zA-Z0-9_-]+$/, "Username hanya boleh huruf, angka, garis bawah, dan strip");

// URL callback dibatasi https di production. Bukan formalitas: body callback
// membawa nomor tujuan customer, dan http polos berarti data itu melintas
// terbuka. localhost dikecualikan supaya partner bisa mengetes integrasinya.
const callbackUrlSchema = z
  .string()
  .trim()
  .url("URL callback tidak valid")
  .max(500)
  .refine(
    (u) => {
      try {
        const parsed = new URL(u);
        if (parsed.protocol === "https:") return true;
        return parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
      } catch {
        return false;
      }
    },
    { message: "URL callback harus https (http hanya boleh untuk localhost saat pengetesan)" },
  );

const createSchema = z.object({
  email: z.string().trim().email("Email user tidak valid"),
  username: usernameSchema,
  callbackUrl: z.union([callbackUrlSchema, z.literal("")]).nullish(),
  ipWhitelist: z.string().trim().max(500).nullish(),
});

export async function createPartnerAction(formData: FormData): Promise<SecretResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    username: formData.get("username"),
    callbackUrl: formData.get("callbackUrl") ?? "",
    ipWhitelist: formData.get("ipWhitelist") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, role: true, bannedAt: true, partnerAccount: { select: { id: true } } },
  });
  if (!user) {
    return { error: `User dengan email ${parsed.data.email} belum ada. Minta partner mendaftar dulu lewat /register.` };
  }
  if (user.partnerAccount) return { error: "User ini sudah punya akun partner." };
  if (user.bannedAt) return { error: "User ini sedang ditangguhkan." };
  // Akun ADMIN sengaja tidak boleh dijadikan partner: kredensial API yang bocor
  // akan membawa serta hak admin pemiliknya lewat jalur login yang sama.
  if (user.role === "ADMIN") return { error: "Akun admin tidak boleh dipakai sebagai akun partner." };

  const apiKey = randomToken(API_KEY_LENGTH);
  const callbackSecret = randomToken(CALLBACK_SECRET_LENGTH);

  try {
    const partner = await db.partnerAccount.create({
      data: {
        userId: user.id,
        username: parsed.data.username,
        apiKeyEnc: encryptJson(apiKey),
        callbackSecretEnc: encryptJson(callbackSecret),
        callbackUrl: parsed.data.callbackUrl || null,
        ipWhitelist: parsed.data.ipWhitelist || null,
      },
    });
    // Dompet dibuat di depan supaya admin bisa langsung mengisi saldo awal —
    // tanpa ini, partner baru tidak punya baris Wallet sampai deposit pertama
    // dan cek saldo membalas 0 tanpa penjelasan.
    await db.wallet.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });

    // Nilai mentahnya TIDAK pernah masuk AdminActionLog — log admin bisa dibaca
    // admin lain dan diekspor; kredensial di dalamnya jadi salinan permanen.
    await logAdmin(admin.adminId, "partner.create", partner.id, { username: partner.username, email: parsed.data.email });
    revalidatePath("/admin/partners");
    return {
      ok: "Akun partner dibuat. Salin kredensial di bawah sekarang — tidak bisa dilihat lagi.",
      username: partner.username,
      apiKey,
      callbackSecret,
    };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Username partner itu sudah dipakai." };
    }
    console.error("createPartnerAction: gagal membuat partner", { error: e });
    return { error: "Gagal membuat akun partner." };
  }
}

const updateSchema = z.object({
  partnerId: z.string().min(1),
  callbackUrl: z.union([callbackUrlSchema, z.literal("")]).nullish(),
  ipWhitelist: z.string().trim().max(500).nullish(),
  // Checkbox yang tidak dicentang mengirim `null`, bukan `undefined` — .nullish()
  // wajib di sini, lihat tests/form-checkbox-null.test.ts.
  isActive: z.union([z.literal("on"), z.literal("")]).nullish(),
});

export async function updatePartnerAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = updateSchema.safeParse({
    partnerId: formData.get("partnerId"),
    callbackUrl: formData.get("callbackUrl") ?? "",
    ipWhitelist: formData.get("ipWhitelist") ?? "",
    isActive: formData.get("isActive") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await db.partnerAccount.update({
      where: { id: parsed.data.partnerId },
      data: {
        callbackUrl: parsed.data.callbackUrl || null,
        ipWhitelist: parsed.data.ipWhitelist || null,
        isActive: parsed.data.isActive === "on",
      },
    });
    await logAdmin(admin.adminId, "partner.update", parsed.data.partnerId, {
      isActive: parsed.data.isActive === "on",
    });
    revalidatePath("/admin/partners");
    return { ok: "Konfigurasi partner disimpan." };
  } catch (e) {
    console.error("updatePartnerAction: gagal menyimpan", { error: e });
    return { error: "Gagal menyimpan konfigurasi partner." };
  }
}

export async function regeneratePartnerKeyAction(formData: FormData): Promise<SecretResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const partnerId = String(formData.get("partnerId") ?? "");
  if (!partnerId) return { error: "Partner tidak dikenal." };

  const apiKey = randomToken(API_KEY_LENGTH);
  try {
    const partner = await db.partnerAccount.update({
      where: { id: partnerId },
      data: { apiKeyEnc: encryptJson(apiKey) },
      select: { username: true },
    });
    await logAdmin(admin.adminId, "partner.regenerate_key", partnerId);
    revalidatePath("/admin/partners");
    return {
      // Peringatan ini bagian dari fungsinya: begitu tombol ditekan, integrasi
      // partner MATI sampai mereka memasang key barunya.
      ok: "API key baru dibuat. Key lama langsung tidak berlaku — kirim yang baru ke partner sekarang.",
      username: partner.username,
      apiKey,
    };
  } catch (e) {
    console.error("regeneratePartnerKeyAction: gagal", { error: e });
    return { error: "Gagal membuat API key baru." };
  }
}

/**
 * Menyetujui pengajuan mitra: menerbitkan kredensial dan menyalakan akunnya.
 *
 * Dijalankan dalam SATU transaksi. Kalau tidak, kegagalan di tengah bisa
 * meninggalkan dua bentuk kekacauan yang sama-sama sulit dilihat: pengajuan
 * yang sudah APPROVED tanpa akun partner (mitra melihat "disetujui" tapi
 * portalnya kosong), atau akun partner hidup dengan pengajuan yang masih
 * mengantre (admin menyetujuinya dua kali).
 *
 * Kredensialnya SENGAJA tidak dikembalikan ke layar admin. Mitra membacanya
 * sendiri di /mitra/kredensial, jadi rahasianya tidak pernah singgah di layar,
 * clipboard, atau chat orang ketiga hanya untuk diteruskan.
 */
export async function approvePartnerApplicationAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) return { error: "Pengajuan tidak dikenal." };

  const parsedUsername = usernameSchema.safeParse(formData.get("username"));
  if (!parsedUsername.success) return { error: parsedUsername.error.issues[0].message };
  const username = parsedUsername.data;

  const application = await db.partnerApplication.findUnique({
    where: { id: applicationId },
    include: { user: { select: { id: true, role: true, bannedAt: true, partnerAccount: { select: { id: true } } } } },
  });
  if (!application) return { error: "Pengajuan tidak ditemukan." };
  if (application.status !== "PENDING") return { error: "Pengajuan ini sudah pernah ditinjau." };
  if (application.user.partnerAccount) return { error: "User ini sudah punya akun partner." };
  if (application.user.bannedAt) return { error: "User ini sedang ditangguhkan." };
  if (application.user.role === "ADMIN") return { error: "Akun admin tidak boleh dipakai sebagai akun partner." };

  try {
    // Penerbitan akunnya sendiri ada di lib/partner/activate.ts, dipakai bersama
    // dengan jalur otomatis (pelunasan biaya join lewat Midtrans). Dua salinan
    // yang menyimpang di sini berarti mitra yang lahir lewat jalur berbeda
    // mendapat akun yang diam-diam tidak sama.
    //
    // Jalur ini SENGAJA dipertahankan walau biaya join sudah otomatis: admin
    // tetap perlu bisa menerbitkan akun tanpa pembayaran (mitra yang membayar
    // di luar sistem, kesepakatan khusus, demo).
    await db.$transaction(async (tx) => {
      await activatePartnerFromApplication(tx, {
        applicationId: application.id,
        userId: application.userId,
        username,
        callbackUrl: application.callbackUrl,
        serverIps: application.serverIps,
        reviewedById: admin.adminId,
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Username partner itu sudah dipakai. Pilih yang lain." };
    }
    console.error("approvePartnerApplicationAction: gagal menyetujui", { applicationId, error: e });
    return { error: "Gagal menyetujui pengajuan." };
  }

  await logAdmin(admin.adminId, "partner.application_approve", applicationId, { username });
  revalidatePath("/admin/partnership");
  revalidatePath("/admin/partners");
  return { ok: `Pengajuan disetujui. Kredensial sudah terbit dan bisa dilihat mitra di portalnya.` };
}

const rejectSchema = z.object({
  applicationId: z.string().min(1),
  // Alasan WAJIB dan panjang minimalnya bukan formalitas: teks ini ditampilkan
  // apa adanya ke pemohon di /account/mitra. Penolakan tanpa alasan menghasilkan
  // pengajuan ulang yang identik, lalu tiket CS.
  reviewNote: z.string().trim().min(10, "Alasan penolakan minimal 10 karakter").max(500),
});

export async function rejectPartnerApplicationAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = rejectSchema.safeParse({
    applicationId: formData.get("applicationId"),
    reviewNote: formData.get("reviewNote"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const result = await db.partnerApplication.updateMany({
      // status di klausa where (bukan sekadar id) supaya dua admin yang membuka
      // antrean bersamaan tidak bisa saling menimpa keputusan.
      where: { id: parsed.data.applicationId, status: "PENDING" },
      data: {
        status: "REJECTED",
        reviewedById: admin.adminId,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote,
      },
    });
    if (result.count === 0) return { error: "Pengajuan ini sudah pernah ditinjau." };

    await logAdmin(admin.adminId, "partner.application_reject", parsed.data.applicationId);
    revalidatePath("/admin/partnership");
    return { ok: "Pengajuan ditolak. Alasannya sudah terlihat oleh pemohon." };
  } catch (e) {
    console.error("rejectPartnerApplicationAction: gagal menolak", { error: e });
    return { error: "Gagal menolak pengajuan." };
  }
}

export async function regenerateCallbackSecretAction(formData: FormData): Promise<SecretResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const partnerId = String(formData.get("partnerId") ?? "");
  if (!partnerId) return { error: "Partner tidak dikenal." };

  const callbackSecret = randomToken(CALLBACK_SECRET_LENGTH);
  try {
    const partner = await db.partnerAccount.update({
      where: { id: partnerId },
      data: { callbackSecretEnc: encryptJson(callbackSecret) },
      select: { username: true },
    });
    await logAdmin(admin.adminId, "partner.regenerate_callback_secret", partnerId);
    revalidatePath("/admin/partners");
    return {
      ok: "Secret callback baru dibuat. Callback yang dikirim setelah ini memakai secret baru.",
      username: partner.username,
      callbackSecret,
    };
  } catch (e) {
    console.error("regenerateCallbackSecretAction: gagal", { error: e });
    return { error: "Gagal membuat secret callback baru." };
  }
}

/**
 * Menyimpan paket mitra.
 *
 * Persen diterima dari form dalam satuan PERSEN (mis. "2,5") lalu disimpan
 * sebagai basis point (250) - satuan yang sama dengan MembershipTier
 * .discountPercent, supaya effectivePrice() tidak perlu tahu dari mana angkanya
 * datang.
 */
export async function savePartnerPackageAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const toBigInt = (raw: FormDataEntryValue | null): bigint => {
    const n = Number(String(raw ?? "0").replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n)) : 0n;
  };
  const toBp = (raw: FormDataEntryValue | null): number => {
    const n = Number(String(raw ?? "0").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(Math.round(n * 100), 10_000);
  };

  const benefits = parsePartnerBenefits(formData.getAll("benefits").map(String));

  const pkg: PartnerPackage = {
    joinPrice: toBigInt(formData.get("joinPrice")),
    discountPercent: toBp(formData.get("discountPercent")),
    discountFlatManual: toBigInt(formData.get("discountFlatManual")),
    depositBonusPercent: toBp(formData.get("depositBonusPercent")),
    benefits,
    isOpen: formData.get("isOpen") === "on",
  };

  try {
    await savePartnerPackage(pkg);
  } catch (e) {
    console.error("savePartnerPackageAction: gagal menyimpan", { error: e });
    return { error: "Gagal menyimpan paket mitra." };
  }

  await logAdmin(admin.adminId, "partner.save_package", "partner_package", {
    biayaJoin: pkg.joinPrice.toString(),
    diskonBp: pkg.discountPercent,
    dibuka: pkg.isOpen,
  });
  revalidatePath("/admin/partnership");
  return {
    ok: pkg.isOpen
      ? "Paket mitra tersimpan. Harga baru langsung berlaku untuk semua mitra."
      : "Paket mitra tersimpan. Pendaftaran mitra baru sedang DITUTUP.",
  };
}
