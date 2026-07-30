# Fase 7c: Hardening Keamanan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tutup 2 Critical + 4 High dari audit keamanan Fase 7c (`docs/superpowers/specs/2026-07-30-fase-7c-security-hardening-audit.md`) sesuai spec desain final (`docs/superpowers/specs/2026-07-30-fase-7c-security-hardening-design.md`).

**Architecture:** 6 fix independen dikerjakan berurutan: (1) reorder verifikasi signature webhook Midtrans menutup C-1+H-2, (2) tabel `RateLimit` + fixed-window limiter menutup H-1, (3) kolom `Order.publicToken` mengganti kunci akses invoice/status API menutup C-2, (4) `getAdapter`+pure function filter menghormati `ProviderConfig.isActive` menutup H-3, (5) reuse `User.updatedAt` sebagai session-version gratis (tanpa migrasi) menutup H-4.

**Tech Stack:** Next.js 16 (App Router, Server Actions, route handlers), Prisma/MySQL, NextAuth v5 (JWT strategy), Vitest.

## Global Constraints

- Semua output/pesan error yang dilihat user tetap Bahasa Indonesia (konvensi repo, semua pesan error existing sudah begitu).
- TDD penuh HANYA untuk pure function baru/berubah (`checkRateLimit`, `extractIp`, `computeWindowStart`, `selectFulfillmentSku`, `isItemPurchasable`, `getAdapter`) — job handler/route/Server Action orchestration TIDAK punya test otomatis, konsisten konvensi repo (diverifikasi: `tests/jobs-runner.test.ts` cuma test `computeBackoff`/`decideAfterFailure`, bukan handler; tidak ada test untuk route webhook).
- JANGAN konsolidasi 3 salinan `requireAdmin()` (`catalog.ts`, `orders.ts`, `providers.ts`) jadi satu helper — duplikasi ini sengaja (ada komentar eksplisit di kode: file `"use server"` di Next.js 16 cuma boleh export async function).
- JANGAN sentuh `web/src/app/admin/orders/[orderNumber]/` — route admin ini beda dari route publik `web/src/app/invoice/[orderNumber]/` yang di-rename Task 5; admin sudah terproteksi middleware+`requireAdmin()`, tidak ada isu IDOR di situ, TIDAK di-rename.
- Rate limiter (`checkRateLimit`) HARUS fail-open (return `allowed: true`) kalau DB error selain race unique-constraint — jangan sampai DB down mengunci seluruh app (spec §6).
- JANGAN kerjakan item Medium/Low dari audit (security header, QR pihak ketiga, dst) — di luar scope Fase 7c.
- Commit tiap task selesai (test hijau dulu), pesan commit format `fix(fase7c): <ringkas>`.

---

## Task 1: Migrasi Prisma — `Order.publicToken` + model `RateLimit`

**Files:**
- Modify: `web/prisma/schema.prisma`

**Interfaces:**
- Produces: `Order.publicToken: string` (unique, `@default(cuid())`, terisi otomatis di semua row termasuk yang lama) — dipakai Task 5. Model `RateLimit { id, key (unique), windowStart, count }` — dipakai Task 3.

- [ ] **Step 1: Tambah field `publicToken` ke model `Order`**

Di `web/prisma/schema.prisma`, cari model `Order` (baris 204-229). Tambah field baru persis setelah `orderNumber` dan index baru sebelum penutup `}`:

```prisma
model Order {
  id            String               @id @default(cuid())
  orderNumber   String               @unique // INV-YYYYMMDD-XXXX
  publicToken   String               @unique @default(cuid()) // kunci akses invoice/status API - tidak tertebak (beda dari orderNumber yang cuma 4 digit/hari)
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
  manualSn      String?              @db.Text
  payment       OrderPayment?
  fulfillments  OrderFulfillment[]
  statusHistory OrderStatusHistory[]
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt

  @@index([status, createdAt])
  @@index([publicToken])
}
```

- [ ] **Step 2: Tambah model `RateLimit`**

Di `web/prisma/schema.prisma`, tambah model baru ini (posisi bebas, taruh setelah model `Job` baris ~327 supaya dekat model infra lain):

```prisma
model RateLimit {
  id          String   @id @default(cuid())
  key         String   @unique // contoh: "login:ip:1.2.3.4:1753862400000" (endpoint:tipe:nilai:windowStartMs)
  windowStart DateTime
  count       Int      @default(1)

  @@index([windowStart])
}
```

- [ ] **Step 3: Jalankan migrasi**

Run: `cd web && npx prisma migrate dev --name fase7c_public_token_rate_limit`

Expected: migrasi baru muncul di `web/prisma/migrations/`, output "Your database is now in sync with your schema", Prisma Client regenerated otomatis.

- [ ] **Step 4: Verifikasi tidak ada regresi**

Run: `cd web && npm test`

Expected: semua test yang sudah ada tetap PASS (tidak ada test yang bergantung pada shape lama `Order`/absennya `RateLimit`).

- [ ] **Step 5: Commit**

```bash
git add web/prisma/schema.prisma web/prisma/migrations
git commit -m "fix(fase7c): migrasi Order.publicToken + model RateLimit"
```

---

## Task 2: C-1 + H-2 — Reorder verifikasi signature webhook Midtrans

**Files:**
- Modify: `web/src/app/api/webhooks/midtrans/route.ts`

**Interfaces:**
- Consumes: `verifyMidtransSignature` (sudah ada, `@/lib/midtrans/signature`), `db.webhookEvent` (Prisma).
- Produces: tidak ada interface baru untuk task lain — task ini berdiri sendiri, mengubah urutan operasi di dalam `POST()`.

- [ ] **Step 1: Tulis ulang `POST()` — signature diverifikasi sebelum `WebhookEvent` disentuh, body dibatasi, header dibatasi whitelist**

Ganti seluruh isi `web/src/app/api/webhooks/midtrans/route.ts` jadi:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyMidtransSignature } from "@/lib/midtrans/signature";
import { getTransactionStatus } from "@/lib/midtrans/client";
import { mapMidtransStatus } from "@/lib/midtrans/status-mapping";
import { dispatchFulfillment } from "@/lib/order/fulfillment";

const MAX_BODY_BYTES = 16_000;
const ALLOWED_HEADER_KEYS = ["content-type", "x-forwarded-for", "user-agent"];

function pickAllowedHeaders(headers: Headers): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const key of ALLOWED_HEADER_KEYS) {
    const value = headers.get(key);
    if (value !== null) picked[key] = value;
  }
  return picked;
}

const notifSchema = z.object({
  order_id: z.string(),
  status_code: z.string(),
  gross_amount: z.string(),
  signature_key: z.string(),
  transaction_status: z.string(),
});

async function handleOrderWebhook(
  order: { id: string },
  notif: z.infer<typeof notifSchema>,
): Promise<string> {
  const confirmed = await getTransactionStatus(notif.order_id);
  const mapped = mapMidtransStatus(confirmed.transactionStatus, confirmed.fraudStatus);

  if (mapped === "paid") {
    const claimed = await db.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { status: "PAID" },
    });
    if (claimed.count > 0) {
      await db.orderPayment.update({
        where: { orderId: order.id },
        data: { status: "PAID", rawResponse: confirmed.raw as object },
      });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "PAID", note: "Midtrans settlement" },
      });
      await dispatchFulfillment(order.id);
    } else {
      // Order sudah bukan PENDING_PAYMENT lagi - kemungkinan webhook retry
      // setelah percobaan sebelumnya sempat klaim PAID tapi belum sempat
      // dispatch. dispatchFulfillment aman dipanggil ulang (klaim atomik
      // PAID->PROCESSING di dalamnya, no-op kalau sudah PROCESSING/lain).
      const current = await db.order.findUnique({ where: { id: order.id }, select: { status: true } });
      if (current?.status === "PAID") {
        await dispatchFulfillment(order.id);
      }
    }
  } else if (mapped === "failed" || mapped === "expired") {
    const newStatus = mapped === "expired" ? "EXPIRED" : "FAILED";
    const claimed = await db.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { status: newStatus },
    });
    if (claimed.count > 0) {
      await db.orderPayment.update({ where: { orderId: order.id }, data: { status: newStatus } });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: newStatus, note: "Midtrans notification" },
      });
    }
  }

  return mapped;
}

