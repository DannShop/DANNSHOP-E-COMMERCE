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

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await db.user.upsert({
    where: { email },
    update: { role: "ADMIN" },
    create: { email, passwordHash, name: "Admin DannShop", role: "ADMIN" },
  });

  await db.wallet.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id },
  });

  console.log(`Seed OK: ${CATEGORIES.length} kategori, admin=${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
