"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { CODE_MAX_LENGTH, isValidVoucherCode, normalizeVoucherCode } from "@/lib/voucher/code";

export type ActionResult = { ok?: string; error?: string };

async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) return { error: "Tidak diizinkan" };
  const fresh = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, updatedAt: true },
  });
  if (!fresh || fresh.role !== "ADMIN" || fresh.updatedAt.getTime() !== session.user.updatedAt) {
    return { error: "Tidak diizinkan" };
  }
  return { adminId: session.user.id };
}

async function logAdmin(adminId: string, action: string, targetId?: string, detail?: object) {
  await db.adminActionLog.create({
    data: { adminId, action, targetType: "voucher", targetId, detail },
  });
}

/** Checkbox yang tidak dicentang mengirim `null`, dan `.optional()` Zod hanya menerima `undefined`. */
const checkbox = z
  .string()
  .nullish()
  .transform((v) => v === "on");

const bigintField = (label: string) =>
  z.coerce.bigint().refine((v) => v >= 0n, `${label} tidak boleh negatif`);

const optionalDate = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? new Date(v) : null))
  .refine((v) => v === null || !Number.isNaN(v.getTime()), "Tanggal tidak valid");

const voucherSchema = z
  .object({
    code: z
      .string()
      .transform(normalizeVoucherCode)
      .refine(
        isValidVoucherCode,
        `Kode hanya boleh huruf, angka, - dan _ (maks ${CODE_MAX_LENGTH} karakter)`,
      ),
    description: z.string().trim().max(500, "Catatan terlalu panjang"),
    discountType: z.enum(["PERCENT", "FIXED"]),
    percentBp: z.coerce.number().int().min(0).max(10_000, "Persentase maksimal 100%"),
    amount: bigintField("Nominal"),
    minSpend: bigintField("Minimal belanja"),
    quota: z.coerce.number().int().min(0, "Kuota tidak boleh negatif"),
    perTargetLimit: z.coerce.number().int().min(0, "Batas per tujuan tidak boleh negatif"),
    startAt: optionalDate,
    endAt: optionalDate,
    isActive: checkbox,
    allowFlashSale: checkbox,
    allowGuest: checkbox,
    categoryIds: z.array(z.string()),
    productIds: z.array(z.string()),
  })
  // Divalidasi DI SINI, bukan dibiarkan lolos ke pemakaian: voucher PERCENT
  // dengan percentBp 0 dan voucher FIXED dengan amount 0 sama-sama tersimpan
  // rapi lalu memberi potongan nol rupiah - yang dari sisi pembeli terlihat
  // seperti kode yang "diterima tapi tidak melakukan apa-apa".
  .refine((v) => v.discountType !== "PERCENT" || v.percentBp > 0, {
    message: "Persentase potongan harus lebih dari 0",
    path: ["percentBp"],
  })
  .refine((v) => v.discountType !== "FIXED" || v.amount > 0n, {
    message: "Nominal potongan harus lebih dari 0",
    path: ["amount"],
  })
  .refine((v) => !v.startAt || !v.endAt || v.startAt <= v.endAt, {
    message: "Tanggal mulai harus sebelum tanggal berakhir",
    path: ["endAt"],
  });

function readForm(formData: FormData) {
  return {
    code: formData.get("code") ?? "",
    description: formData.get("description") ?? "",
    discountType: formData.get("discountType") === "FIXED" ? "FIXED" : "PERCENT",
    percentBp: formData.get("percentBp") ?? 0,
    amount: formData.get("amount") ?? 0,
    minSpend: formData.get("minSpend") ?? 0,
    quota: formData.get("quota") ?? 0,
    perTargetLimit: formData.get("perTargetLimit") ?? 0,
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt"),
    isActive: formData.get("isActive"),
    allowFlashSale: formData.get("allowFlashSale"),
    allowGuest: formData.get("allowGuest"),
    categoryIds: formData.getAll("categoryIds").map(String),
    productIds: formData.getAll("productIds").map(String),
  };
}

function isDuplicateCode(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    Array.isArray(e.meta?.target) &&
    (e.meta!.target as string[]).includes("code")
  );
}