async function handleDepositWebhook(
  deposit: { id: string },
  notif: z.infer<typeof notifSchema>,
): Promise<string> {
  const confirmed = await getTransactionStatus(notif.order_id);
  const mapped = mapMidtransStatus(confirmed.transactionStatus, confirmed.fraudStatus);

  if (mapped === "paid") {
    let claimedCount = 0;
    try {
      await db.$transaction(async (tx) => {
        const claimed = await tx.deposit.updateMany({
          where: { id: deposit.id, status: "PENDING" },
          data: { status: "PAID" },
        });
        claimedCount = claimed.count;
        if (claimed.count > 0) {
          const full = await tx.deposit.findUniqueOrThrow({ where: { id: deposit.id } });
          const wallet = await tx.wallet.update({
            where: { userId: full.userId },
            data: { balance: { increment: full.amount } },
          });
          await tx.walletLedger.create({
            data: {
              walletId: wallet.id,
              type: "DEPOSIT",
              amount: full.amount,
              balanceAfter: wallet.balance,
              referenceType: "deposit",
              referenceId: full.id,
              idempotencyKey: `deposit:${full.id}`,
            },
          });
        }
      });
    } catch (e) {
      console.error("Webhook Midtrans deposit: gagal kredit saldo", { depositId: deposit.id, eventKey: `midtrans:${notif.order_id}`, error: e });
      throw e;
    }

    if (claimedCount === 0) {
      // Deposit sudah bukan PENDING lagi saat settlement "paid" ini masuk.
      // Cek status terkini: kalau sudah PAID, ini cuma notifikasi duplikat
      // (aman, no-op). Tapi kalau statusnya EXPIRED/FAILED, berarti dana
      // sudah masuk di Midtrans tapi saldo member TIDAK pernah dikredit -
      // kemungkinan race dengan job expire-deposit (klok expiry Midtrans
      // beda titik mulai karena chargeQris tidak kirim custom_expiry).
      const current = await db.deposit.findUnique({ where: { id: deposit.id }, select: { status: true } });
      if (current?.status !== "PAID") {
        console.error(
          "Webhook Midtrans deposit: settlement 'paid' datang setelah deposit tidak lagi PENDING - saldo BELUM dikredit, perlu investigasi manual",
          { depositId: deposit.id, statusSaatIni: current?.status, eventKey: `midtrans:${notif.order_id}` },
        );
        return "paid_but_not_pending";
      }
    }
  } else if (mapped === "failed" || mapped === "expired") {
    const newStatus = mapped === "expired" ? "EXPIRED" : "FAILED";
    await db.deposit.updateMany({ where: { id: deposit.id, status: "PENDING" }, data: { status: newStatus } });
  }

  return mapped;
}

