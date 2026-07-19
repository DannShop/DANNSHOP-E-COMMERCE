# Fase 1 — Fondasi (Next.js + Prisma + Skema DB + Auth + Layout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikasi Next.js berjalan dengan seluruh skema database ter-migrasi, auth (guest/member/admin) berfungsi, dan kerangka layout publik + admin siap — definisi selesai: `npm run test` hijau, admin bisa login dan membuka `/admin`, non-admin diblokir.

**Architecture:** Aplikasi fullstack Next.js App Router di folder `web/` dalam repo ini (Laravel lama tetap di root sebagai referensi, tidak disentuh). Prisma → MySQL lokal (Laragon). Auth.js v5 (JWT session) dengan split config edge-safe untuk middleware. Semua nilai uang `BigInt` rupiah utuh.

**Tech Stack:** Next.js (App Router, TypeScript strict), Prisma ORM, MySQL, Auth.js v5 (`next-auth@beta`), bcryptjs, Zod, Tailwind CSS + shadcn/ui, Vitest.

## Global Constraints

- Spec sumber: `docs/superpowers/specs/2026-07-19-dannshop-topup-platform-design.md`
- Semua kolom uang: `BigInt` (rupiah utuh). JANGAN float/decimal. Konversi ke `Number`/string hanya di boundary JSON/UI.
- Working directory semua perintah: `D:\Coding VSC\DannShop-PPOB\web` kecuali disebut lain. Commit dilakukan dari root repo.
- Database dev lokal: `mysql://root:@127.0.0.1:3306/dannshop_next` (Laragon harus running).
- Bahasa UI: Indonesia. Nama brand: **DannShop**.
- Package manager: npm. Node ≥ 22 (terpasang: v22.14.0).
- Env rahasia hanya di `web/.env` (sudah di-gitignore oleh create-next-app); `web/.env.example` yang di-commit.
- Saldo/ledger TIDAK diimplementasi logikanya di fase ini (hanya tabel) — logika ledger = Fase 4.

---

## File Structure

```
web/
  prisma/
    schema.prisma           ← seluruh skema (spec §4)
    seed.ts                 ← kategori dasar + admin pertama (idempotent)
  src/
    lib/
      db.ts                 ← PrismaClient singleton
      password.ts           ← hashPassword / verifyPassword (bcryptjs)
      auth.config.ts        ← config Auth.js edge-safe (callbacks, pages) — dipakai middleware
      auth.ts               ← NextAuth full (Credentials + prisma) — dipakai server
      validation/auth.ts    ← zod: loginSchema, registerSchema
    app/
      api/auth/[...nextauth]/route.ts
      (public)/layout.tsx   ← navbar + footer publik
      (public)/page.tsx     ← home placeholder
      login/page.tsx        ← form login (guest boleh lihat)
      register/page.tsx     ← form daftar member
      account/page.tsx      ← placeholder dashboard member
      admin/layout.tsx      ← shell admin (sidebar) + guard server-side
      admin/page.tsx        ← placeholder dashboard admin
      actions/auth.ts       ← server actions: loginAction, registerAction
    middleware.ts           ← gate /admin (ADMIN) & /account (login)
    types/next-auth.d.ts    ← augmentasi tipe session (role, id)
  tests/
    password.test.ts
    validation-auth.test.ts
  vitest.config.ts
```

---

### Task 1: Scaffold Next.js + Vitest

**Files:**
- Create: `web/` (via create-next-app), `web/vitest.config.ts`, `web/tests/smoke.test.ts`
- Modify: `web/package.json` (script test)

**Interfaces:**
- Produces: project Next.js TypeScript dengan alias `@/*` → `src/*`, dan `npm run test` menjalankan Vitest.

- [ ] **Step 1: Scaffold app**

Dari root repo `D:\Coding VSC\DannShop-PPOB`:

```powershell
npx create-next-app@latest web --typescript --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

(Jika CLI bertanya interaktif, jawab: TypeScript=Yes, ESLint=Yes, Tailwind=Yes, `src/`=Yes, App Router=Yes, import alias `@/*`.)

- [ ] **Step 2: Verifikasi dev server hidup**

```powershell
cd web; npm run dev
```
Expected: `Ready` di `http://localhost:3000`, halaman default Next.js terbuka. Hentikan dengan Ctrl+C.

- [ ] **Step 3: Install & konfigurasi Vitest**

```powershell
npm install -D vitest vite-tsconfig-paths
```

Create `web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

Tambahkan di `web/package.json` bagian `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 4: Smoke test**

Create `web/tests/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("vitest berjalan", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm run test`
Expected: `1 passed`

- [ ] **Step 5: Commit**

```powershell
cd ..; git add web; git commit -m "feat(web): scaffold Next.js app + vitest"
```

---

### Task 2: Prisma + Skema Database Penuh

**Files:**
- Create: `web/prisma/schema.prisma`, `web/src/lib/db.ts`, `web/.env.example`
- Modify: `web/.env` (DATABASE_URL)

**Interfaces:**
- Produces: semua model Prisma (spec §4) + `db` singleton (`import { db } from "@/lib/db"`). Enum penting yang dipakai task lain: `Role { USER ADMIN }`.

- [ ] **Step 1: Install Prisma**

```powershell
npm install prisma @prisma/client
npx prisma init --datasource-provider mysql
```

- [ ] **Step 2: Set env**

`web/.env` — tambahkan/ganti:

```env
DATABASE_URL="mysql://root:@127.0.0.1:3306/dannshop_next"
```

Create `web/.env.example`:

```env
DATABASE_URL="mysql://root:@127.0.0.1:3306/dannshop_next"
AUTH_SECRET="ganti-dengan-random-hex-32-byte"
ADMIN_EMAIL="admin@dannshop.test"
ADMIN_PASSWORD="ganti-password-kuat"
```

- [ ] **Step 3: Tulis skema penuh**

Replace isi `web/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// ===== Enums =====

enum Role {
  USER
  ADMIN
}

enum ProviderKey {
  DIGIFLAZZ
  OKECONNECT
  QIOSPAY
  SERPUL
}

enum ProviderSkuStatus {
  ACTIVE
  UNAVAILABLE
}

enum OrderStatus {
  PENDING_PAYMENT
  PAID
  PROCESSING
  COMPLETED
  EXPIRED
  FAILED
  REFUND_PENDING
  REFUNDED
  NEEDS_REVIEW
}

enum PaidVia {
  MIDTRANS
  BALANCE
}

enum PaymentStatus {
  PENDING
  PAID
  EXPIRED
  FAILED
}

enum FulfillmentStatus {
  SENT
  PROCESSING
  SUCCESS
  FAILED
}

enum LedgerType {
  DEPOSIT
  ORDER_PAYMENT
  REFUND
  ADJUSTMENT
}

enum DepositStatus {
  PENDING
  PAID
  EXPIRED
  FAILED
}

enum HealthStatus {
  UNKNOWN
  HEALTHY
  DEGRADED
  DOWN
}

enum JobStatus {
  PENDING
  RUNNING
  DONE
  FAILED
}

// ===== Blok 3: User & Wallet =====

model User {
  id              String    @id @default(cuid())
  email           String    @unique
  passwordHash    String
  name            String
  role            Role      @default(USER)
  emailVerifiedAt DateTime?
  wallet          Wallet?
  orders          Order[]
  deposits        Deposit[]
  adminActionLogs AdminActionLog[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Wallet {
  id      String         @id @default(cuid())
  userId  String         @unique
  user    User           @relation(fields: [userId], references: [id])
  balance BigInt         @default(0)
  ledger  WalletLedger[]
}

model WalletLedger {
  id             String     @id @default(cuid())
  walletId       String
  wallet         Wallet     @relation(fields: [walletId], references: [id])
  type           LedgerType
  amount         BigInt // signed: +masuk / -keluar
  balanceAfter   BigInt
  referenceType  String // "order" | "deposit" | "manual"
  referenceId    String
  idempotencyKey String     @unique
  note           String?
  createdAt      DateTime   @default(now())

  @@index([walletId, createdAt])
}

model Deposit {
  id          String        @id @default(cuid())
  userId      String
  user        User          @relation(fields: [userId], references: [id])
  amount      BigInt
  status      DepositStatus @default(PENDING)
  paymentRef  String?
  rawResponse Json?
  expiredAt   DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}

// ===== Blok 1: Katalog =====

model Category {
  id        String    @id @default(cuid())
  slug      String    @unique
  name      String
  sortOrder Int       @default(0)
  products  Product[]
}

model Product {
  id               String        @id @default(cuid())
  categoryId       String
  category         Category      @relation(fields: [categoryId], references: [id])
  slug             String        @unique
  name             String
  publisher        String?
  banner           String?
  description      String?       @db.Text
  isActive         Boolean       @default(false)
  inputFields      Json // contoh ML: [{"name":"user_id","label":"User ID"},{"name":"zone_id","label":"Zone ID"}]
  nicknameCheckKey String?
  items            ProductItem[]
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
}

model ProductItem {
  id           String        @id @default(cuid())
  productId    String
  product      Product       @relation(fields: [productId], references: [id])
  name         String
  sellingPrice BigInt
  memberPrice  BigInt
  isActive     Boolean       @default(true)
  sortOrder    Int           @default(0)
  providerSkus ProviderSku[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
}

model ProviderSku {
  id              String            @id @default(cuid())
  productItemId   String
  productItem     ProductItem       @relation(fields: [productItemId], references: [id])
  provider        ProviderKey
  providerSkuCode String
  costPrice       BigInt
  status          ProviderSkuStatus @default(ACTIVE)
  lastSyncedAt    DateTime?

  @@unique([productItemId, provider])
  @@index([provider, providerSkuCode])
}

// ===== Blok 2: Order & Fulfillment =====

model Order {
  id            String               @id @default(cuid())
  orderNumber   String               @unique // INV-YYYYMMDD-XXXX
  status        OrderStatus          @default(PENDING_PAYMENT)
  userId        String?
  user          User?                @relation(fields: [userId], references: [id])
  productItemId String?
  productName   String // snapshot
  itemName      String // snapshot
  target        Json // {"user_id":"123","zone_id":"1234"} atau {"phone_number":"08..."}
  buyerEmail    String?
  buyerPhone    String?
  paidVia       PaidVia?
  sellingPrice  BigInt
  total         BigInt
  expiredAt     DateTime?
  completedAt   DateTime?
  payment       OrderPayment?
  fulfillments  OrderFulfillment[]
  statusHistory OrderStatusHistory[]
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt

  @@index([status, createdAt])
}

model OrderPayment {
  id          String        @id @default(cuid())
  orderId     String        @unique
  order       Order         @relation(fields: [orderId], references: [id])
  method      String // "qris" | "gopay" | "va" | "balance"
  paymentRef  String?
  status      PaymentStatus @default(PENDING)
  actions     Json? // qr_string / deeplink dari Midtrans
  rawResponse Json?
  expiredAt   DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([paymentRef])
}

model OrderFulfillment {
  id              String            @id @default(cuid())
  orderId         String
  order           Order             @relation(fields: [orderId], references: [id])
  attemptNo       Int
  provider        ProviderKey
  providerSkuCode String
  costPrice       BigInt // snapshot saat attempt
  ourRefId        String            @unique // dikirim ke provider, kunci pencocokan callback
  providerRef     String?
  status          FulfillmentStatus @default(SENT)
  sn              String? // serial number / token hasil
  message         String?
  rawCallback     Json?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  @@unique([orderId, attemptNo])
}

model OrderStatusHistory {
  id         String      @id @default(cuid())
  orderId    String
  order      Order       @relation(fields: [orderId], references: [id])
  fromStatus OrderStatus?
  toStatus   OrderStatus
  note       String?
  createdAt  DateTime    @default(now())
}

// ===== Blok 4: Operasional =====

model ProviderConfig {
  id                String               @id @default(cuid())
  key               ProviderKey          @unique
  displayName       String
  credentials       Json? // terenkripsi di layer aplikasi sebelum simpan
  isActive          Boolean              @default(false)
  priority          Int                  @default(100) // kecil = diprioritaskan saat harga seri
  balance           BigInt               @default(0)
  healthStatus      HealthStatus         @default(UNKNOWN)
  lastHealthCheckAt DateTime?
  balanceLogs       ProviderBalanceLog[]
  updatedAt         DateTime             @updatedAt
}

model ProviderBalanceLog {
  id         String         @id @default(cuid())
  providerId String
  provider   ProviderConfig @relation(fields: [providerId], references: [id])
  balance    BigInt
  createdAt  DateTime       @default(now())
}

model PriceSyncLog {
  id          String      @id @default(cuid())
  provider    ProviderKey
  startedAt   DateTime    @default(now())
  finishedAt  DateTime?
  skusUpdated Int         @default(0)
  skusMissing Int         @default(0)
  result      String?
  error       String?     @db.Text
}

model Job {
  id          String    @id @default(cuid())
  type        String
  payload     Json
  runAt       DateTime
  attempts    Int       @default(0)
  maxAttempts Int       @default(5)
  status      JobStatus @default(PENDING)
  lastError   String?   @db.Text
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([status, runAt])
}

model AdminActionLog {
  id         String   @id @default(cuid())
  adminId    String
  admin      User     @relation(fields: [adminId], references: [id])
  action     String
  targetType String?
  targetId   String?
  detail     Json?
  createdAt  DateTime @default(now())
}

model WebhookEvent {
  id            String    @id @default(cuid())
  source        String // "midtrans" | "digiflazz" | "okeconnect" | "qiospay" | "serpul"
  externalRef   String?
  eventKey      String?   @unique // idempotency: `${source}:${ref}:${status}`
  rawBody       String    @db.Text
  headers       Json
  processedAt   DateTime?
  processResult String?
  createdAt     DateTime  @default(now())

  @@index([source, externalRef])
}
```

- [ ] **Step 4: Jalankan migrasi**

Pastikan Laragon (MySQL) running, lalu:

```powershell
npx prisma migrate dev --name init
```

Expected: database `dannshop_next` dibuat otomatis, output `Your database is now in sync with your schema`, folder `prisma/migrations/` berisi migration `init`.

- [ ] **Step 5: PrismaClient singleton**

Create `web/src/lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

- [ ] **Step 6: Verifikasi**

```powershell
npx prisma migrate status
```
Expected: `Database schema is up to date!`

- [ ] **Step 7: Commit**

```powershell
cd ..; git add web; git commit -m "feat(web): prisma schema penuh (katalog, order, wallet, operasional) + migrasi init"
```

---

### Task 3: Password Util + Zod Schemas (TDD)

**Files:**
- Create: `web/src/lib/password.ts`, `web/src/lib/validation/auth.ts`
- Test: `web/tests/password.test.ts`, `web/tests/validation-auth.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`
  - `loginSchema` (email, password ≥ 8), `registerSchema` (name ≥ 2, email, password ≥ 8) — keduanya `z.object`, dipakai Task 4 & 5.

- [ ] **Step 1: Install deps**

```powershell
npm install bcryptjs zod
npm install -D @types/bcryptjs
```

- [ ] **Step 2: Tulis test yang gagal**

Create `web/tests/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password", () => {
  it("hash lalu verify benar", async () => {
    const hash = await hashPassword("rahasia-banget-123");
    expect(hash).not.toBe("rahasia-banget-123");
    expect(await verifyPassword("rahasia-banget-123", hash)).toBe(true);
  });

  it("password salah ditolak", async () => {
    const hash = await hashPassword("rahasia-banget-123");
    expect(await verifyPassword("salah", hash)).toBe(false);
  });
});
```

Create `web/tests/validation-auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "@/lib/validation/auth";

describe("loginSchema", () => {
  it("menerima input valid", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "12345678" }).success
    ).toBe(true);
  });

  it("menolak email invalid", () => {
    expect(
      loginSchema.safeParse({ email: "bukan-email", password: "12345678" }).success
    ).toBe(false);
  });

  it("menolak password pendek", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "123" }).success
    ).toBe(false);
  });
});

describe("registerSchema", () => {
  it("menerima input valid", () => {
    expect(
      registerSchema.safeParse({
        name: "Wildan",
        email: "a@b.com",
        password: "12345678",
      }).success
    ).toBe(true);
  });

  it("menolak nama terlalu pendek", () => {
    expect(
      registerSchema.safeParse({ name: "W", email: "a@b.com", password: "12345678" })
        .success
    ).toBe(false);
  });
});
```

- [ ] **Step 3: Run test, pastikan gagal**

Run: `npm run test`
Expected: FAIL — `Cannot find module '@/lib/password'` (dan validation/auth).

- [ ] **Step 4: Implementasi minimal**

Create `web/src/lib/password.ts`:

```ts
import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

Create `web/src/lib/validation/auth.ts`:

```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter"),
});

export const registerSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  email: z.string().email("Email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter"),
});
```

- [ ] **Step 5: Run test, pastikan lulus**

Run: `npm run test`
Expected: semua PASS (termasuk smoke test).

- [ ] **Step 6: Commit**

```powershell
cd ..; git add web; git commit -m "feat(web): password util (bcryptjs) + zod auth schemas [TDD]"
```

---

### Task 4: Seed — Kategori Dasar + Admin Pertama (Idempotent)

**Files:**
- Create: `web/prisma/seed.ts`
- Modify: `web/package.json` (blok `prisma.seed`), `web/.env` (ADMIN_EMAIL, ADMIN_PASSWORD, AUTH_SECRET)

**Interfaces:**
- Consumes: `bcryptjs` langsung (bukan `@/lib/password` — seed dijalankan `tsx` yang tidak me-resolve alias `@/`) dan `PrismaClient` baru (bukan singleton, alasan sama).
- Produces: user admin `role=ADMIN` + wallet-nya + 5 kategori. Aman dijalankan berulang.

- [ ] **Step 1: Set env dev**

Generate secret:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Tambahkan ke `web/.env` (nilai password bebas tapi kuat, catat untuk login):

```env
AUTH_SECRET="<hasil-generate-di-atas>"
ADMIN_EMAIL="admin@dannshop.test"
ADMIN_PASSWORD="Admin-Dev-2026!"
```

- [ ] **Step 2: Tulis seed**

Create `web/prisma/seed.ts`:

```ts
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

  const email = process.env.ADMIN_EMAIL;
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
```

- [ ] **Step 3: Daftarkan seed runner**

```powershell
npm install -D tsx dotenv-cli
```

Tambahkan di `web/package.json` (level atas, sejajar `"scripts"`):

```json
"prisma": {
  "seed": "dotenv -e .env -- tsx prisma/seed.ts"
}
```

- [ ] **Step 4: Jalankan dua kali (uji idempotent)**

```powershell
npx prisma db seed
npx prisma db seed
```
Expected: keduanya sukses `Seed OK: 5 kategori, admin=admin@dannshop.test` — run kedua TIDAK error duplicate.

- [ ] **Step 5: Verifikasi isi DB**

```powershell
npx prisma studio
```
Expected: tabel `User` berisi 1 admin (role ADMIN, punya Wallet), `Category` berisi 5 row. Tutup studio.

- [ ] **Step 6: Commit**

```powershell
cd ..; git add web; git commit -m "feat(web): seed kategori + admin pertama (idempotent)"
```

---

### Task 5: Auth.js v5 — Credentials Login + Register Member

**Files:**
- Create: `web/src/lib/auth.config.ts`, `web/src/lib/auth.ts`, `web/src/types/next-auth.d.ts`, `web/src/app/api/auth/[...nextauth]/route.ts`, `web/src/app/actions/auth.ts`, `web/src/app/login/page.tsx`, `web/src/app/register/page.tsx`

**Interfaces:**
- Consumes: `loginSchema`/`registerSchema`, `verifyPassword`/`hashPassword`, `db`.
- Produces: `auth()`, `signIn()`, `signOut()` dari `@/lib/auth`; `authConfig` dari `@/lib/auth.config` (dipakai middleware Task 6); `session.user.role: "USER" | "ADMIN"` dan `session.user.id`.

- [ ] **Step 1: Install**

```powershell
npm install next-auth@beta
```

- [ ] **Step 2: Config edge-safe**

Create `web/src/lib/auth.config.ts` (TANPA import prisma/bcrypt — file ini ikut dibundel ke middleware):

```ts
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [], // provider ditambahkan di auth.ts (server-only)
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: "USER" | "ADMIN" }).role ?? "USER";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "USER" | "ADMIN";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
```

- [ ] **Step 3: NextAuth full (server)**

Create `web/src/lib/auth.ts`:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validation/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user) return null;

        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
});
```

Create `web/src/types/next-auth.d.ts`:

```ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
    } & DefaultSession["user"];
  }
  interface User {
    role: "USER" | "ADMIN";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "USER" | "ADMIN";
  }
}
```

Create `web/src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 4: Server actions login & register**

Create `web/src/app/actions/auth.ts`:

```ts
"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/validation/auth";

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/account",
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Email atau password salah." };
    }
    throw err; // redirect() dari signIn dilempar sebagai error — biarkan lewat
  }
}

export async function registerAction(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid." };
  }

  const existing = await db.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) return { error: "Email sudah terdaftar." };

  const passwordHash = await hashPassword(parsed.data.password);
  await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
      },
    });
    await tx.wallet.create({ data: { userId: user.id } });
  });

  redirect("/login?registered=1");
}
```

- [ ] **Step 5: Halaman login & register (fungsional dulu, dipercantik Task 7)**

Create `web/src/app/login/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Masuk ke DannShop</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="rounded border p-2"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Password"
          className="rounded border p-2"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black p-2 text-white disabled:opacity-50"
        >
          {pending ? "Memproses..." : "Masuk"}
        </button>
      </form>
      <p className="text-sm">
        Belum punya akun?{" "}
        <Link href="/register" className="underline">
          Daftar
        </Link>
      </p>
    </main>
  );
}
```

Create `web/src/app/register/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "@/app/actions/auth";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, undefined);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Daftar Member DannShop</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <input name="name" required placeholder="Nama" className="rounded border p-2" />
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="rounded border p-2"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Password (min. 8 karakter)"
          className="rounded border p-2"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black p-2 text-white disabled:opacity-50"
        >
          {pending ? "Memproses..." : "Daftar"}
        </button>
      </form>
      <p className="text-sm">
        Sudah punya akun?{" "}
        <Link href="/login" className="underline">
          Masuk
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Verifikasi manual end-to-end**

```powershell
npm run dev
```

1. Buka `http://localhost:3000/register` → daftar user baru → redirect ke `/login?registered=1`.
2. Login dengan user baru → masuk (redirect `/account` — masih 404, itu diperbaiki Task 6/7; yang penting tidak balik ke login dengan error).
3. Login dengan password salah → muncul "Email atau password salah."
4. Login `admin@dannshop.test` + `ADMIN_PASSWORD` dari `.env` → sukses.

Expected: keempat perilaku sesuai. Hentikan server.

- [ ] **Step 7: Jalankan test regresi + commit**

Run: `npm run test` — Expected: semua PASS.

```powershell
cd ..; git add web; git commit -m "feat(web): auth.js v5 credentials login + register member"
```

---

### Task 6: Middleware Proteksi Route

**Files:**
- Create: `web/src/middleware.ts`, `web/src/app/account/page.tsx`, `web/src/app/admin/page.tsx` (placeholder sementara, layout menyusul Task 7)

**Interfaces:**
- Consumes: `authConfig` dari `@/lib/auth.config` (edge-safe, tanpa prisma).
- Produces: `/admin/*` hanya ADMIN; `/account/*` hanya login; lainnya publik.

- [ ] **Step 1: Middleware**

Create `web/src/middleware.ts`:

```ts
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const user = req.auth?.user;

  if (nextUrl.pathname.startsWith("/admin")) {
    if (!user || user.role !== "ADMIN") {
      return Response.redirect(new URL("/login", nextUrl));
    }
  }

  if (nextUrl.pathname.startsWith("/account")) {
    if (!user) {
      return Response.redirect(new URL("/login", nextUrl));
    }
  }
});

export const config = {
  matcher: ["/admin/:path*", "/account/:path*"],
};
```

- [ ] **Step 2: Halaman placeholder**

Create `web/src/app/account/page.tsx`:

```tsx
import { auth } from "@/lib/auth";

export default async function AccountPage() {
  const session = await auth();
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Akun Saya</h1>
      <p>Halo, {session?.user?.name} ({session?.user?.email})</p>
      <p>Saldo & riwayat transaksi hadir di Fase 4.</p>
    </main>
  );
}
```

Create `web/src/app/admin/page.tsx`:

```tsx
import { auth } from "@/lib/auth";

export default async function AdminDashboardPage() {
  const session = await auth();
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard Admin</h1>
      <p>Login sebagai: {session?.user?.email} (role: {session?.user?.role})</p>
    </div>
  );
}
```

- [ ] **Step 3: Verifikasi manual**

```powershell
npm run dev
```

1. Tanpa login (incognito): buka `/admin` → redirect ke `/login`. Buka `/account` → redirect ke `/login`.
2. Login sebagai member biasa → `/account` terbuka; `/admin` → redirect ke `/login`.
3. Login sebagai `admin@dannshop.test` → `/admin` terbuka, menampilkan email + role ADMIN.

Expected: ketiganya sesuai. Hentikan server.

- [ ] **Step 4: Commit**

```powershell
cd ..; git add web; git commit -m "feat(web): middleware proteksi /admin (ADMIN) dan /account (login)"
```

---

### Task 7: Layout UI — Shell Publik + Shell Admin (shadcn/ui)

**Files:**
- Create: `web/src/app/(public)/layout.tsx`, `web/src/app/(public)/page.tsx`, `web/src/app/admin/layout.tsx`, `web/src/components/site-header.tsx`, `web/src/components/site-footer.tsx`
- Modify: `web/src/app/layout.tsx` (metadata brand), hapus `web/src/app/page.tsx` bawaan (pindah ke `(public)/page.tsx`)

**Interfaces:**
- Consumes: `auth()` + `signOut` dari `@/lib/auth`.
- Produces: route group `(public)` dengan header/footer; `/admin/*` dengan sidebar + guard server-side kedua (defense in depth di atas middleware).

- [ ] **Step 1: Init shadcn/ui**

```powershell
npx shadcn@latest init -d
npx shadcn@latest add button card input label
```

Expected: folder `web/src/components/ui/` berisi `button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`.

- [ ] **Step 2: Root metadata**

Modify `web/src/app/layout.tsx` — ganti export `metadata`:

```tsx
export const metadata: Metadata = {
  title: { default: "DannShop — Topup Game & PPOB", template: "%s | DannShop" },
  description:
    "Topup game, pulsa, e-money, dan PLN — murah, cepat, otomatis 24 jam.",
};
```

(Biarkan sisa file bawaan create-next-app apa adanya.)

- [ ] **Step 3: Header & footer publik**

Create `web/src/components/site-header.tsx`:

```tsx
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold">
          DannShop
        </Link>
        <nav className="flex items-center gap-2">
          {session?.user ? (
            <>
              {session.user.role === "ADMIN" && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin">Admin</Link>
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href="/account">Akun</Link>
              </Button>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <Button type="submit" variant="outline" size="sm">
                  Keluar
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Masuk</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Daftar</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
```

Create `web/src/components/site-footer.tsx`:

```tsx
export function SiteFooter() {
  return (
    <footer className="border-t py-6 text-center text-sm text-muted-foreground">
      © {new Date().getFullYear()} DannShop. Topup game & PPOB otomatis 24 jam.
    </footer>
  );
}
```

- [ ] **Step 4: Route group publik + home**

Create `web/src/app/(public)/layout.tsx`:

```tsx
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <SiteFooter />
    </div>
  );
}
```

Delete `web/src/app/page.tsx` (bawaan create-next-app), lalu create `web/src/app/(public)/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl bg-muted p-8">
        <h1 className="text-3xl font-bold">Topup Game & PPOB Otomatis</h1>
        <p className="mt-2 text-muted-foreground">
          Katalog produk hadir di Fase 2 — halaman ini placeholder fondasi.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["Games", "Pulsa & Data", "E-Money"].map((c) => (
          <Card key={c}>
            <CardHeader>
              <CardTitle>{c}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Segera hadir
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Shell admin + guard kedua**

Create `web/src/app/admin/layout.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

const MENU = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Produk & Harga" },
  { href: "/admin/providers", label: "Providers" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-muted/40 p-4">
        <p className="mb-4 text-lg font-bold">DannShop Admin</p>
        <nav className="flex flex-col gap-1 text-sm">
          {MENU.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="rounded px-2 py-1.5 hover:bg-muted"
            >
              {m.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

(Menu Orders/Produk/Providers sengaja menunjuk route yang belum ada — 404 sampai fase terkait. Itu ekspektasi, bukan bug.)

- [ ] **Step 6: Verifikasi manual + build**

```powershell
npm run dev
```
1. `/` → home dengan header (Masuk/Daftar) + footer.
2. Login admin → header menampilkan tombol Admin/Akun/Keluar; `/admin` → sidebar + dashboard.
3. Tombol Keluar → kembali jadi guest.

Hentikan server, lalu pastikan produksi bisa build:

```powershell
npm run build
```
Expected: build sukses tanpa error TypeScript.

- [ ] **Step 7: Test regresi + commit**

Run: `npm run test` — Expected: semua PASS.

```powershell
cd ..; git add web; git commit -m "feat(web): layout publik + shell admin (shadcn/ui)"
```

---

## Definisi Selesai Fase 1 (dari spec §12)

- [ ] `npx prisma migrate status` → up to date; seluruh tabel spec §4 ada
- [ ] `npm run test` hijau
- [ ] `npm run build` sukses
- [ ] Register member → login → `/account` terbuka
- [ ] Login admin → `/admin` terbuka; member/guest diblokir dari `/admin`
- [ ] Seed idempotent (dua kali jalan tanpa error)
