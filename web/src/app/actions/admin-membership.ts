"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { z } from "zod";
import { BENEFIT_CATALOG } from "@/lib/membership/benefits";
import { buildTierPriceTable } from "@/lib/membership/tier-price-table";
import { requireAdminSession } from "@/lib/auth/admin-gate";

export type ActionResult = { ok?: string; error?: string };

const requireAdmin = () => requireAdminSession("users.manage");

async function logAdmin(adminId: string, action: string, targetId: string, detail?: object) {
  await db.adminActionLog.create({
    data: { adminId, action, targetType: "membership_tier", targetId, detail },
  });
}

const slugSchema = z
  .string()
  .min(1, "Slug wajib diisi")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug cuma boleh huruf kecil, angka, dan tanda hubung");

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format hex, mis. #eab308");

// Satu checkbox per key benefit (name="benefit_<key>", dibaca "on"/tidak ada) -
// pola sama dengan seluruh checkbox boolean lain di codebase ini. Diiterasi
// dari BENEFIT_CATALOG (bukan dari isi form) supaya key yang tidak ada di
// katalog tidak mungkin lolos ke DB apa pun isi request-nya.
function parseBenefitsInput(formData: FormData): string[] {
  return BENEFIT_CATALOG.filter((b) => formData.get(`benefit_${b.key}`) === "on").map((b) => b.key);
}

const tierFieldsSchema = z.object({
  name: z.string().trim().min(1, "Nama tier wajib diisi").max(50),
  price: z.coerce.bigint().min(0n, "Harga tidak boleh negatif"),
  durationDays: z.coerce.number().int().min(1, "Durasi minimal 1 hari").max(3650, "Durasi maksimal 3650 hari"),
  discountPercent: z.coerce.number().int().min(0, "Diskon tidak boleh negatif").max(10_000, "Diskon maksimal 100%"),
  depositBonusPercent: z.coerce.number().int().min(0, "Bonus deposit tidak boleh negatif").max(10_000, "Bonus deposit maksimal 100%"),
  badgeColor: hexColorSchema,
  sortOrder: z.coerce.number().int().default(0),
  // .nullish(): checkbox tak tercentang mengirim `null`, dan .optional() Zod
  // cuma menerima `undefined` - lihat catatan lengkap di actions/payment-config.ts.
  isActive: z.string().nullish(),
});

const createSchema = tierFieldsSchema.extend({ slug: slugSchema });

export async function createMembershipTier(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = createSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    price: formData.get("price"),
    durationDays: formData.get("durationDays"),
    discountPercent: formData.get("discountPercent"),
    depositBonusPercent: formData.get("depositBonusPercent"),
    badgeColor: formData.get("badgeColor") || "#a3a3a3",
    sortOrder: formData.get("sortOrder") ?? 0,
    isActive: formData.get("isActive"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await db.membershipTier.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) return { error: "Slug sudah dipakai tier lain." };

  const benefits = parseBenefitsInput(formData);
  const tier = await db.membershipTier.create({
    data: {
      slug: parsed.data.slug,
      name: parsed.data.name,
      price: parsed.data.price,
      durationDays: parsed.data.durationDays,
      discountPercent: parsed.data.discountPercent,
      depositBonusPercent: parsed.data.depositBonusPercent,
      badgeColor: parsed.data.badgeColor,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive === "on",
      benefits,
    },
  });
  await logAdmin(admin.adminId, "membership_tier.create", tier.id, { slug: parsed.data.slug, benefits });
  revalidatePath("/admin/membership-tiers");
  revalidatePath("/daftar-reseller");
  return { ok: `Tier "${tier.name}" dibuat.` };
}

const updateSchema = tierFieldsSchema.extend({ id: z.string().min(1) });

export async function updateMembershipTier(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    price: formData.get("price"),
    durationDays: formData.get("durationDays"),
    discountPercent: formData.get("discountPercent"),
    depositBonusPercent: formData.get("depositBonusPercent"),
    badgeColor: formData.get("badgeColor") || "#a3a3a3",
    sortOrder: formData.get("sortOrder") ?? 0,
    isActive: formData.get("isActive"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const benefits = parseBenefitsInput(formData);
  await db.membershipTier.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      price: parsed.data.price,
      durationDays: parsed.data.durationDays,
      discountPercent: parsed.data.discountPercent,
      depositBonusPercent: parsed.data.depositBonusPercent,
      badgeColor: parsed.data.badgeColor,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive === "on",
      benefits,
    },
  });
  // Nilai lama TIDAK diubah retroaktif untuk member yang sudah beli
  // (durationDaysSnapshot/pricePaid di UserMembership sudah disnapshot saat
  // pembelian) - tapi discountPercent/benefits di sini dibaca LIVE tiap
  // checkout lewat getMembershipContext(), jadi perubahan itu berlaku
  // langsung untuk semua member tier ini, termasuk yang sudah lama beli.
  // Ini perilaku yang disengaja (sama seperti mengubah memberPrice dulu
  // langsung berlaku untuk semua member), bukan bug.
  await logAdmin(admin.adminId, "membership_tier.update", parsed.data.id, { benefits });
  revalidatePath("/admin/membership-tiers");
  revalidatePath("/daftar-reseller");
  return { ok: "Tier tersimpan." };
}