export async function POST(request: Request) {
  if (!process.env.MIDTRANS_SERVER_KEY) {
    console.error("Webhook Midtrans: MIDTRANS_SERVER_KEY tidak di-set di environment");
    return NextResponse.json({ error: "Konfigurasi server tidak lengkap" }, { status: 500 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body request terlalu besar" }, { status: 413 });
  }

  let notif: z.infer<typeof notifSchema>;
  try {
    const json = JSON.parse(rawBody);
    const parsed = notifSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
    notif = parsed.data;
  } catch {
    return NextResponse.json({ error: "Bukan JSON valid" }, { status: 400 });
  }

  // Signature diverifikasi PALING AWAL, sebelum WebhookEvent disentuh sama
  // sekali - request dengan signature salah tidak boleh bisa "mengunci"
  // eventKey (mencegah settlement asli terblokir dedup palsu) atau menulis
  // row apa pun (mencegah storage exhaustion oleh request tak terautentikasi).
  if (!verifyMidtransSignature(notif, process.env.MIDTRANS_SERVER_KEY!)) {
    return NextResponse.json({ error: "Signature tidak valid" }, { status: 403 });
  }

  const eventKey = `midtrans:${notif.order_id}:${notif.transaction_status}`;

  let webhookEvent = await db.webhookEvent.findUnique({ where: { eventKey } });
  if (webhookEvent?.processedAt) {
    return NextResponse.json({ ok: true, deduped: true });
  }
  if (!webhookEvent) {
    try {
      webhookEvent = await db.webhookEvent.create({
        data: {
          source: "midtrans",
          externalRef: notif.order_id,
          eventKey,
          rawBody,
          headers: pickAllowedHeaders(request.headers),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        // race: request lain barusan insert row yang sama - ambil ulang, lanjut proses row itu
        webhookEvent = await db.webhookEvent.findUnique({ where: { eventKey } });
        if (webhookEvent?.processedAt) return NextResponse.json({ ok: true, deduped: true });
      } else {
        throw e;
      }
    }
  }

  const markProcessed = (result: string) =>
    db.webhookEvent.update({ where: { eventKey }, data: { processedAt: new Date(), processResult: result } });

  try {
    const order = await db.order.findUnique({ where: { orderNumber: notif.order_id } });
    if (order) {
      const result = await handleOrderWebhook(order, notif);
      await markProcessed(result);
      return NextResponse.json({ ok: true });
    }

    const deposit = await db.deposit.findUnique({ where: { id: notif.order_id } });
    if (deposit) {
      const result = await handleDepositWebhook(deposit, notif);
      await markProcessed(result);
      return NextResponse.json({ ok: true });
    }

    await markProcessed("order_not_found");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Webhook Midtrans: gagal proses", { orderId: notif.order_id, eventKey, error: e });
    // JANGAN markProcessed di sini - biarkan processedAt tetap null supaya retry Midtrans bisa reprocess penuh
    return NextResponse.json({ error: "Gagal memproses notifikasi, akan dicoba lagi" }, { status: 500 });
  }
}
```

Catatan: `handleOrderWebhook`/`handleDepositWebhook`/`notifSchema` TIDAK berubah dari versi sebelumnya — cuma urutan operasi di `POST()` yang direorganisasi (signature dulu, body-size guard sebelum parse, header whitelist saat insert).

- [ ] **Step 2: Verifikasi tidak ada regresi**

Run: `cd web && npm test`

Expected: semua test PASS (tidak ada test otomatis untuk route ini — konsisten konvensi repo — jadi ini murni cek tidak ada breakage di modul lain yang meng-import dari file ini).

Run: `cd web && npx tsc --noEmit`

Expected: tidak ada error TypeScript baru.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/webhooks/midtrans/route.ts
git commit -m "fix(fase7c): C-1+H-2 verifikasi signature webhook sebelum sentuh WebhookEvent, batasi body & header"
```

---

## Task 3: H-1 — Fungsi inti rate limiting (`checkRateLimit`, `extractIp`)

**Files:**
- Create: `web/src/lib/rate-limit.ts`
- Test: `web/tests/rate-limit.test.ts`

**Interfaces:**
- Produces:
  - `checkRateLimit(key: string, limit: number, windowMs: number, now?: Date, dbClient?: DbLike): Promise<{ allowed: boolean; retryAfterMs?: number }>` — dipakai Task 4 (proxy.ts, checkout.ts, auth.ts) dan Task 7.
  - `extractIp(headers: Headers): string` — dipakai Task 4.
  - `computeWindowStart(now: Date, windowMs: number): Date` — helper internal, diekspor supaya testable langsung.

- [ ] **Step 1: Tulis test yang gagal**

Buat `web/tests/rate-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { checkRateLimit, computeWindowStart, extractIp } from "@/lib/rate-limit";

function fakeDb() {
  const rows = new Map<string, { count: number }>();
  return {
    rateLimit: {
      create: async ({ data }: { data: { key: string; count: number } }) => {
        if (rows.has(data.key)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "6.0.0",
          });
        }
        rows.set(data.key, { count: data.count });
        return {};
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { key: string; count: { lt: number } };
        data: { count: { increment: number } };
      }) => {
        const row = rows.get(where.key);
        if (!row || row.count >= where.count.lt) return { count: 0 };
        row.count += data.count.increment;
        return { count: 1 };
      },
    },
  };
}

describe("computeWindowStart", () => {
  it("membulatkan ke bawah kelipatan windowMs", () => {
    const now = new Date("2026-07-30T10:03:27.000Z");
    expect(computeWindowStart(now, 60_000).toISOString()).toBe("2026-07-30T10:03:00.000Z");
  });
});

describe("extractIp", () => {
  it("ambil IP pertama dari x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(extractIp(headers)).toBe("1.2.3.4");
  });

  it("header kosong → \"unknown\"", () => {
    expect(extractIp(new Headers())).toBe("unknown");
  });
});

describe("checkRateLimit", () => {
  it("request pertama di window → allowed", async () => {
    const dbClient = fakeDb();
    const now = new Date("2026-07-30T10:00:00.000Z");
    const result = await checkRateLimit("login:ip:1.2.3.4", 3, 60_000, now, dbClient as never);
    expect(result).toEqual({ allowed: true });
  });

  it("request di bawah limit dalam window sama → allowed", async () => {
    const dbClient = fakeDb();
    await checkRateLimit("login:ip:1.2.3.4", 3, 60_000, new Date("2026-07-30T10:00:00.000Z"), dbClient as never);
    const second = await checkRateLimit(
      "login:ip:1.2.3.4",
      3,
      60_000,
      new Date("2026-07-30T10:00:10.000Z"),
      dbClient as never,
    );
    expect(second).toEqual({ allowed: true });
  });

  it("request melewati limit di window sama → denied dengan retryAfterMs", async () => {
    const dbClient = fakeDb();
    await checkRateLimit("login:ip:1.2.3.4", 2, 60_000, new Date("2026-07-30T10:00:00.000Z"), dbClient as never);
    await checkRateLimit("login:ip:1.2.3.4", 2, 60_000, new Date("2026-07-30T10:00:10.000Z"), dbClient as never);
    const third = await checkRateLimit(
      "login:ip:1.2.3.4",
      2,
      60_000,
      new Date("2026-07-30T10:00:20.000Z"),
      dbClient as never,
    );
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBe(40_000);
  });

  it("window baru → limit reset, allowed lagi", async () => {
    const dbClient = fakeDb();
    await checkRateLimit("login:ip:1.2.3.4", 1, 60_000, new Date("2026-07-30T10:00:00.000Z"), dbClient as never);
    const deniedSameWindow = await checkRateLimit(
      "login:ip:1.2.3.4",
      1,
      60_000,
      new Date("2026-07-30T10:00:30.000Z"),
      dbClient as never,
    );
    expect(deniedSameWindow.allowed).toBe(false);
    const nextWindow = await checkRateLimit(
      "login:ip:1.2.3.4",
      1,
      60_000,
      new Date("2026-07-30T10:01:05.000Z"),
      dbClient as never,
    );
    expect(nextWindow.allowed).toBe(true);
  });

  it("error DB selain unique-constraint → fail-open (allowed)", async () => {
    const dbClient = {
      rateLimit: {
        create: async () => {
          throw new Error("connection refused");
        },
        updateMany: async () => ({ count: 0 }),
      },
    };
    const result = await checkRateLimit("login:ip:1.2.3.4", 1, 60_000, new Date(), dbClient as never);
    expect(result.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd web && npx vitest run tests/rate-limit.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rate-limit'`.

- [ ] **Step 3: Implementasi**

Buat `web/src/lib/rate-limit.ts`:

```ts
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

type DbLike = {
  rateLimit: {
    create: (args: { data: { key: string; windowStart: Date; count: number } }) => Promise<unknown>;
    updateMany: (args: {
      where: { key: string; count: { lt: number } };
      data: { count: { increment: number } };
    }) => Promise<{ count: number }>;
  };
};

export function computeWindowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export function extractIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

// Fixed-window rate limiter berbasis tabel RateLimit (bukan in-memory) supaya
// tidak "reset" begitu proses Node restart (deploy/crash/PM2 respawn di
// shared hosting) - spec Fase 7c §H-1.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: Date = new Date(),
  dbClient: DbLike = db as unknown as DbLike,
): Promise<RateLimitResult> {
  const windowStart = computeWindowStart(now, windowMs);
  const fullKey = `${key}:${windowStart.getTime()}`;
  const retryAfterMs = windowStart.getTime() + windowMs - now.getTime();

  try {
    await dbClient.rateLimit.create({ data: { key: fullKey, windowStart, count: 1 } });
    return { allowed: true };
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") {
      // DB error selain race unique-constraint - fail-open, jangan sampai
      // DB bermasalah mengunci seluruh app (spec §6).
      console.error("checkRateLimit: gagal cek limit, fail-open", { key, error: e });
      return { allowed: true };
    }
    // race: request lain di window sama barusan insert row-nya duluan - lanjut ke klaim atomik di bawah
  }

  const claimed = await dbClient.rateLimit.updateMany({
    where: { key: fullKey, count: { lt: limit } },
    data: { count: { increment: 1 } },
  });
  if (claimed.count === 0) return { allowed: false, retryAfterMs };
  return { allowed: true };
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd web && npx vitest run tests/rate-limit.test.ts`
Expected: semua test PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/rate-limit.ts web/tests/rate-limit.test.ts
git commit -m "fix(fase7c): H-1 fungsi inti checkRateLimit (fixed-window, tabel RateLimit)"
```

---

## Task 4: H-1 — Pasang rate limiting (proxy, login/checkout, job cleanup)

**Files:**
- Modify: `web/src/proxy.ts`
- Modify: `web/src/lib/jobs/runner.ts`
- Modify: `web/src/app/actions/checkout.ts`
- Modify: `web/src/app/actions/auth.ts`

**Interfaces:**
- Consumes: `checkRateLimit`, `extractIp` dari Task 3.
- Produces: tidak ada interface baru untuk task lain.

- [ ] **Step 1: Perluas matcher `proxy.ts` + pasang limiter per-endpoint**

Ganti seluruh isi `web/src/proxy.ts` jadi:

```ts
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";

const { auth } = NextAuth(authConfig);

const RATE_LIMITS: { match: (pathname: string) => boolean; key: string; limit: number; windowMs: number }[] = [
  { match: (p) => p === "/login", key: "login", limit: 5, windowMs: 60_000 },
  { match: (p) => p === "/register", key: "register", limit: 3, windowMs: 60_000 },
  { match: (p) => p === "/api/webhooks/midtrans", key: "webhook", limit: 60, windowMs: 60_000 },
  { match: (p) => p === "/api/cron/tick", key: "cron-tick", limit: 10, windowMs: 60_000 },
  { match: (p) => /^\/api\/orders\/[^/]+\/status$/.test(p), key: "order-status", limit: 30, windowMs: 60_000 },
];

export default auth(async (req) => {
  const { nextUrl } = req;
  const user = req.auth?.user;
  const ip = extractIp(req.headers);

  const rule = RATE_LIMITS.find((r) => r.match(nextUrl.pathname));
  if (rule) {
    const result = await checkRateLimit(`${rule.key}:ip:${ip}`, rule.limit, rule.windowMs);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan, coba lagi sebentar lagi." },
        {
          status: 429,
          headers: result.retryAfterMs ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) } : undefined,
        },
      );
    }
  }

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
  matcher: ["/admin/:path*", "/account/:path*", "/login", "/register", "/api/:path*"],
};
```

(Revalidasi `updatedAt` admin ditambahkan belakangan di Task 7 — file ini akan di-edit lagi di situ, jangan bingung kalau kontennya bertambah.)

- [ ] **Step 2: Tambah job self-reschedule `cleanup-rate-limits`**

Di `web/src/lib/jobs/runner.ts`, tambah entri baru ke `handlers` (taruh setelah blok `"check-provider-balance"`, sebelum `"recheck-fulfillment"`, baris ~159-161):

```ts
  "cleanup-rate-limits": async () => {
    const STALE_HOURS = 2;
    const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60_000);
    const deleted = await db.rateLimit.deleteMany({ where: { windowStart: { lt: staleThreshold } } });
    // Self-reschedule tiap 1 jam, pola sama seperti check-provider-balance.
    await db.job.create({
      data: { type: "cleanup-rate-limits", payload: {}, runAt: new Date(Date.now() + 60 * 60_000) },
    });
    return `deleted=${deleted.count}`;
  },