export async function saveVoucher(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = voucherSchema.safeParse(readForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const id = String(formData.get("id") ?? "").trim();
  const data = {
    code: d.code,
    description: d.description || null,
    discountType: d.discountType,
    percentBp: d.percentBp,
    amount: d.amount,
    minSpend: d.minSpend,
    quota: d.quota,
    perTargetLimit: d.perTargetLimit,
    startAt: d.startAt,
    endAt: d.endAt,
    isActive: d.isActive,
    allowFlashSale: d.allowFlashSale,
    allowGuest: d.allowGuest,
  };

  const kategoriTerpilih = d.categoryIds.map((cid) => ({ id: cid }));
  const produkTerpilih = d.productIds.map((pid) => ({ id: pid }));

  try {
    if (id) {
      await db.voucher.update({
        where: { id },
        data: {
          ...data,
          // `set`, BUKAN `connect`. Dengan connect, pembatas yang centangnya
          // DICABUT admin tidak akan pernah terlepas - vouchernya diam-diam
          // tetap terbatas pada kategori lama, dan dari panel terlihat seperti
          // perubahannya tersimpan. `set` mengganti seluruh daftarnya, yang
          // memang arti dari isian di formnya.
          categories: { set: kategoriTerpilih },
          products: { set: produkTerpilih },
        },
      });
      await logAdmin(admin.adminId, "voucher.update", id, { code: d.code });
    } else {
      // Pada create belum ada relasi lama yang perlu dilepas, dan `set` bukan
      // operasi yang sah di sana.
      const dibuat = await db.voucher.create({
        data: {
          ...data,
          categories: { connect: kategoriTerpilih },
          products: { connect: produkTerpilih },
        },
      });
      await logAdmin(admin.adminId, "voucher.create", dibuat.id, { code: d.code });
    }
  } catch (e) {
    if (isDuplicateCode(e)) return { error: `Kode "${d.code}" sudah dipakai voucher lain.` };
    throw e;
  }

  revalidatePath("/admin/vouchers");
  return { ok: `Voucher ${d.code} tersimpan.` };
}

export async function deleteVoucher(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Voucher tidak ditemukan." };

  const voucher = await db.voucher.findUnique({
    where: { id },
    select: { code: true, _count: { select: { redemptions: true } } },
  });
  if (!voucher) return { error: "Voucher tidak ditemukan." };

  // Voucher yang PERNAH dipakai tidak boleh dihapus. Penghapusannya akan
  // meng-cascade ke VoucherRedemption, dan bersama itu hilang pula catatan
  // kenapa sejumlah order dulu ditagih lebih murah - laporan penjualan jadi
  // tidak bisa dijelaskan lagi. Menonaktifkannya memberi hasil yang sama bagi
  // pembeli tanpa membuang jejaknya.
  if (voucher._count.redemptions > 0) {
    return {
      error: `Voucher ${voucher.code} sudah pernah dipakai ${voucher._count.redemptions} kali, jadi tidak bisa dihapus. Matikan saja lewat centang "Aktif" supaya riwayat pesanannya tetap bisa dilacak.`,
    };
  }

  await db.voucher.delete({ where: { id } });
  await logAdmin(admin.adminId, "voucher.delete", id, { code: voucher.code });
  revalidatePath("/admin/vouchers");
  return { ok: `Voucher ${voucher.code} dihapus.` };
}

export async function toggleVoucherActive(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const id = String(formData.get("id") ?? "").trim();
  const voucher = await db.voucher.findUnique({ where: { id }, select: { isActive: true, code: true } });
  if (!voucher) return { error: "Voucher tidak ditemukan." };

  await db.voucher.update({ where: { id }, data: { isActive: !voucher.isActive } });
  await logAdmin(admin.adminId, "voucher.toggle_active", id, { isActive: !voucher.isActive });
  revalidatePath("/admin/vouchers");
  return { ok: voucher.isActive ? `Voucher ${voucher.code} dimatikan.` : `Voucher ${voucher.code} diaktifkan.` };
}
