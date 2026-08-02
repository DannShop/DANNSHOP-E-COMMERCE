import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const CATEGORIES = [
  { slug: "games", name: "Games", sortOrder: 1 },
  { slug: "pulsa-data", name: "Pulsa & Data", sortOrder: 2 },
  { slug: "e-money", name: "E-Money", sortOrder: 3 },
  { slug: "pln", name: "PLN", sortOrder: 4 },
  { slug: "voucher", name: "Voucher", sortOrder: 5 },
];

const PROVIDERS = [
  { key: "DIGIFLAZZ" as const, displayName: "Digiflazz", priority: 10 },
  { key: "SERPUL" as const, displayName: "Serpul", priority: 20 },
  { key: "OKECONNECT" as const, displayName: "OkeConnect", priority: 30 },
  { key: "QIOSPAY" as const, displayName: "QiosPay", priority: 40 },
];

const PAYMENT_METHODS = [
  { code: "qris", label: "QRIS", feeFlat: 0n, feePercent: 70, sortOrder: 1 },
  { code: "va_bca", label: "BCA Virtual Account", feeFlat: 4000n, feePercent: 0, sortOrder: 2 },
  { code: "va_bni", label: "BNI Virtual Account", feeFlat: 4000n, feePercent: 0, sortOrder: 3 },
  { code: "va_bri", label: "BRI Virtual Account", feeFlat: 4000n, feePercent: 0, sortOrder: 4 },
  { code: "va_mandiri", label: "Mandiri Bill Payment", feeFlat: 4000n, feePercent: 0, sortOrder: 5 },
  { code: "va_permata", label: "Permata Virtual Account", feeFlat: 4000n, feePercent: 0, sortOrder: 6 },
  { code: "va_cimb", label: "CIMB Niaga Virtual Account", feeFlat: 4000n, feePercent: 0, sortOrder: 7 },
];

const SAMPLE_PRODUCTS = [
  {
    slug: "mobile-legends", name: "Mobile Legends", publisher: "Moonton",
    inputFields: [{ name: "user_id", label: "User ID" }, { name: "zone_id", label: "Zone ID" }],
    items: [{ name: "86 Diamonds", sellingPrice: 22000n, memberPrice: 21500n, sortOrder: 1 }],
  },
  {
    slug: "free-fire", name: "Free Fire", publisher: "Garena",
    inputFields: [{ name: "user_id", label: "User ID" }],
    items: [{ name: "100 Diamond", sellingPrice: 16000n, memberPrice: 15500n, sortOrder: 1 }],
  },
];

async function main() {
  for (const c of CATEGORIES) {
    await db.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, sortOrder: c.sortOrder },
      create: c,
    });
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL dan ADMIN_PASSWORD wajib di-set di web/.env");
  }

  const existingAdmin = await db.user.findUnique({ where: { email } });
  let admin = existingAdmin;
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(password, 12);
    admin = await db.user.create({ data: { email, passwordHash, name: "Admin DannShop", role: "ADMIN" } });
  }
  // Kalau user dengan email ini SUDAH ADA (siapa pun pembuatnya) - JANGAN sentuh
  // role/passwordHash sama sekali. Mencegah race: attacker daftar pakai email =
  // ADMIN_EMAIL duluan sebelum seed pertama kali jalan, lalu re-run seed (mis.
  // saat deploy) tidak lagi bisa "mempromosikan" akun attacker itu jadi ADMIN.
  // Promosi admin sekarang murni aksi manual DB, bukan efek samping seed.

  await db.wallet.upsert({
    where: { userId: admin!.id },
    update: {},
    create: { userId: admin!.id },
  });

  for (const p of PROVIDERS) {
    await db.providerConfig.upsert({
      where: { key: p.key },
      update: { displayName: p.displayName, priority: p.priority },
      create: p, // isActive false, credentials null — diisi lewat admin
    });
  }

  for (const m of PAYMENT_METHODS) {
    await db.paymentMethodConfig.upsert({
      where: { code: m.code },
      update: {}, // sengaja no-op — jangan timpa fee yang mungkin sudah diubah admin lewat panel
      create: m,
    });
  }

  const games = await db.category.findUniqueOrThrow({ where: { slug: "games" } });
  for (const sp of SAMPLE_PRODUCTS) {
    const product = await db.product.upsert({
      where: { slug: sp.slug },
      update: { name: sp.name, publisher: sp.publisher },
      create: {
        categoryId: games.id, slug: sp.slug, name: sp.name, publisher: sp.publisher,
        inputFields: sp.inputFields, isActive: false, // aktifkan manual setelah mapping SKU
      },
    });
    for (const item of sp.items) {
      const existing = await db.productItem.findFirst({ where: { productId: product.id, name: item.name } });
      if (!existing) await db.productItem.create({ data: { productId: product.id, ...item } });
    }
  }

  console.log(
    `Seed OK: ${CATEGORIES.length} kategori, admin=${email}, ${PROVIDERS.length} provider config, ${SAMPLE_PRODUCTS.length} produk contoh`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