const deleteSchema = z.object({ id: z.string().min(1) });

export async function deleteMembershipTier(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = deleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const membershipCount = await db.userMembership.count({ where: { tierId: parsed.data.id } });
  if (membershipCount > 0) {
    return {
      error: `Tier ini sudah pernah dibeli/diberikan ${membershipCount}x - tidak bisa dihapus (nonaktifkan saja lewat toggle Aktif).`,
    };
  }

  await db.membershipTier.delete({ where: { id: parsed.data.id } });
  await logAdmin(admin.adminId, "membership_tier.delete", parsed.data.id);
  revalidatePath("/admin/membership-tiers");
  revalidatePath("/daftar-reseller");
  return { ok: "Tier dihapus." };
}

const grantSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email tidak valid"),
  tierId: z.string().min(1, "Pilih tier"),
  days: z.coerce.number().int().min(1).max(3650).optional(),
});

// Grant manual - dipakai CS untuk kompensasi customer, hadiah promo, dsb.
// tanpa memotong saldo user. pricePaid = 0 menandai baris ini bukan hasil
// pembelian (dibedakan lewat `source`, dan tampil sebagai "Pemberian Admin" di
// riwayat, bukan seolah-olah user membayar).
export async function grantMembership(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = grantSchema.safeParse({
    email: formData.get("email"),
    tierId: formData.get("tierId"),
    days: formData.get("days") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [user, tier] = await Promise.all([
    db.user.findUnique({ where: { email: parsed.data.email } }),
    db.membershipTier.findUnique({ where: { id: parsed.data.tierId } }),
  ]);
  if (!user) return { error: `User dengan email ${parsed.data.email} tidak ditemukan.` };
  if (!tier) return { error: "Tier tidak ditemukan." };

  const now = new Date();
  const days = parsed.data.days ?? tier.durationDays;
  const current = await db.userMembership.findFirst({
    where: { userId: user.id, expiresAt: { gt: now } },
    orderBy: { expiresAt: "desc" },
  });
  const baseStart = current && current.tierId === tier.id ? current.expiresAt : now;
  const expiresAt = new Date(baseStart.getTime() + days * 24 * 60 * 60 * 1000);

  const membership = await db.userMembership.create({
    data: {
      userId: user.id,
      tierId: tier.id,
      startedAt: now,
      expiresAt,
      pricePaid: 0n,
      durationDaysSnapshot: days,
      source: "manual_grant",
    },
  });
  await logAdmin(admin.adminId, "membership.grant", membership.id, {
    userId: user.id, userEmail: user.email, tierId: tier.id, tierName: tier.name, days,
  });
  revalidatePath("/admin/membership-tiers");
  return { ok: `Tier "${tier.name}" diberikan ke ${user.email} sampai ${expiresAt.toLocaleDateString("id-ID")}.` };
}

// ===== Preview harga per tier =====
//
// Menjawab pertanyaan yang sebenarnya dipakai admin saat menyetel diskon:
// "kalau saya set Bronze 5%, customer bayar berapa untuk item ini?". Angkanya
// WAJIB lewat effectivePrice() - satu-satunya penentu harga final di codebase
// ini - supaya preview tidak pernah berbohong soal lantai memberPrice maupun
// flash sale yang sedang jalan. Menghitung `harga - diskon` sendiri di sini
// justru akan menampilkan angka yang beda dari yang benar-benar ditagih saat
// checkout, dan itu lebih berbahaya daripada tidak punya preview sama sekali.

export interface TierPricePreviewTier {
  id: string;
  name: string;
  badgeColor: string;
  discountPercent: number;
}

// BigInt tidak bisa menyeberangi batas server action, jadi semua nominal
// dikirim sebagai string - pola yang sama dengan MarkupPreviewRowSerialized.
export interface TierPricePreviewRow {
  itemId: string;
  productName: string;
  itemName: string;
  basePrice: string;
  memberFloor: string;
  flashActive: boolean;
  /** Sejajar indeksnya dengan `tiers` pada hasil yang sama. */
  tierPrices: string[];
}

export type TierPricePreviewResult = {
  tiers?: TierPricePreviewTier[];
  rows?: TierPricePreviewRow[];
  error?: string;
};

// Admin sengaja melihat SEMUA tier termasuk yang isActive: false - dia perlu
// mengecek harga sebuah tier yang baru dibuat/sedang dinonaktifkan SEBELUM
// menyalakannya untuk publik, bukan cuma yang sudah live. Beda dari
// previewTierPricingPublic di actions/membership.ts yang cuma boleh
// menunjukkan tier yang benar-benar bisa dibeli customer sekarang.
export async function previewTierPricing(formData: FormData): Promise<TierPricePreviewResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const categoryId = String(formData.get("categoryId") ?? "");
  const { tiers, rows } = await buildTierPriceTable({ categoryId }, { includeInactiveTiers: true });
  if (tiers.length === 0) return { error: "Belum ada tier yang bisa dibandingkan. Buat tier dulu di atas." };
  return { tiers, rows };
}