```

Lalu di fungsi `ensureRecurringJobs()`, tambah guard block baru persis sebelum `return`-nya (setelah blok `existingBalanceCheck`, baris ~257-259):

```ts
  // Job RUNNING dianggap basi kalau sudah RUNNING lebih lama dari threshold ini -
  // guard yang sama persis dengan reconcile-paid-orders/check-provider-balance di atas.
  const CLEANUP_RATE_LIMITS_RUNNING_STALE_MINUTES = 10;
  const cleanupRateLimitsRunningFreshAfter = new Date(Date.now() - CLEANUP_RATE_LIMITS_RUNNING_STALE_MINUTES * 60_000);
  const existingCleanupRateLimits = await db.job.findFirst({
    where: {
      type: "cleanup-rate-limits",
      OR: [
        { status: "PENDING" },
        { status: "RUNNING", updatedAt: { gt: cleanupRateLimitsRunningFreshAfter } },
      ],
    },
  });
  if (!existingCleanupRateLimits) {
    await db.job.create({ data: { type: "cleanup-rate-limits", payload: {}, runAt: new Date() } });
  }
```

- [ ] **Step 3: Rate limit checkout guest (per-IP, 3/menit)**

Di `web/src/app/actions/checkout.ts`, tambah import baru di baris paling atas (setelah baris 10 `dispatchFulfillment`):

```ts
import { headers } from "next/headers";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";
```

Lalu di `createCheckoutOrder`, setelah baris `const userId = session?.user?.id ?? null;` (baris 47) dan sebelum blok `if (parsed.data.paymentMethod === "balance" && !userId)` (baris 49), sisipkan:

```ts
  if (!userId) {
    const ip = extractIp(await headers());
    const guestLimit = await checkRateLimit(`checkout:ip:${ip}`, 3, 60_000);
    if (!guestLimit.allowed) return { error: "Terlalu banyak percobaan checkout, coba lagi sebentar lagi." };
  }

```

- [ ] **Step 4: Rate limit login per-email (20/jam, tambahan dari limit per-IP di proxy.ts)**

Di `web/src/app/actions/auth.ts`, tambah import baru setelah baris 8 (`registerSchema`):

```ts
import { checkRateLimit } from "@/lib/rate-limit";
```

Lalu di awal `loginAction` (sebelum `try {` baris 14), sisipkan:

```ts
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email) {
    const emailLimit = await checkRateLimit(`login:email:${email}`, 20, 60 * 60_000);
    if (!emailLimit.allowed) return { error: "Terlalu banyak percobaan login untuk akun ini, coba lagi nanti." };
  }

```

- [ ] **Step 5: Verifikasi**

Run: `cd web && npm test`
Expected: semua test PASS.

Run: `cd web && npx tsc --noEmit`
Expected: tidak ada error TypeScript baru.

- [ ] **Step 6: Commit**

```bash
git add web/src/proxy.ts web/src/lib/jobs/runner.ts web/src/app/actions/checkout.ts web/src/app/actions/auth.ts
git commit -m "fix(fase7c): H-1 pasang rate limiting di proxy, checkout guest, login, + job cleanup"
```

---

## Task 5: C-2 — `publicToken` menggantikan `orderNumber` sebagai kunci akses invoice/status

**Files:**
- Create: `web/src/app/invoice/[token]/page.tsx`
- Create: `web/src/app/invoice/[token]/invoice-status.tsx`
- Create: `web/src/app/api/orders/[token]/status/route.ts`
- Delete: `web/src/app/invoice/[orderNumber]/page.tsx`
- Delete: `web/src/app/invoice/[orderNumber]/invoice-status.tsx`
- Delete: `web/src/app/api/orders/[orderNumber]/status/route.ts`
- Modify: `web/src/app/actions/checkout.ts`
- Modify: `web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx`
- Modify: `web/src/app/account/orders/page.tsx`
- Modify: `web/src/app/account/page.tsx`

**Interfaces:**
- Consumes: `Order.publicToken` dari Task 1.
- Produces: `CheckoutResult.publicToken?: string` — dipakai `product-detail-client.tsx` di task ini sendiri.

- [ ] **Step 1: Tambah `publicToken` ke `CheckoutResult` dan kembalikan dari kedua jalur checkout**

Di `web/src/app/actions/checkout.ts`, ubah interface `CheckoutResult` (baris 14-18):

```ts
export interface CheckoutResult {
  ok?: string;
  error?: string;
  orderNumber?: string;
  publicToken?: string;
}
```

Di `createBalanceOrder`, ganti baris return terakhir (`return { ok: "Order dibuat.", orderNumber: order.orderNumber };`) jadi:

```ts
  return { ok: "Order dibuat.", orderNumber: order.orderNumber, publicToken: order.publicToken };
```

Di `createMidtransOrder`, ganti baris return terakhir (sama persis) jadi:

```ts
  return { ok: "Order dibuat.", orderNumber: order.orderNumber, publicToken: order.publicToken };
```

- [ ] **Step 2: Buat route invoice baru berbasis `[token]`**

Buat `web/src/app/invoice/[token]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { InvoiceStatus } from "./invoice-status";

