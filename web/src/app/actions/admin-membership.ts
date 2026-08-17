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
      // Kolom USANG: paket reseller sekali bayar, berlaku selamanya, jadi tidak
      // ada satu pun kode yang membacanya lagi. Diisi 0 dari sini alih-alih
      // dijadikan kolom di form - angka yang diketik admin lalu tidak pernah
      // dipakai cuma menunggu untuk salah dipercaya. Kolomnya sendiri baru bisa
      // dihapus lewat migrasi tersendiri.
      durationDays: 0,
      name: parsed.data.name,
      price: parsed.data.price,
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
  tierId: z.string().min(1, "Pilih paket"),
});

// Memberi paket reseller TANPA pembayaran - kompensasi, hadiah promo, atau
// menaikkan reseller yang sudah membayar lewat jalur lain.
//
// ⚠️ DITULIS KE ResellerAccount, bukan UserMembership.
//
// Sejak program membership diganti program reseller (2026-08-17),
// getMembershipContext() membaca ResellerAccount dan TIDAK PERNAH menyentuh
// UserMembership lagi. Versi sebelumnya masih menulis ke tabel lama, jadi
// tombol ini melaporkan sukses sementara harga orangnya tidak berubah sedikit
// pun - kegagalan senyap yang persis paling sulit ditemukan.
export async function grantMembership(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = grantSchema.safeParse({
    email: formData.get("email"),
    tierId: formData.get("tierId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [user, tier] = await Promise.all([
    db.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, email: true, name: true, resellerAccount: { select: { id: true, activatedAt: true } } },
    }),
    db.membershipTier.findUnique({ where: { id: parsed.data.tierId } }),
  ]);
  if (!user) return { error: `User dengan email ${parsed.data.email} tidak ditemukan.` };
  if (!tier) return { error: "Paket tidak ditemukan." };
  if (!user.resellerAccount) {
    // Paket hanya berarti untuk reseller - diskonnya dibaca dari
    // ResellerAccount. Membuatkan barisnya diam-diam di sini akan melewati
    // formulir data usaha DAN verifikasi email yang jadi syarat aktivasi.
    return { error: `${user.email} belum terdaftar sebagai reseller. Minta dia mendaftar dulu lewat menu Reseller.` };
  }

  await db.resellerAccount.update({
    where: { id: user.resellerAccount.id },
    data: {
      tierId: tier.id,
      // tierPricePaid = HARGA PAKET, bukan 0, walau pemberian ini gratis.
      // Angka ini adalah dasar kredit saat orangnya naik paket nanti
      // (lib/reseller/upgrade.ts). Mengisinya 0 berarti dia harus membayar
      // penuh untuk naik - pemberian yang justru merugikannya.
      tierPricePaid: tier.price,
      // Pemberian paket sekaligus mengaktifkan akun resellernya kalau belum:
      // admin yang memberi paket jelas sudah mengenal orangnya, dan menahannya
      // di layar "tunggu aktivasi" setelah diberi paket cuma membingungkan.
      ...(user.resellerAccount.activatedAt ? {} : { activatedAt: new Date() }),
    },
  });

  await logAdmin(admin.adminId, "reseller.grant_tier", user.resellerAccount.id, {
    userId: user.id,
    userEmail: user.email,
    tierId: tier.id,
    tierName: tier.name,
    tierPrice: tier.price.toString(),
  });
  revalidatePath("/admin/membership-tiers");
  revalidatePath("/admin/reseller");
  return { ok: `Paket "${tier.name}" diberikan ke ${user.email}. Berlaku selamanya, tanpa pembayaran.` };
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