export const dynamic = "force-dynamic";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await db.order.findUnique({
    where: { publicToken: token },
    include: { payment: true, fulfillments: { orderBy: { attemptNo: "desc" }, take: 1 } },
  });
  if (!order) notFound();

  const actions = order.payment?.actions as { qrString?: string } | null;
  const latestFulfillment = order.fulfillments[0];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-10">
      <Link href="/" className="font-heading text-sm font-bold text-primary hover:underline">
        ← DannShop
      </Link>
      <InvoiceStatus
        token={order.publicToken}
        initial={{
          orderNumber: order.orderNumber,
          status: order.status,
          productName: order.productName,
          itemName: order.itemName,
          total: order.total.toString(),
          qrString: actions?.qrString ?? null,
          expiredAt: order.expiredAt?.toISOString() ?? null,
          sn: latestFulfillment?.status === "SUCCESS" ? latestFulfillment.sn : order.manualSn,
        }}
      />
    </div>
  );
}
```

Buat `web/src/app/invoice/[token]/invoice-status.tsx` (isi sama persis dengan `web/src/app/invoice/[orderNumber]/invoice-status.tsx` yang lama, KECUALI prop diganti `orderNumber` → `token`, dan URL fetch/queryKey ikut pakai `token`; tampilan `order.orderNumber` di JSX TIDAK berubah karena tetap ada di `OrderStatusResponse`):

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const FINAL_STATUSES = ["COMPLETED", "FAILED", "EXPIRED", "REFUNDED", "REFUND_PENDING", "NEEDS_REVIEW"];

interface OrderStatusResponse {
  orderNumber: string;
  status: string;
  productName: string;
  itemName: string;
  total: string;
  qrString: string | null;
  expiredAt: string | null;
  sn: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Menunggu Pembayaran",
  PAID: "Dibayar",
  PROCESSING: "Diproses",
  COMPLETED: "Berhasil",
  EXPIRED: "Kadaluarsa",
  FAILED: "Gagal",
  REFUND_PENDING: "Menunggu Refund",
  REFUNDED: "Direfund",
  NEEDS_REVIEW: "Sedang Ditinjau",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  PENDING_PAYMENT: "muted",
  PAID: "warning",
  PROCESSING: "warning",
  COMPLETED: "success",
  EXPIRED: "destructive",
  FAILED: "destructive",
  REFUND_PENDING: "destructive",
  REFUNDED: "muted",
  NEEDS_REVIEW: "warning",
};

// Ikon per status — status TIDAK boleh hanya dibedakan lewat warna badge (a11y
// color-not-only), jadi setiap status juga punya ikon + label teks sendiri.
const STATUS_ICON: Record<string, typeof Clock> = {
  PENDING_PAYMENT: Clock,
  PAID: Loader2,
  PROCESSING: Loader2,
  COMPLETED: CheckCircle2,
  EXPIRED: XCircle,
  FAILED: XCircle,
  REFUND_PENDING: Clock,
  REFUNDED: RotateCcw,
  NEEDS_REVIEW: AlertTriangle,
};

const SPINNING_STATUSES = new Set(["PAID", "PROCESSING"]);

export function InvoiceStatus({
  token,
  initial,
}: {
  token: string;
  initial: OrderStatusResponse;
}) {
  const [copied, setCopied] = useState(false);
  const { data, isFetching } = useQuery<OrderStatusResponse>({
    queryKey: ["order-status", token],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${token}/status`);
      if (!res.ok) throw new Error("Gagal memuat status order");
      return res.json();
    },
    initialData: initial,
    refetchInterval: (query) => (FINAL_STATUSES.includes(query.state.data?.status ?? "") ? false : 3000),
  });

  const order = data ?? initial;
  const isFinal = FINAL_STATUSES.includes(order.status);
  const StatusIcon = STATUS_ICON[order.status] ?? Clock;

  async function handleCopySn() {
    if (!order.sn) return;
    try {
      await navigator.clipboard.writeText(order.sn);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API bisa tidak tersedia (mis. http tanpa TLS) — abaikan diam-diam
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-muted-foreground">{order.orderNumber}</span>
        <Badge variant={STATUS_VARIANT[order.status] ?? "muted"}>
          <StatusIcon className={cn("size-3", SPINNING_STATUSES.has(order.status) && "animate-spin")} />
          {STATUS_LABEL[order.status] ?? order.status}
        </Badge>
      </div>
      <p className="font-heading text-lg font-bold text-balance">
        {order.productName} · {order.itemName}
      </p>
      <p className="font-heading text-2xl font-bold">
        {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
          Number(order.total),
        )}
      </p>

      {!isFinal && (
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          {isFetching ? "Memeriksa status pembayaran…" : "Status diperbarui otomatis setiap beberapa detik"}
        </div>
      )}

      {order.status === "PENDING_PAYMENT" && order.qrString && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground">Scan QRIS untuk membayar</p>
          <img
            alt="QRIS pembayaran"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(order.qrString)}`}
            width={240}
            height={240}
          />
        </div>
      )}

      {order.status === "COMPLETED" && order.sn && (
        <div className="rounded-md border border-success-foreground/20 bg-success p-4 text-success-foreground">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Serial Number / Voucher</p>
            <button
              type="button"
              onClick={handleCopySn}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              {copied ? (
                <>
                  <Check className="size-3.5" /> Tersalin
                </>
              ) : (
                <>
                  <Copy className="size-3.5" /> Salin
                </>
              )}
            </button>
          </div>
          <p className="mt-1 font-mono text-xl font-bold tracking-wide break-all">{order.sn}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Buat route status baru berbasis `[token]`**

Buat `web/src/app/api/orders/[token]/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await db.order.findUnique({
    where: { publicToken: token },
    include: {
      payment: true,
      fulfillments: { orderBy: { attemptNo: "desc" }, take: 1 },
    },
  });
  if (!order) return NextResponse.json({ error: "Order tidak ditemukan" }, { status: 404 });

  const latestFulfillment = order.fulfillments[0];
  const actions = order.payment?.actions as { qrString?: string } | null;

  return NextResponse.json(
    {
      orderNumber: order.orderNumber,
      status: order.status,
      productName: order.productName,
      itemName: order.itemName,
      total: order.total.toString(),
      qrString: actions?.qrString ?? null,
      expiredAt: order.expiredAt,
      sn: latestFulfillment?.status === "SUCCESS" ? latestFulfillment.sn : order.manualSn,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

- [ ] **Step 4: Hapus route lama berbasis `[orderNumber]`**

```bash
rm -rf "web/src/app/invoice/[orderNumber]"
rm -rf "web/src/app/api/orders/[orderNumber]"
```

- [ ] **Step 5: Update 3 tempat yang generate link `/invoice/...`**

Di `web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx`, ganti baris 41:
```ts
    if (state.orderNumber) router.push(`/invoice/${state.orderNumber}`);
```
jadi:
```ts
    if (state.publicToken) router.push(`/invoice/${state.publicToken}`);
```
dan baris 42 (dependency array `useEffect`) dari `[state.orderNumber, router]` jadi `[state.publicToken, router]`.

Di `web/src/app/account/orders/page.tsx`, ganti baris `href={\`/invoice/${order.orderNumber}\`}` jadi `href={\`/invoice/${order.publicToken}\`}`.

Di `web/src/app/account/page.tsx`, ganti baris `href={\`/invoice/${order.orderNumber}\`}` (di blok `recentOrders.map`) jadi `href={\`/invoice/${order.publicToken}\`}`.

- [ ] **Step 6: Verifikasi**

Run: `cd web && npm test`
Expected: semua test PASS.

Run: `cd web && npx tsc --noEmit`
Expected: tidak ada error TypeScript baru (khususnya tidak ada sisa referensi ke path `[orderNumber]` yang sudah dihapus).

- [ ] **Step 7: Commit**

```bash
git add web/src/app/invoice web/src/app/api/orders web/src/app/actions/checkout.ts \
  "web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx" \
  web/src/app/account/orders/page.tsx web/src/app/account/page.tsx
git commit -m "fix(fase7c): C-2 invoice & status API pakai publicToken, bukan orderNumber (IDOR)"
```

---

## Task 6: H-3 — Kill-switch provider dihormati

**Files:**
- Modify: `web/src/lib/providers/registry.ts`
- Modify: `web/src/lib/order/select-provider.ts`
- Modify: `web/src/lib/catalog/public.ts`
- Modify: `web/src/lib/order/fulfillment.ts`
- Modify: `web/src/app/actions/checkout.ts`
- Test: `web/tests/provider-registry.test.ts`
- Test: `web/tests/order-helpers.test.ts`
- Test: `web/tests/catalog-public.test.ts`

**Interfaces:**
- Produces: `selectFulfillmentSku(item, skus, activeProviders: Set<ProviderKey>): SelectSkuResult` (signature berubah, param baru wajib) dengan reason baru `"provider_inactive"`. `isItemPurchasable(providerSkus, activeProviders: Set<ProviderKey>): boolean` (signature berubah, param baru wajib).

- [ ] **Step 1: Tulis test yang gagal untuk `getAdapter` kill-switch**

Di `web/tests/provider-registry.test.ts`, tambah test baru di dalam `describe("getAdapter", ...)` (setelah test "provider belum didukung"):

```ts
  it("isActive false → error jelas (kill-switch)", async () => {
    const row = {
      key: "DIGIFLAZZ",
      isActive: false,
      credentials: encryptJson({ username: "userX", apiKey: "keyY" }),
    };
    await expect(getAdapter("DIGIFLAZZ", fakeDb(row))).rejects.toThrow(/dinonaktifkan/);
  });
```

Run: `cd web && npx vitest run tests/provider-registry.test.ts`
Expected: FAIL (test baru gagal karena `getAdapter` belum cek `isActive`; test-test lain di file yang sama tetap PASS karena mereka sudah kirim `isActive: true`).

- [ ] **Step 2: Implementasi `getAdapter`**

Di `web/src/lib/providers/registry.ts`, ubah tipe `DbLike` (baris 7) jadi:

```ts
type DbLike = { providerConfig: { findUnique: (args: { where: { key: ProviderKey } }) => Promise<{ credentials: unknown; isActive: boolean } | null> } };
```

Lalu di `getAdapter`, sisipkan pengecekan baru setelah `if (!config) throw ...` (baris 16) dan sebelum pengecekan `credentials`:

```ts
  if (!config) throw new Error(`Provider ${key} belum dikonfigurasi di database.`);
  if (!config.isActive) throw new Error(`Provider ${key} sedang dinonaktifkan.`);
  if (typeof config.credentials !== "string" || config.credentials.length === 0) {
```

- [ ] **Step 3: Jalankan test registry, pastikan lulus**

Run: `cd web && npx vitest run tests/provider-registry.test.ts`
Expected: semua test PASS.

- [ ] **Step 4: Tulis test yang gagal untuk `selectFulfillmentSku` provider nonaktif**

Ganti seluruh isi `web/tests/order-helpers.test.ts` jadi:

```ts
import { describe, expect, it } from "vitest";
import { generateOrderNumber, generateRefId } from "@/lib/order/order-number";
import { buildCustomerNo } from "@/lib/order/customer-no";
import { selectFulfillmentSku } from "@/lib/order/select-provider";

describe("generateOrderNumber", () => {
  it("format INV-YYYYMMDD-XXXX, 4 digit dari random", () => {
    const now = new Date("2026-07-26T10:00:00Z");
    const orderNumber = generateOrderNumber(now, () => 0.1234);
    expect(orderNumber).toBe("INV-20260726-1234");
  });
});

describe("generateRefId", () => {
  it("format PREFIX-YYYYMMDDHHmmss-6KARAKTER uppercase", () => {
    const now = new Date("2026-07-26T10:05:30Z");
    const refId = generateRefId("FUL", now, () => 0.123456789);
    expect(refId).toMatch(/^FUL-20260726100530-[A-Z0-9]{6}$/);
  });
});

describe("buildCustomerNo", () => {
  it("gabung user_id + zone_id tanpa separator sesuai urutan inputFields", () => {
    const result = buildCustomerNo(
      [{ name: "user_id" }, { name: "zone_id" }],
      { user_id: "123456789", zone_id: "1234" },
    );
    expect(result).toBe("1234567891234");
  });

  it("satu field saja (mis. nomor HP) → langsung value-nya", () => {
    expect(buildCustomerNo([{ name: "phone_number" }], { phone_number: "081234567890" })).toBe("081234567890");
  });
});

describe("selectFulfillmentSku", () => {
  const item = { sellingPrice: 22000n };
  const digiflazzActive = new Set<"DIGIFLAZZ" | "OKECONNECT" | "QIOSPAY" | "SERPUL">(["DIGIFLAZZ"]);

  it("pilih SKU DIGIFLAZZ yang ACTIVE", () => {
    const result = selectFulfillmentSku(
      item,
      [{ provider: "DIGIFLAZZ", providerSkuCode: "ML86", costPrice: 19750n, status: "ACTIVE" }],
      digiflazzActive,
    );
    expect(result).toEqual({
      ok: true,
      sku: { provider: "DIGIFLAZZ", providerSkuCode: "ML86", costPrice: 19750n },
    });
  });

  it("tidak ada SKU DIGIFLAZZ ACTIVE → no_provider", () => {
    expect(selectFulfillmentSku(item, [], digiflazzActive)).toEqual({ ok: false, reason: "no_provider" });
    expect(
      selectFulfillmentSku(
        item,
        [{ provider: "DIGIFLAZZ", providerSkuCode: "ML86", costPrice: 19750n, status: "UNAVAILABLE" }],
        digiflazzActive,
      ),
    ).toEqual({ ok: false, reason: "no_provider" });
  });

  it("costPrice > sellingPrice (harga modal naik) → price_increased", () => {
    const result = selectFulfillmentSku(
      item,
      [{ provider: "DIGIFLAZZ", providerSkuCode: "ML86", costPrice: 25000n, status: "ACTIVE" }],
      digiflazzActive,
    );
    expect(result).toEqual({ ok: false, reason: "price_increased" });
  });

  it("provider selain DIGIFLAZZ diabaikan (belum ada adapter di Fase 3)", () => {
    const result = selectFulfillmentSku(
      item,
      [{ provider: "OKECONNECT", providerSkuCode: "X", costPrice: 15000n, status: "ACTIVE" }],
      digiflazzActive,
    );
    expect(result).toEqual({ ok: false, reason: "no_provider" });
  });

  it("DIGIFLAZZ ACTIVE tapi provider dinonaktifkan admin → provider_inactive", () => {
    const result = selectFulfillmentSku(
      item,
      [{ provider: "DIGIFLAZZ", providerSkuCode: "ML86", costPrice: 19750n, status: "ACTIVE" }],
      new Set(),
    );
    expect(result).toEqual({ ok: false, reason: "provider_inactive" });
  });
});
```

Run: `cd web && npx vitest run tests/order-helpers.test.ts`
Expected: FAIL — TypeScript error argumen kurang (signature belum berubah) dan test baru gagal.

- [ ] **Step 5: Implementasi `selectFulfillmentSku`**

Ganti seluruh isi `web/src/lib/order/select-provider.ts` jadi:

```ts
import type { ProviderKey, ProviderSkuStatus } from "@prisma/client";

export type SelectSkuResult =
  | { ok: true; sku: { provider: ProviderKey; providerSkuCode: string; costPrice: bigint } }
  | { ok: false; reason: "no_provider" | "price_increased" | "provider_inactive" };

export function selectFulfillmentSku(
  item: { sellingPrice: bigint },
  skus: { provider: ProviderKey; providerSkuCode: string; costPrice: bigint; status: ProviderSkuStatus }[],
  activeProviders: Set<ProviderKey>,
): SelectSkuResult {
  const digiflazz = skus.find((s) => s.provider === "DIGIFLAZZ" && s.status === "ACTIVE");
  if (!digiflazz) return { ok: false, reason: "no_provider" };
  if (!activeProviders.has(digiflazz.provider)) return { ok: false, reason: "provider_inactive" };
  if (digiflazz.costPrice > item.sellingPrice) return { ok: false, reason: "price_increased" };
  return {
    ok: true,
    sku: { provider: digiflazz.provider, providerSkuCode: digiflazz.providerSkuCode, costPrice: digiflazz.costPrice },
  };
}
```

- [ ] **Step 6: Jalankan test order-helpers, pastikan lulus**

Run: `cd web && npx vitest run tests/order-helpers.test.ts`
Expected: semua test PASS.

- [ ] **Step 7: Tulis test yang gagal untuk `isItemPurchasable` provider nonaktif**

Ganti seluruh isi `web/tests/catalog-public.test.ts` jadi:

```ts
import { describe, expect, it } from "vitest";
import { isItemPurchasable } from "@/lib/catalog/public";

describe("isItemPurchasable", () => {
  const digiflazzActive = new Set<"DIGIFLAZZ" | "OKECONNECT" | "QIOSPAY" | "SERPUL">(["DIGIFLAZZ"]);

  it("true kalau ada ProviderSku DIGIFLAZZ berstatus ACTIVE dan provider aktif", () => {
    expect(isItemPurchasable([{ provider: "DIGIFLAZZ", status: "ACTIVE" }], digiflazzActive)).toBe(true);
  });

  it("false kalau DIGIFLAZZ ada tapi UNAVAILABLE", () => {
    expect(isItemPurchasable([{ provider: "DIGIFLAZZ", status: "UNAVAILABLE" }], digiflazzActive)).toBe(false);
  });

  it("false kalau tidak ada mapping DIGIFLAZZ sama sekali", () => {
    expect(isItemPurchasable([], digiflazzActive)).toBe(false);
    expect(isItemPurchasable([{ provider: "OKECONNECT", status: "ACTIVE" } as never], digiflazzActive)).toBe(false);
  });

  it("false kalau ProviderSku ACTIVE tapi provider dinonaktifkan admin (kill-switch)", () => {
    expect(isItemPurchasable([{ provider: "DIGIFLAZZ", status: "ACTIVE" }], new Set())).toBe(false);
  });
});
```

Run: `cd web && npx vitest run tests/catalog-public.test.ts`
Expected: FAIL (signature belum berubah).

- [ ] **Step 8: Implementasi `isItemPurchasable` + `getProductForCheckout`**

Ganti seluruh isi `web/src/lib/catalog/public.ts` jadi:

```ts
import { db } from "@/lib/db";
import type { ProviderKey, ProviderSkuStatus } from "@prisma/client";

export function isItemPurchasable(
  providerSkus: { provider: ProviderKey; status: ProviderSkuStatus }[],
  activeProviders: Set<ProviderKey>,
): boolean {
  return providerSkus.some(
    (s) => s.provider === "DIGIFLAZZ" && s.status === "ACTIVE" && activeProviders.has(s.provider),
  );
}

export async function getActiveCategories(): Promise<{ id: string; slug: string; name: string }[]> {
  return db.category.findMany({
    where: { products: { some: { isActive: true } } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, slug: true, name: true },
  });
}

export interface ProductForCheckout {
  id: string;
  slug: string;
  name: string;
  publisher: string | null;
  banner: string | null;
  inputFields: { name: string; label: string }[];
  items: { id: string; name: string; sellingPrice: bigint; memberPrice: bigint; purchasable: boolean }[];
}

export async function getProductForCheckout(
  categorySlug: string,
  productSlug: string,
): Promise<ProductForCheckout | null> {
  const [product, activeProviderConfigs] = await Promise.all([
    db.product.findFirst({
      where: { slug: productSlug, isActive: true, category: { slug: categorySlug } },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          include: { providerSkus: { select: { provider: true, status: true } } },
        },
      },
    }),
    db.providerConfig.findMany({ where: { isActive: true }, select: { key: true } }),
  ]);
  if (!product) return null;

  const activeProviders = new Set(activeProviderConfigs.map((p) => p.key));

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    publisher: product.publisher,
    banner: product.banner,
    inputFields: product.inputFields as { name: string; label: string }[],
    items: product.items.map((item) => ({
      id: item.id,
      name: item.name,
      sellingPrice: item.sellingPrice,
      memberPrice: item.memberPrice,
      purchasable: isItemPurchasable(item.providerSkus, activeProviders),
    })),
  };
}
```

- [ ] **Step 9: Jalankan test catalog-public, pastikan lulus**

Run: `cd web && npx vitest run tests/catalog-public.test.ts`
Expected: semua test PASS.

- [ ] **Step 10: Update call site `fulfillment.ts`**

Di `web/src/lib/order/fulfillment.ts`, fungsi `selectAndSend` (sekitar baris 110-118), ganti:

```ts
async function selectAndSend(
  order: OrderForFulfillment,
  item: ItemForFulfillment,
  attemptNo: number,
  alertOnFailure: boolean = true,
): Promise<void> {
  const decision = selectFulfillmentSku({ sellingPrice: order.sellingPrice }, item.providerSkus);
  if (!decision.ok) {
    const note = decision.reason === "no_provider" ? "Tidak ada provider SKU tersedia" : "Harga modal naik di atas harga jual";
```

jadi:

```ts
async function selectAndSend(
  order: OrderForFulfillment,
  item: ItemForFulfillment,
  attemptNo: number,
  alertOnFailure: boolean = true,
): Promise<void> {
  const activeProviderConfigs = await db.providerConfig.findMany({ where: { isActive: true }, select: { key: true } });
  const activeProviders = new Set(activeProviderConfigs.map((p) => p.key));
  const decision = selectFulfillmentSku({ sellingPrice: order.sellingPrice }, item.providerSkus, activeProviders);
  if (!decision.ok) {
    const note =
      decision.reason === "no_provider"
        ? "Tidak ada provider SKU tersedia"
        : decision.reason === "provider_inactive"
          ? "Provider sedang dinonaktifkan admin"
          : "Harga modal naik di atas harga jual";
```

- [ ] **Step 11: Update call site `checkout.ts`**

Di `web/src/app/actions/checkout.ts`, ganti baris 65:

```ts
  const decision = selectFulfillmentSku({ sellingPrice: item.sellingPrice }, item.providerSkus);
  if (!decision.ok) return { error: "Item ini sedang tidak tersedia untuk dibeli, coba lagi nanti." };
```

jadi:

```ts
  const activeProviderConfigs = await db.providerConfig.findMany({ where: { isActive: true }, select: { key: true } });
  const activeProviders = new Set(activeProviderConfigs.map((p) => p.key));
  const decision = selectFulfillmentSku({ sellingPrice: item.sellingPrice }, item.providerSkus, activeProviders);
  if (!decision.ok) return { error: "Item ini sedang tidak tersedia untuk dibeli, coba lagi nanti." };
```

- [ ] **Step 12: Verifikasi penuh**

Run: `cd web && npm test`
Expected: semua test PASS.

Run: `cd web && npx tsc --noEmit`
Expected: tidak ada error TypeScript baru.

- [ ] **Step 13: Commit**

```bash
git add web/src/lib/providers/registry.ts web/src/lib/order/select-provider.ts \
  web/src/lib/catalog/public.ts web/src/lib/order/fulfillment.ts web/src/app/actions/checkout.ts \
  web/tests/provider-registry.test.ts web/tests/order-helpers.test.ts web/tests/catalog-public.test.ts
git commit -m "fix(fase7c): H-3 kill-switch ProviderConfig.isActive dihormati di getAdapter, katalog, checkout"
```

---

## Task 7: H-4 — Sesi admin: expiry lebih pendek + revalidasi wajib via `User.updatedAt`

**Files:**
- Modify: `web/src/lib/auth.config.ts`
- Modify: `web/src/lib/auth.ts`
- Modify: `web/src/types/next-auth.d.ts`
- Modify: `web/src/app/actions/catalog.ts`
- Modify: `web/src/app/actions/orders.ts`
- Modify: `web/src/app/actions/providers.ts`
- Modify: `web/src/proxy.ts`

**Interfaces:**
- Produces: `session.user.updatedAt: number` (epoch ms, snapshot `User.updatedAt` saat sign-in) — dipakai oleh semua `requireAdmin()` dan `proxy.ts` untuk revalidasi.

- [ ] **Step 1: Type augmentation — tambah `updatedAt`**

Ganti seluruh isi `web/src/types/next-auth.d.ts` jadi:

```ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
      updatedAt: number;
    } & DefaultSession["user"];
  }
  interface User {
    role: "USER" | "ADMIN";
    updatedAt: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "USER" | "ADMIN";
    updatedAt?: number;
  }
}
```

- [ ] **Step 2: `auth.config.ts` — `maxAge` 8 jam + teruskan `updatedAt` lewat callback**

Ganti seluruh isi `web/src/lib/auth.config.ts` jadi:

```ts
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [], // provider ditambahkan di auth.ts (server-only)
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: "USER" | "ADMIN" }).role ?? "USER";
        token.updatedAt = (user as { updatedAt?: number }).updatedAt ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "USER" | "ADMIN";
        session.user.updatedAt = token.updatedAt as number;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
```

- [ ] **Step 3: `auth.ts` — `authorize()` kembalikan `updatedAt`**

Di `web/src/lib/auth.ts`, ganti baris return di dalam `authorize`:

```ts
        return { id: user.id, email: user.email, name: user.name, role: user.role };
```

jadi:

```ts
        return { id: user.id, email: user.email, name: user.name, role: user.role, updatedAt: user.updatedAt.getTime() };
```

- [ ] **Step 4: Revalidasi di 3 salinan `requireAdmin()`**

Di **masing-masing** dari `web/src/app/actions/catalog.ts`, `web/src/app/actions/orders.ts`, `web/src/app/actions/providers.ts` — cari fungsi `requireAdmin()` (isinya identik di ketiga file) dan ganti dari:

```ts
async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) return { error: "Tidak diizinkan" };
  return { adminId: session.user.id };
}
```

jadi:

```ts
async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) return { error: "Tidak diizinkan" };
  const fresh = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, updatedAt: true } });
  if (!fresh || fresh.role !== "ADMIN" || fresh.updatedAt.getTime() !== session.user.updatedAt) {
    return { error: "Tidak diizinkan" };
  }
  return { adminId: session.user.id };
}
```

**JANGAN** konsolidasikan ketiganya jadi satu helper bersama — ini duplikasi yang sengaja dipertahankan (lihat komentar di `catalog.ts:21-27` dan `orders.ts:12-15`).

- [ ] **Step 5: Revalidasi di `proxy.ts` untuk `/admin`**

Ganti seluruh isi `web/src/proxy.ts` (versi dari Task 4) jadi:

```ts
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";

const { auth } = NextAuth(authConfig);

const RATE_LIMITS: { match: (pathname: string) => boolean; key: string; limit: number; windowMs: number }[] = [
  { match: (p) => p === "/login", key: "login", limit: 5, windowMs: 60_000 },
  { match: (p) => p === "/register", key: "register", limit: 3, windowMs: 60_000 },
  { match: (p) => p === "/api/webhooks/midtrans", key: "webhook", limit: 60, windowMs: 60_000 },
  { match: (p) => p === "/api/cron/tick", key: "cron-tick", limit: 10, windowMs: 60_000 },
  { match: (p) => /^\/api\/orders\/[^/]+\/status$/.test(p), key: "order-status", limit: 30, windowMs: 60_000 },
];

export default auth(async (req) => {
  const { nextUrl } = req;
  const user = req.auth?.user;
  const ip = extractIp(req.headers);

  const rule = RATE_LIMITS.find((r) => r.match(nextUrl.pathname));
  if (rule) {
    const result = await checkRateLimit(`${rule.key}:ip:${ip}`, rule.limit, rule.windowMs);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan, coba lagi sebentar lagi." },
        {
          status: 429,
          headers: result.retryAfterMs ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) } : undefined,
        },
      );
    }
  }

  if (nextUrl.pathname.startsWith("/admin")) {
    if (!user || user.role !== "ADMIN") {
      return Response.redirect(new URL("/login", nextUrl));
    }
    const fresh = await db.user.findUnique({ where: { id: user.id }, select: { role: true, updatedAt: true } });
    if (!fresh || fresh.role !== "ADMIN" || fresh.updatedAt.getTime() !== user.updatedAt) {
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
  matcher: ["/admin/:path*", "/account/:path*", "/login", "/register", "/api/:path*"],
};
```

- [ ] **Step 6: Verifikasi**

Run: `cd web && npm test`
Expected: semua test PASS.

Run: `cd web && npx tsc --noEmit`
Expected: tidak ada error TypeScript baru (khususnya module augmentation `session.user.updatedAt`/`User.updatedAt` konsisten dipakai di semua titik).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/auth.config.ts web/src/lib/auth.ts web/src/types/next-auth.d.ts \
  web/src/app/actions/catalog.ts web/src/app/actions/orders.ts web/src/app/actions/providers.ts \
  web/src/proxy.ts
git commit -m "fix(fase7c): H-4 sesi admin maxAge 8 jam + revalidasi role/updatedAt (reuse User.updatedAt, tanpa migrasi)"
```

---

## Task 8: Verifikasi manual E2E (wajib sebelum merge)

Task ini tidak menghasilkan kode baru — ini checklist verifikasi manual terhadap layanan sungguhan (Midtrans/Digiflazz sandbox, DB dev), mirror §7 spec desain. Jalankan di lingkungan dev lokal (`npm run dev` dari `web/`) dengan `.env` terisi kredensial sandbox yang valid.

- [ ] **Step 1: C-1/H-2 — webhook signature-invalid tidak mengunci eventKey, settlement asli tetap diproses**

1. Buat 1 order QRIS sungguhan lewat checkout (catat `orderNumber`-nya, mis. `INV-20260730-1234`).
2. Kirim POST manual ke `http://localhost:3000/api/webhooks/midtrans` dengan `order_id` = orderNumber di atas, `signature_key` sembarangan (salah). Expected: response `403`.
3. Cek tabel `WebhookEvent` (mis. lewat `npx prisma studio` dari `web/`) — pastikan TIDAK ADA row baru untuk `eventKey` order ini.
4. Bayar QRIS order tersebut sungguhan (sandbox) sampai Midtrans kirim webhook settlement asli. Expected: order berubah jadi `PAID` lalu lanjut fulfillment normal (tidak ke-dedup oleh percobaan langkah 2).

- [ ] **Step 2: C-2 — path lama 404, token baru jalan, token acak 404**

1. Ambil `publicToken` dari salah satu order (Prisma Studio, kolom `Order.publicToken`).
2. Akses `http://localhost:3000/invoice/<publicToken>` — expected: halaman invoice tampil normal.
3. Akses `http://localhost:3000/invoice/<orderNumber-order-yang-sama>` (path lama) — expected: 404 (route sudah pindah, tidak ada fallback).
4. Akses `http://localhost:3000/invoice/token-acak-ngasal` — expected: 404.

- [ ] **Step 3: H-1 — login kena rate limit setelah 5x gagal dalam 1 menit**

1. Dari 1 browser/IP yang sama, submit form login dengan password salah 6× berturut-turut dalam < 1 menit.
2. Expected: percobaan ke-6 mendapat response `429` dengan header `Retry-After`.

- [ ] **Step 4: H-3 — nonaktifkan provider langsung menutup jalur beli**

1. Login admin, buka `/admin/providers`, nonaktifkan Digiflazz.
2. Buka halaman produk publik mana pun — expected: semua item jadi "tidak tersedia untuk dibeli".
3. (Opsional, kalau sempat) Coba panggil `createCheckoutOrder` langsung (bukan lewat UI) untuk item yang providernya nonaktif — expected: error "Item ini sedang tidak tersedia untuk dibeli, coba lagi nanti.".
4. Aktifkan lagi Digiflazz sebelum lanjut — jangan tinggalkan provider nonaktif di DB dev.

- [ ] **Step 5: H-4 — demote admin membuat sesi lama otomatis mati**

1. Login sebagai admin di satu tab browser, buka `/admin` — pastikan bisa akses.
2. Dari Prisma Studio (atau akun admin lain), ubah `role` user itu jadi `USER` secara langsung di DB (ini akan bump `updatedAt` otomatis).
3. Kembali ke tab admin yang masih login, refresh/navigasi ke halaman `/admin` mana pun. Expected: ter-redirect ke `/login` (sesi lama ditolak walau cookie masih ada).

- [ ] **Step 6: Catat hasil**

Kalau semua langkah di atas sesuai expected, Fase 7c siap untuk final whole-branch review lalu merge. Kalau ada yang tidak sesuai, catat detail kegagalannya sebelum lanjut ke review.
