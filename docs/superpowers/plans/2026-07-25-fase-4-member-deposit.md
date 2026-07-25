# Fase 4: Member + Deposit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Member login bisa isi saldo via QRIS Midtrans, bayar order pakai saldo, lihat riwayat transaksi & deposit di dashboard, dan otomatis dapat refund ke saldo kalau fulfillment gagal.

**Architecture:** Next.js 16 App Router + Prisma/MySQL, dibangun di atas infrastruktur Fase 3 (Midtrans QRIS client, webhook, job queue, design system Arah A). Tidak ada model Prisma baru — semua ditambah lewat logika aplikasi: server actions, satu cabang baru di webhook Midtrans, satu handler job baru, dan 5 halaman baru di bawah `/account/*`.

**Tech Stack:** Next.js 16 (Server Actions + Route Handlers), Prisma 6, Zod 4, Vitest, TanStack Query (polling), Auth.js v5 (sesi sudah ada dari Fase 1).

## Global Constraints

- **TDD wajib untuk logic uang** (spec utama §15 poin 4) — tapi ikuti pola nyata yang sudah dipakai di codebase ini: fungsi keputusan/validasi yang **pure** (tidak menyentuh DB/network) diekstrak ke file terpisah dan ditulis test-first (lihat `selectFulfillmentSku`, `diffPriceList`, `shouldEscalateRecheck` di Fase 2/3 sebagai preseden). Kode orkestrasi yang menyentuh DB (server actions, webhook handler, job handler) **tidak** diuji lewat DB tiruan — tidak ada infrastruktur test-DB di repo ini — melainkan diverifikasi manual end-to-end di Task 11, persis pola Task 13 Fase 3. Jangan bikin infrastruktur mocking DB baru untuk plan ini.
- **Ledger double-entry** — saldo (`Wallet.balance`) TIDAK PERNAH diupdate di luar transaksi yang juga menulis baris `WalletLedger` yang cocok, dan setiap penulisan ledger WAJIB punya `idempotencyKey` unik dan stabil.
- **Tidak ada migrasi Prisma** — semua model yang dibutuhkan sudah ada. Kalau kamu merasa butuh kolom baru, STOP dan tinjau ulang — kemungkinan besar ada cara pakai kolom yang sudah ada (lihat Task 7 untuk contoh: `deposit.id` dipakai sebagai Midtrans `order_id`, QR string disimpan di `rawResponse`).
- **Semua teks UI, commit message, dan komentar kode dalam Bahasa Indonesia**, konsisten dengan Fase 1-3.
- **Ikuti design token Arah A yang sudah diterapkan** — pakai `rounded-[var(--radius)]`, `bg-card`, `font-heading`, komponen `Button`/`Input`/`Label`/`Badge` dari `@/components/ui/*`, BUKAN elemen HTML mentah bertema manual (itu gaya lama `/login` `/register` yang sudah diketahui sebagai utang teknis, jangan ditiru).
- **Referensi spec:** `docs/superpowers/specs/2026-07-25-fase-4-member-deposit-design.md` (detail teknis Fase 4) dan `docs/superpowers/specs/2026-07-19-dannshop-topup-platform-design.md` §4/§6/§7/§12 (spec utama).

---

## Peta File

**Baru:**
- `web/src/lib/validation/deposit.ts` — schema Zod nominal deposit
- `web/src/lib/wallet/decisions.ts` — 2 fungsi pure: `hasSufficientBalance`, `decideRefundDestination`
- `web/src/lib/order/status-labels.ts` — label status order/deposit dalam Bahasa Indonesia, dipakai bersama 3 halaman dashboard baru
- `web/src/app/actions/deposit.ts` — server action `createDeposit`
- `web/src/app/account/deposit/page.tsx` + `deposit-form.tsx` — form nominal
- `web/src/app/account/deposit/[depositId]/page.tsx` + `deposit-status.tsx` — status QR + polling
- `web/src/app/api/deposits/[depositId]/status/route.ts` — endpoint polling
- `web/src/app/account/orders/page.tsx` — riwayat transaksi lengkap
- `web/src/app/account/deposits/page.tsx` — riwayat deposit lengkap
- `web/tests/validation-deposit.test.ts`, `web/tests/wallet-decisions.test.ts`

**Diubah:**
- `web/src/lib/validation/checkout.ts` — tambah field `paymentMethod`
- `web/src/app/actions/checkout.ts` — attach `userId` dari sesi + cabang bayar-saldo
- `web/src/app/(public)/[categorySlug]/[productSlug]/page.tsx` — fetch sesi + saldo wallet
- `web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx` — UI pilih metode bayar
- `web/src/lib/order/fulfillment.ts` — cabang refund-ke-saldo
- `web/src/app/api/webhooks/midtrans/route.ts` — cabang deposit
- `web/src/lib/jobs/runner.ts` — handler `expire-deposit`
- `web/src/app/account/page.tsx` — rombak dashboard (dari placeholder Fase 1)
- `web/tests/validation-checkout.test.ts` — tambah kasus `paymentMethod`

---

### Task 1: Schema validasi nominal deposit (TDD)

**Files:**
- Create: `web/src/lib/validation/deposit.ts`
- Test: `web/tests/validation-deposit.test.ts`

**Interfaces:**
- Produces: `depositSchema: ZodObject<{ amount: ZodBigInt }>`, `MIN_DEPOSIT: bigint` (`10_000n`), `MAX_DEPOSIT: bigint` (`5_000_000n`) — dipakai Task 7 (`createDeposit`) dan Task 9 (form UI, tampilkan batas).

- [ ] **Step 1: Tulis test yang gagal**

```ts
// web/tests/validation-deposit.test.ts
import { describe, expect, it } from "vitest";
import { depositSchema, MIN_DEPOSIT, MAX_DEPOSIT } from "@/lib/validation/deposit";

describe("depositSchema", () => {
  it("nominal preset valid (mis. 50000) lolos", () => {
    expect(depositSchema.safeParse({ amount: "50000" }).success).toBe(true);
  });

  it("di bawah minimum ditolak", () => {
    const result = depositSchema.safeParse({ amount: String(MIN_DEPOSIT - 1n) });
    expect(result.success).toBe(false);
  });

  it("di atas maksimum ditolak", () => {
    const result = depositSchema.safeParse({ amount: String(MAX_DEPOSIT + 1n) });
    expect(result.success).toBe(false);
  });

  it("tepat di batas min/max lolos", () => {
    expect(depositSchema.safeParse({ amount: String(MIN_DEPOSIT) }).success).toBe(true);
    expect(depositSchema.safeParse({ amount: String(MAX_DEPOSIT) }).success).toBe(true);
  });

  it("bukan angka ditolak", () => {
    expect(depositSchema.safeParse({ amount: "abc" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd web && npx vitest run tests/validation-deposit.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validation/deposit'` (file belum ada).

- [ ] **Step 3: Implementasi**

```ts
// web/src/lib/validation/deposit.ts
import { z } from "zod";

export const MIN_DEPOSIT = 10_000n;
export const MAX_DEPOSIT = 5_000_000n;

export const depositSchema = z.object({
  amount: z.coerce
    .bigint()
    .min(MIN_DEPOSIT, `Nominal minimal Rp${MIN_DEPOSIT.toLocaleString("id-ID")}`)
    .max(MAX_DEPOSIT, `Nominal maksimal Rp${MAX_DEPOSIT.toLocaleString("id-ID")}`),
});
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd web && npx vitest run tests/validation-deposit.test.ts`
Expected: PASS, 5/5 test.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/validation/deposit.ts web/tests/validation-deposit.test.ts
git commit -m "feat(fase4): schema validasi nominal deposit (min 10rb, max 5jt)"
```

---

### Task 2: Fungsi keputusan wallet (TDD)

**Files:**
- Create: `web/src/lib/wallet/decisions.ts`
- Test: `web/tests/wallet-decisions.test.ts`

**Interfaces:**
- Produces: `hasSufficientBalance(balance: bigint, total: bigint): boolean`, `decideRefundDestination(userId: string | null): "wallet" | "queue"` — dipakai Task 5 (UI disable opsi saldo) dan Task 6 (cabang refund `fulfillment.ts`).

- [ ] **Step 1: Tulis test yang gagal**

```ts
// web/tests/wallet-decisions.test.ts
import { describe, expect, it } from "vitest";
import { hasSufficientBalance, decideRefundDestination } from "@/lib/wallet/decisions";

describe("hasSufficientBalance", () => {
  it("saldo >= total → true", () => {
    expect(hasSufficientBalance(50_000n, 50_000n)).toBe(true);
    expect(hasSufficientBalance(100_000n, 50_000n)).toBe(true);
  });

  it("saldo < total → false", () => {
    expect(hasSufficientBalance(10_000n, 50_000n)).toBe(false);
  });
});

describe("decideRefundDestination", () => {
  it("ada userId (member) → wallet", () => {
    expect(decideRefundDestination("user-1")).toBe("wallet");
  });

  it("tidak ada userId (guest) → queue", () => {
    expect(decideRefundDestination(null)).toBe("queue");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd web && npx vitest run tests/wallet-decisions.test.ts`
Expected: FAIL — module belum ada.

- [ ] **Step 3: Implementasi**

```ts
// web/src/lib/wallet/decisions.ts
export function hasSufficientBalance(balance: bigint, total: bigint): boolean {
  return balance >= total;
}

export function decideRefundDestination(userId: string | null): "wallet" | "queue" {
  return userId ? "wallet" : "queue";
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd web && npx vitest run tests/wallet-decisions.test.ts`
Expected: PASS, 4/4 test.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/wallet/decisions.ts web/tests/wallet-decisions.test.ts
git commit -m "feat(fase4): fungsi keputusan wallet (cek saldo cukup, tujuan refund)"
```

---

### Task 3: Field `paymentMethod` di schema checkout (TDD)

**Files:**
- Modify: `web/src/lib/validation/checkout.ts`
- Modify: `web/tests/validation-checkout.test.ts`

**Interfaces:**
- Consumes: tidak ada (murni tambahan field opsional ke schema yang sudah ada).
- Produces: `checkoutSchema` sekarang punya field `paymentMethod: "qris" | "balance"` (default `"qris"`) — dikonsumsi Task 4 (`createCheckoutOrder`) dan Task 5 (form UI, radio button).

- [ ] **Step 1: Tulis test yang gagal (tambahkan ke file yang sudah ada)**

Tambahkan `describe` block baru di akhir `web/tests/validation-checkout.test.ts` (setelah `describe("checkoutSchema", ...)` yang sudah ada, jangan hapus yang lama):

```ts
describe("checkoutSchema paymentMethod", () => {
  it("default ke qris kalau tidak diisi", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target: { user_id: "123" },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.paymentMethod).toBe("qris");
  });

  it("terima 'balance' eksplisit", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target: { user_id: "123" },
      paymentMethod: "balance",
    });
    expect(result.success).toBe(true);
  });

  it("tolak nilai selain qris/balance", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target: { user_id: "123" },
      paymentMethod: "credit_card",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd web && npx vitest run tests/validation-checkout.test.ts`
Expected: FAIL pada 3 test baru — `result.data.paymentMethod` bakal `undefined` bukan `"qris"`, dan field `paymentMethod: "balance"`/`"credit_card"` belum dikenal schema (Zod object tanpa `.strict()` akan tetap `success: true` untuk field asing yang diabaikan — jadi test "tolak nilai selain qris/balance" akan gagal karena field itu belum divalidasi sama sekali, bukan ditolak).

- [ ] **Step 3: Implementasi**

```ts
// web/src/lib/validation/checkout.ts
import { z } from "zod";

export const checkoutSchema = z.object({
  productItemId: z.string().min(1, "Item wajib dipilih"),
  buyerEmail: z.string().email("Email tidak valid"),
  target: z.record(z.string(), z.string().min(1, "Wajib diisi")),
  paymentMethod: z.enum(["qris", "balance"]).default("qris"),
});

export function extractTargetFromFormData(formData: FormData): Record<string, string> {
  const target: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("target.") && typeof value === "string") {
      target[key.slice("target.".length)] = value;
    }
  }
  return target;
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd web && npx vitest run tests/validation-checkout.test.ts`
Expected: PASS, semua test (lama + 3 baru).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/validation/checkout.ts web/tests/validation-checkout.test.ts
git commit -m "feat(fase4): tambah field paymentMethod (qris|balance) ke checkoutSchema"
```

---

### Task 4: Checkout — attach userId + bayar pakai saldo

**Files:**
- Modify: `web/src/app/actions/checkout.ts`

**Interfaces:**
- Consumes: `checkoutSchema` (Task 3, field `paymentMethod`), `auth` dari `@/lib/auth` (sudah ada, `auth(): Promise<Session | null>`, `session.user.id: string`), `dispatchFulfillment(orderId: string): Promise<void>` dari `@/lib/order/fulfillment` (sudah ada).
- Produces: `createCheckoutOrder` sekarang mengisi `order.userId` kapan pun ada sesi (apapun metode bayar), dan menangani `paymentMethod: "balance"` secara end-to-end (debit atomik + ledger + `dispatchFulfillment`). Tidak ada fungsi baru yang diekspor — signature `createCheckoutOrder(formData: FormData): Promise<CheckoutResult>` tidak berubah.

Tidak ada test otomatis baru di task ini (lihat Global Constraints — kode orkestrasi DB diverifikasi manual di Task 11). Verifikasi task ini lewat regresi test yang sudah ada + type-check.

- [ ] **Step 1: Ganti isi `web/src/app/actions/checkout.ts` seluruhnya**

```ts
"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { checkoutSchema, extractTargetFromFormData } from "@/lib/validation/checkout";
import { generateOrderNumber } from "@/lib/order/order-number";
import { selectFulfillmentSku } from "@/lib/order/select-provider";
import { chargeQris } from "@/lib/midtrans/client";
import { dispatchFulfillment } from "@/lib/order/fulfillment";

const EXPIRY_MINUTES = 15;

export interface CheckoutResult {
  ok?: string;
  error?: string;
  orderNumber?: string;
}

class InsufficientBalanceError extends Error {}

async function createOrderWithRetry(data: Parameters<typeof db.order.create>[0]["data"]) {
  try {
    return await db.order.create({ data });
  } catch (e) {
    const isOrderNumberCollision =
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002" &&
      Array.isArray(e.meta?.target) &&
      (e.meta!.target as string[]).includes("orderNumber");
    if (!isOrderNumberCollision) throw e;
    // retry sekali dengan orderNumber baru
    return db.order.create({ data: { ...data, orderNumber: generateOrderNumber(new Date()) } });
  }
}

export async function createCheckoutOrder(formData: FormData): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse({
    productItemId: formData.get("productItemId"),
    buyerEmail: formData.get("buyerEmail"),
    target: extractTargetFromFormData(formData),
    paymentMethod: formData.get("paymentMethod") ?? "qris",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (parsed.data.paymentMethod === "balance" && !userId) {
    return { error: "Harus login untuk bayar pakai saldo." };
  }

  const item = await db.productItem.findUnique({
    where: { id: parsed.data.productItemId, isActive: true },
    include: { product: true, providerSkus: true },
  });
  if (!item || !item.product.isActive) return { error: "Produk tidak ditemukan atau tidak aktif." };

  const inputFields = item.product.inputFields as { name: string; label: string }[];
  const missingField = inputFields.find((f) => !parsed.data.target[f.name]?.trim());
  if (missingField) {
    return { error: `${missingField.label} wajib diisi.` };
  }

  const decision = selectFulfillmentSku({ sellingPrice: item.sellingPrice }, item.providerSkus);
  if (!decision.ok) return { error: "Item ini sedang tidak tersedia untuk dibeli, coba lagi nanti." };

  const now = new Date();
  const orderNumber = generateOrderNumber(now);

  if (parsed.data.paymentMethod === "balance") {
    return createBalanceOrder({ userId: userId!, orderNumber, item, target: parsed.data.target, buyerEmail: parsed.data.buyerEmail });
  }

  return createMidtransOrder({ userId, orderNumber, item, target: parsed.data.target, buyerEmail: parsed.data.buyerEmail, now });
}

async function createBalanceOrder(input: {
  userId: string;
  orderNumber: string;
  item: { id: string; sellingPrice: bigint; product: { name: string }; name: string };
  target: Record<string, string>;
  buyerEmail: string;
}): Promise<CheckoutResult> {
  const order = await createOrderWithRetry({
    orderNumber: input.orderNumber,
    status: "PENDING_PAYMENT",
    userId: input.userId,
    productItemId: input.item.id,
    productName: input.item.product.name,
    itemName: input.item.name,
    target: input.target,
    buyerEmail: input.buyerEmail,
    paidVia: "BALANCE",
    sellingPrice: input.item.sellingPrice,
    total: input.item.sellingPrice,
    payment: { create: { method: "balance", status: "PENDING" } },
  });
  await db.orderStatusHistory.create({
    data: { orderId: order.id, toStatus: "PENDING_PAYMENT", note: "Checkout bayar saldo" },
  });

  try {
    await db.$transaction(async (tx) => {
      const debited = await tx.wallet.updateMany({
        where: { userId: input.userId, balance: { gte: order.total } },
        data: { balance: { decrement: order.total } },
      });
      if (debited.count === 0) throw new InsufficientBalanceError();

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
      await tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          type: "ORDER_PAYMENT",
          amount: -order.total,
          balanceAfter: wallet.balance,
          referenceType: "order",
          referenceId: order.id,
          idempotencyKey: `order-payment:${order.id}`,
        },
      });
      await tx.order.update({ where: { id: order.id }, data: { status: "PAID" } });
      await tx.orderPayment.update({ where: { orderId: order.id }, data: { status: "PAID" } });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "PAID", note: "Bayar pakai saldo" },
      });
    });
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
      await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
      await db.orderPayment.update({ where: { orderId: order.id }, data: { status: "FAILED" } });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "FAILED", note: "Saldo tidak cukup" },
      });
      return { error: "Saldo tidak cukup (mungkin berubah). Coba lagi atau pakai QRIS." };
    }
    throw e;
  }

  await dispatchFulfillment(order.id);
  return { ok: "Order dibuat.", orderNumber: order.orderNumber };
}

async function createMidtransOrder(input: {
  userId: string | null;
  orderNumber: string;
  item: { id: string; sellingPrice: bigint; product: { name: string }; name: string };
  target: Record<string, string>;
  buyerEmail: string;
  now: Date;
}): Promise<CheckoutResult> {
  const expiredAt = new Date(input.now.getTime() + EXPIRY_MINUTES * 60_000);

  const order = await createOrderWithRetry({
    orderNumber: input.orderNumber,
    status: "PENDING_PAYMENT",
    userId: input.userId,
    productItemId: input.item.id,
    productName: input.item.product.name,
    itemName: input.item.name,
    target: input.target,
    buyerEmail: input.buyerEmail,
    paidVia: "MIDTRANS",
    sellingPrice: input.item.sellingPrice,
    total: input.item.sellingPrice,
    expiredAt,
    payment: { create: { method: "qris", status: "PENDING", expiredAt } },
  });
  await db.orderStatusHistory.create({
    data: { orderId: order.id, toStatus: "PENDING_PAYMENT", note: "Checkout" },
  });

  try {
    const charge = await chargeQris({ orderId: order.orderNumber, grossAmount: Number(input.item.sellingPrice) });
    await db.orderPayment.update({
      where: { orderId: order.id },
      data: {
        paymentRef: charge.transactionId,
        actions: { qrString: charge.qrString },
        rawResponse: charge.raw as object,
      },
    });
  } catch (e) {
    console.error("Checkout: Midtrans charge gagal", { orderId: order.id, error: e });
    await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    await db.orderPayment.update({ where: { orderId: order.id }, data: { status: "FAILED" } });
    await db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "FAILED", note: "Charge Midtrans gagal" },
    });
    return { error: "Gagal membuat pembayaran, silakan coba lagi." };
  }

  try {
    await db.job.create({
      data: { type: "expire-order", payload: { orderId: order.id }, runAt: expiredAt },
    });
  } catch (e) {
    console.error("Checkout: gagal schedule job expire-order", { orderId: order.id, error: e });
    // tidak throw — order & pembayaran tetap valid untuk user, cuma auto-expire-nya berisiko tidak jalan
  }

  return { ok: "Order dibuat.", orderNumber: order.orderNumber };
}
```

Catatan: fungsi dipecah jadi `createBalanceOrder`/`createMidtransOrder` (bukan satu `createCheckoutOrder` raksasa dengan if/else besar) supaya masing-masing jalur tetap mudah dibaca utuh — pola split-by-responsibility, bukan penambahan abstraksi baru (tidak ada layer/interface tambahan, cuma pemisahan fungsi biasa).

- [ ] **Step 2: Jalankan seluruh test suite (regresi) + type-check**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: Semua test PASS (termasuk `validation-checkout.test.ts` dari Task 3), `tsc` bersih tanpa error.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/actions/checkout.ts
git commit -m "feat(fase4): checkout attach userId dari sesi + jalur bayar pakai saldo"
```

---

### Task 5: UI checkout — pilih metode bayar + prefill email

**Files:**
- Modify: `web/src/app/(public)/[categorySlug]/[productSlug]/page.tsx`
- Modify: `web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx`

**Interfaces:**
- Consumes: `hasSufficientBalance` (Task 2), field `paymentMethod` yang sudah dikonsumsi `createCheckoutOrder` (Task 4).
- Produces: `ProductDetailClient` menerima prop baru `session: { email: string; walletBalance: bigint } | null`.

- [ ] **Step 1: Ganti isi `page.tsx`**

```tsx
// web/src/app/(public)/[categorySlug]/[productSlug]/page.tsx
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProductForCheckout } from "@/lib/catalog/public";
import { ProductDetailClient } from "./product-detail-client";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ categorySlug: string; productSlug: string }>;
}) {
  const { categorySlug, productSlug } = await params;
  const product = await getProductForCheckout(categorySlug, productSlug);
  if (!product) notFound();

  const authSession = await auth();
  let session: { email: string; walletBalance: bigint } | null = null;
  if (authSession?.user?.id) {
    const wallet = await db.wallet.findUnique({ where: { userId: authSession.user.id } });
    session = { email: authSession.user.email ?? "", walletBalance: wallet?.balance ?? 0n };
  }

  return <ProductDetailClient product={product} session={session} />;
}
```

- [ ] **Step 2: Ganti isi `product-detail-client.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCheckoutOrder, type CheckoutResult } from "@/app/actions/checkout";
import { hasSufficientBalance } from "@/lib/wallet/decisions";
import type { ProductForCheckout } from "@/lib/catalog/public";

const INITIAL_STATE: CheckoutResult = {};

function withPrevState(action: typeof createCheckoutOrder) {
  return (_prev: CheckoutResult, formData: FormData) => action(formData);
}

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

export function ProductDetailClient({
  product,
  session,
}: {
  product: ProductForCheckout;
  session: { email: string; walletBalance: bigint } | null;
}) {
  const purchasableItems = product.items.filter((i) => i.purchasable);
  const [selectedItemId, setSelectedItemId] = useState(purchasableItems[0]?.id ?? "");
  const selectedItem = purchasableItems.find((i) => i.id === selectedItemId) ?? purchasableItems[0];
  const [paymentMethod, setPaymentMethod] = useState<"qris" | "balance">("qris");

  const router = useRouter();
  const [state, formAction, pending] = useActionState(withPrevState(createCheckoutOrder), INITIAL_STATE);

  useEffect(() => {
    if (state.orderNumber) router.push(`/invoice/${state.orderNumber}`);
  }, [state.orderNumber, router]);

  if (purchasableItems.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border bg-card p-6 text-center text-muted-foreground">
        {product.name} sedang tidak tersedia untuk dibeli saat ini.
      </div>
    );
  }

  const canPayWithBalance = session ? hasSufficientBalance(session.walletBalance, selectedItem?.sellingPrice ?? 0n) : false;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <h1 className="font-heading text-2xl font-bold text-balance">{product.name}</h1>
        {product.publisher && <p className="mt-1 text-sm text-muted-foreground">{product.publisher}</p>}
      </div>

      <form action={formAction} className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-5">
        <input type="hidden" name="productItemId" value={selectedItemId} />
        <input type="hidden" name="paymentMethod" value={paymentMethod} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="item-select">Pilih Nominal</Label>
          <select
            id="item-select"
            className="h-11 rounded-md border bg-background px-3 text-base"
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
          >
            {purchasableItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {formatRupiah(item.sellingPrice)}
              </option>
            ))}
          </select>
        </div>

        {selectedItem && (
          <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3">
            <span className="text-sm text-muted-foreground">Total Bayar</span>
            <span className="font-heading text-2xl font-bold text-primary">
              {formatRupiah(selectedItem.sellingPrice)}
            </span>
          </div>
        )}

        {product.inputFields.map((field) => (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={`target-${field.name}`}>{field.label}</Label>
            <Input id={`target-${field.name}`} name={`target.${field.name}`} required className="h-11 text-base" />
          </div>
        ))}

        <div className="flex flex-col gap-2">
          <Label htmlFor="buyerEmail">Email (untuk invoice)</Label>
          <Input
            id="buyerEmail"
            name="buyerEmail"
            type="email"
            required
            defaultValue={session?.email ?? undefined}
            className="h-11 text-base"
          />
        </div>

        {session && (
          <div className="flex flex-col gap-2">
            <Label>Metode Pembayaran</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={paymentMethod === "qris"}
                onChange={() => setPaymentMethod("qris")}
              />
              QRIS
            </label>
            <label className={`flex items-center gap-2 text-sm ${!canPayWithBalance ? "opacity-50" : ""}`}>
              <input
                type="radio"
                disabled={!canPayWithBalance}
                checked={paymentMethod === "balance"}
                onChange={() => setPaymentMethod("balance")}
              />
              Saldo ({formatRupiah(session.walletBalance)})
            </label>
            {!canPayWithBalance && (
              <p className="text-xs text-muted-foreground">
                Saldo tidak cukup.{" "}
                <a href="/account/deposit" className="text-primary underline">
                  Isi saldo dulu
                </a>
                .
              </p>
            )}
          </div>
        )}

        {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
        <Button type="submit" disabled={pending} className="h-11 w-full text-base font-heading">
          {pending ? "Memproses..." : "Beli Sekarang"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Jalankan test suite (regresi) + type-check**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: Semua test PASS, `tsc` bersih.

- [ ] **Step 4: Commit**

```bash
git add "web/src/app/(public)/[categorySlug]/[productSlug]/page.tsx" "web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx"
git commit -m "feat(fase4): UI pilih metode bayar (QRIS/saldo) + prefill email member"
```

---

### Task 6: Auto-refund ke saldo untuk member

**Files:**
- Modify: `web/src/lib/order/fulfillment.ts`

**Interfaces:**
- Consumes: `decideRefundDestination(userId: string | null): "wallet" | "queue"` (Task 2).
- Produces: perilaku `applyFulfillmentResult` tidak berubah signature-nya, tapi cabang `FAILED` sekarang bisa menghasilkan status akhir `REFUNDED` (bukan cuma `REFUND_PENDING`).

Tidak ada test otomatis baru (alasan sama seperti Task 4 — orkestrasi DB, diverifikasi manual Task 11). Regresi dijaga oleh `order-helpers.test.ts` yang sudah ada (masih menguji `selectFulfillmentSku` yang tidak disentuh task ini).

- [ ] **Step 1: Ganti isi `web/src/lib/order/fulfillment.ts`**

```ts
import { db } from "@/lib/db";
import { getAdapter } from "@/lib/providers/registry";
import type { ProviderTrxResult } from "@/lib/providers/types";
import { buildCustomerNo } from "@/lib/order/customer-no";
import { generateRefId } from "@/lib/order/order-number";
import { selectFulfillmentSku } from "@/lib/order/select-provider";
import { decideRefundDestination } from "@/lib/wallet/decisions";

export async function dispatchFulfillment(orderId: string): Promise<void> {
  const claimed = await db.order.updateMany({
    where: { id: orderId, status: "PAID" },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) return; // sudah PROCESSING/status lain - sedang/sudah diproses pemanggil lain

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const item = await db.productItem.findUniqueOrThrow({
    where: { id: order.productItemId! },
    include: { providerSkus: true, product: true },
  });

  await db.orderStatusHistory.create({
    data: { orderId: order.id, fromStatus: "PAID", toStatus: "PROCESSING" },
  });

  const decision = selectFulfillmentSku({ sellingPrice: order.sellingPrice }, item.providerSkus);
  if (!decision.ok) {
    await db.order.update({ where: { id: order.id }, data: { status: "NEEDS_REVIEW" } });
    await db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: "PROCESSING", toStatus: "NEEDS_REVIEW", note: decision.reason },
    });
    return;
  }

  const ourRefId = generateRefId("FUL", new Date());
  const fulfillment = await db.orderFulfillment.create({
    data: {
      orderId: order.id,
      attemptNo: 1,
      provider: decision.sku.provider,
      providerSkuCode: decision.sku.providerSkuCode,
      costPrice: decision.sku.costPrice,
      ourRefId,
      status: "SENT",
    },
  });

  const target = buildCustomerNo(
    item.product.inputFields as { name: string }[],
    order.target as Record<string, string>,
  );

  // Jadwalkan jaring pengaman recheck SEBELUM panggil adapter - supaya kalau
  // adapter.createTransaction throw (timeout/error jaringan), tetap ada job
  // yang akan checkStatus ulang nanti alih-alih order macet permanen.
  await db.job.create({
    data: {
      type: "recheck-fulfillment",
      payload: { fulfillmentId: fulfillment.id, attempt: 1 },
      runAt: new Date(Date.now() + 60_000),
    },
  });

  try {
    const adapter = await getAdapter(decision.sku.provider);
    const result = await adapter.createTransaction({
      skuCode: decision.sku.providerSkuCode,
      target,
      refId: ourRefId,
    });
    await applyFulfillmentResult(fulfillment.id, result);
  } catch (e) {
    console.error("dispatchFulfillment: adapter.createTransaction gagal, mengandalkan job recheck-fulfillment", {
      orderId: order.id, fulfillmentId: fulfillment.id, error: e,
    });
    // JANGAN throw - job recheck-fulfillment yang sudah dijadwalkan akan coba checkStatus nanti.
    // Fulfillment row tetap berstatus SENT, itu status valid untuk recheck job mengambil alih.
  }
}

export async function applyFulfillmentResult(fulfillmentId: string, result: ProviderTrxResult): Promise<void> {
  const status = result.status === "success" ? "SUCCESS" : result.status === "failed" ? "FAILED" : "PROCESSING";

  // Klaim atomik: hanya satu pemanggil konkuren (webhook vs. job recheck-fulfillment)
  // yang berhasil flip dari status non-final ke status baru.
  const claimed = await db.orderFulfillment.updateMany({
    where: { id: fulfillmentId, status: { notIn: ["SUCCESS", "FAILED"] } },
    data: { status, sn: result.sn, message: result.message, rawCallback: result.raw as object },
  });
  if (claimed.count === 0) return; // sudah final (SUCCESS/FAILED) oleh pemanggil lain, idempotent

  const fulfillment = await db.orderFulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });

  if (status === "SUCCESS") {
    await db.order.update({
      where: { id: fulfillment.orderId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await db.orderStatusHistory.create({
      data: { orderId: fulfillment.orderId, toStatus: "COMPLETED", note: `SN: ${result.sn ?? "-"}` },
    });
  } else if (status === "FAILED") {
    const order = await db.order.findUniqueOrThrow({ where: { id: fulfillment.orderId } });

    if (decideRefundDestination(order.userId) === "wallet") {
      // Member — auto-refund ke saldo, atomik dalam satu transaksi (ledger double-entry)
      await db.$transaction(async (tx) => {
        const wallet = await tx.wallet.update({
          where: { userId: order.userId! },
          data: { balance: { increment: order.total } },
        });
        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: "REFUND",
            amount: order.total,
            balanceAfter: wallet.balance,
            referenceType: "order",
            referenceId: order.id,
            idempotencyKey: `order-refund:${order.id}`,
          },
        });
        await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
      });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, toStatus: "REFUNDED", note: `Auto-refund ke saldo: ${result.message}` },
      });
    } else {
      // Guest — antrean manual admin (Fase 7), tidak berubah dari Fase 3
      await db.order.update({ where: { id: order.id }, data: { status: "REFUND_PENDING" } });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, toStatus: "REFUND_PENDING", note: result.message },
      });
    }
  }
}
```

- [ ] **Step 2: Jalankan test suite (regresi) + type-check**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: Semua test PASS, `tsc` bersih.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/order/fulfillment.ts
git commit -m "feat(fase4): auto-refund ke saldo member saat fulfillment gagal"
```

---

### Task 7: Server action deposit + job expire-deposit

**Files:**
- Create: `web/src/app/actions/deposit.ts`
- Modify: `web/src/lib/jobs/runner.ts`

**Interfaces:**
- Consumes: `depositSchema` (Task 1), `auth` dari `@/lib/auth`, `chargeQris({ orderId, grossAmount }): Promise<MidtransChargeResult>` dari `@/lib/midtrans/client` (sudah ada, generik).
- Produces: `createDeposit(_prev: DepositResult | undefined, formData: FormData): Promise<DepositResult>` (dipakai Task 9), redirect ke `/account/deposit/[depositId]` saat sukses. Handler job baru `"expire-deposit"` terdaftar di `handlers` (dipakai job scheduler, tidak diimpor langsung oleh siapa pun).

- [ ] **Step 1: Buat `web/src/app/actions/deposit.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { depositSchema } from "@/lib/validation/deposit";
import { chargeQris } from "@/lib/midtrans/client";

const EXPIRY_MINUTES = 15;

export interface DepositResult {
  error?: string;
}

export async function createDeposit(
  _prev: DepositResult | undefined,
  formData: FormData,
): Promise<DepositResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Harus login untuk isi saldo." };

  const parsed = depositSchema.safeParse({ amount: formData.get("amount") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const expiredAt = new Date(Date.now() + EXPIRY_MINUTES * 60_000);
  const deposit = await db.deposit.create({
    data: {
      userId: session.user.id,
      amount: parsed.data.amount,
      status: "PENDING",
      expiredAt,
    },
  });

  try {
    // deposit.id (cuid) dipakai langsung sebagai Midtrans order_id — Deposit
    // tidak punya nomor publik terpisah seperti Order.orderNumber, dan
    // chargeQris generik terhadap format order_id (spec Fase 4 §4).
    const charge = await chargeQris({ orderId: deposit.id, grossAmount: Number(parsed.data.amount) });
    await db.deposit.update({
      where: { id: deposit.id },
      data: {
        paymentRef: charge.transactionId,
        rawResponse: { qrString: charge.qrString, chargeResponse: charge.raw } as object,
      },
    });
  } catch (e) {
    console.error("Deposit: Midtrans charge gagal", { depositId: deposit.id, error: e });
    await db.deposit.update({ where: { id: deposit.id }, data: { status: "FAILED" } });
    return { error: "Gagal membuat pembayaran, silakan coba lagi." };
  }

  try {
    await db.job.create({
      data: { type: "expire-deposit", payload: { depositId: deposit.id }, runAt: expiredAt },
    });
  } catch (e) {
    console.error("Deposit: gagal schedule job expire-deposit", { depositId: deposit.id, error: e });
    // tidak throw — deposit tetap valid untuk user, cuma auto-expire-nya berisiko tidak jalan
  }

  redirect(`/account/deposit/${deposit.id}`);
}
```

- [ ] **Step 2: Tambah handler `expire-deposit` di `web/src/lib/jobs/runner.ts`**

Tambahkan entri baru ke object `handlers` (setelah `"expire-order"`, sebelum `"recheck-fulfillment"` — urutan tidak penting secara fungsional, cuma pengelompokan):

```ts
  "expire-deposit": async (payload) => {
    const { depositId } = payload as { depositId: string };
    const deposit = await db.deposit.findUniqueOrThrow({ where: { id: depositId } });
    if (deposit.status !== "PENDING") return "no-op: status sudah berubah";
    if (deposit.expiredAt && deposit.expiredAt > new Date()) return "no-op: belum jatuh tempo";

    const claimed = await db.deposit.updateMany({
      where: { id: deposit.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    if (claimed.count === 0) return "no-op: sudah diklaim proses lain";

    return "expired";
  },
```

- [ ] **Step 3: Jalankan test suite (regresi) + type-check**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: Semua test PASS (termasuk `jobs-runner.test.ts` dan `jobs-order-handlers.test.ts` yang sudah ada — task ini tidak mengubah fungsi pure `computeBackoff`/`decideAfterFailure`/`shouldEscalateRecheck`), `tsc` bersih.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/actions/deposit.ts web/src/lib/jobs/runner.ts
git commit -m "feat(fase4): server action createDeposit + job expire-deposit"
```

---

### Task 8: Webhook Midtrans — cabang deposit

**Files:**
- Modify: `web/src/app/api/webhooks/midtrans/route.ts`

**Interfaces:**
- Consumes: `Deposit` model (Task 7 sudah membuat baris `Deposit` dengan `id` sebagai Midtrans `order_id`).
- Produces: tidak ada export baru — route handler `POST` yang sama, sekarang bisa memproses notifikasi untuk `Order` MAUPUN `Deposit`.

Tidak ada test otomatis baru (route handler, orkestrasi DB — diverifikasi manual Task 11, sama seperti webhook order di Fase 3 yang juga tidak punya unit test).

- [ ] **Step 1: Ganti isi `web/src/app/api/webhooks/midtrans/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyMidtransSignature } from "@/lib/midtrans/signature";
import { getTransactionStatus } from "@/lib/midtrans/client";
import { mapMidtransStatus } from "@/lib/midtrans/status-mapping";
import { dispatchFulfillment } from "@/lib/order/fulfillment";

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
    const claimed = await db.deposit.updateMany({
      where: { id: deposit.id, status: "PENDING" },
      data: { status: "PAID" },
    });
    if (claimed.count > 0) {
      await db.$transaction(async (tx) => {
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
      });
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

  let notif: z.infer<typeof notifSchema>;
  try {
    const json = JSON.parse(rawBody);
    const parsed = notifSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
    notif = parsed.data;
  } catch {
    return NextResponse.json({ error: "Bukan JSON valid" }, { status: 400 });
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
          headers: Object.fromEntries(request.headers),
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

  if (!verifyMidtransSignature(notif, process.env.MIDTRANS_SERVER_KEY!)) {
    await markProcessed("signature_invalid");
    return NextResponse.json({ error: "Signature tidak valid" }, { status: 403 });
  }

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

- [ ] **Step 2: Jalankan test suite (regresi) + type-check**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: Semua test PASS (termasuk `midtrans-signature.test.ts`, `midtrans-status-mapping.test.ts` yang tidak disentuh), `tsc` bersih.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/webhooks/midtrans/route.ts
git commit -m "feat(fase4): webhook Midtrans proses notifikasi deposit (kredit saldo)"
```

---

### Task 9: Halaman deposit (form + status QR)

**Files:**
- Create: `web/src/app/account/deposit/page.tsx`
- Create: `web/src/app/account/deposit/deposit-form.tsx`
- Create: `web/src/app/account/deposit/[depositId]/page.tsx`
- Create: `web/src/app/account/deposit/[depositId]/deposit-status.tsx`
- Create: `web/src/app/api/deposits/[depositId]/status/route.ts`

**Interfaces:**
- Consumes: `createDeposit` (Task 7), `MIN_DEPOSIT`/`MAX_DEPOSIT` (Task 1).
- Produces: 2 route baru yang bisa diakses browser (`/account/deposit`, `/account/deposit/[depositId]`), 1 endpoint JSON (`/api/deposits/[depositId]/status`).

- [ ] **Step 1: Buat `web/src/app/api/deposits/[depositId]/status/route.ts`**

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ depositId: string }> }) {
  const { depositId } = await params;
  const deposit = await db.deposit.findUnique({ where: { id: depositId } });
  if (!deposit) return NextResponse.json({ error: "Deposit tidak ditemukan" }, { status: 404 });

  const rawResponse = deposit.rawResponse as { qrString?: string } | null;

  return NextResponse.json({
    depositId: deposit.id,
    status: deposit.status,
    amount: deposit.amount.toString(),
    qrString: rawResponse?.qrString ?? null,
    expiredAt: deposit.expiredAt,
  });
}
```

- [ ] **Step 2: Buat `web/src/app/account/deposit/deposit-form.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDeposit, type DepositResult } from "@/app/actions/deposit";
import { MIN_DEPOSIT, MAX_DEPOSIT } from "@/lib/validation/deposit";

const PRESETS = [25_000n, 50_000n, 100_000n, 250_000n, 500_000n];

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

const INITIAL_STATE: DepositResult = {};

export function DepositForm() {
  const [selected, setSelected] = useState<bigint | "custom">(PRESETS[1]);
  const [custom, setCustom] = useState("");
  const [state, formAction, pending] = useActionState(createDeposit, INITIAL_STATE);

  const amount = selected === "custom" ? custom : selected.toString();

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-5">
      <input type="hidden" name="amount" value={amount} />

      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.toString()}
            type="button"
            onClick={() => setSelected(preset)}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              selected === preset ? "border-primary bg-primary/10 text-primary" : "border-border"
            }`}
          >
            {formatRupiah(preset)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSelected("custom")}
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            selected === "custom" ? "border-primary bg-primary/10 text-primary" : "border-border"
          }`}
        >
          Nominal Lain
        </button>
      </div>

      {selected === "custom" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="custom-amount">
            Nominal ({formatRupiah(MIN_DEPOSIT)} - {formatRupiah(MAX_DEPOSIT)})
          </Label>
          <Input
            id="custom-amount"
            type="number"
            min={Number(MIN_DEPOSIT)}
            max={Number(MAX_DEPOSIT)}
            step={1000}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            required
            className="h-11 text-base"
          />
        </div>
      )}

      {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
      <Button type="submit" disabled={pending || !amount} className="h-11 w-full text-base font-heading">
        {pending ? "Memproses..." : "Isi Saldo"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Buat `web/src/app/account/deposit/page.tsx`**

```tsx
import { DepositForm } from "./deposit-form";

export default function DepositPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-10">
      <h1 className="font-heading text-2xl font-bold">Isi Saldo</h1>
      <DepositForm />
    </div>
  );
}
```

- [ ] **Step 4: Buat `web/src/app/account/deposit/[depositId]/deposit-status.tsx`**

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const FINAL_STATUSES = ["PAID", "FAILED", "EXPIRED"];

interface DepositStatusResponse {
  depositId: string;
  status: string;
  amount: string;
  qrString: string | null;
  expiredAt: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu Pembayaran",
  PAID: "Berhasil",
  EXPIRED: "Kadaluarsa",
  FAILED: "Gagal",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  PENDING: "warning",
  PAID: "success",
  EXPIRED: "destructive",
  FAILED: "destructive",
};

const STATUS_ICON: Record<string, typeof Clock> = {
  PENDING: Clock,
  PAID: CheckCircle2,
  EXPIRED: XCircle,
  FAILED: XCircle,
};

export function DepositStatus({ depositId, initial }: { depositId: string; initial: DepositStatusResponse }) {
  const { data, isFetching } = useQuery<DepositStatusResponse>({
    queryKey: ["deposit-status", depositId],
    queryFn: async () => {
      const res = await fetch(`/api/deposits/${depositId}/status`);
      if (!res.ok) throw new Error("Gagal memuat status deposit");
      return res.json();
    },
    initialData: initial,
    refetchInterval: (query) => (FINAL_STATUSES.includes(query.state.data?.status ?? "") ? false : 3000),
  });

  const deposit = data ?? initial;
  const isFinal = FINAL_STATUSES.includes(deposit.status);
  const StatusIcon = STATUS_ICON[deposit.status] ?? Clock;

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">Isi Saldo</span>
        <Badge variant={STATUS_VARIANT[deposit.status] ?? "muted"}>
          <StatusIcon className={cn("size-3", deposit.status === "PENDING" && "animate-spin")} />
          {STATUS_LABEL[deposit.status] ?? deposit.status}
        </Badge>
      </div>
      <p className="font-heading text-2xl font-bold">
        {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
          Number(deposit.amount),
        )}
      </p>

      {!isFinal && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          {isFetching ? "Memeriksa status pembayaran…" : "Status diperbarui otomatis setiap beberapa detik"}
        </div>
      )}

      {deposit.status === "PENDING" && deposit.qrString && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground">Scan QRIS untuk membayar</p>
          <img
            alt="QRIS pembayaran"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(deposit.qrString)}`}
            width={240}
            height={240}
          />
        </div>
      )}

      {deposit.status === "PAID" && (
        <div className="rounded-md border border-success-foreground/20 bg-success p-4 text-success-foreground">
          <p className="text-sm font-semibold">Saldo berhasil ditambahkan!</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Buat `web/src/app/account/deposit/[depositId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { DepositStatus } from "./deposit-status";

export default async function DepositStatusPage({
  params,
}: {
  params: Promise<{ depositId: string }>;
}) {
  const { depositId } = await params;
  const deposit = await db.deposit.findUnique({ where: { id: depositId } });
  if (!deposit) notFound();

  const rawResponse = deposit.rawResponse as { qrString?: string } | null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-10">
      <Link href="/account" className="font-heading text-sm font-bold text-primary hover:underline">
        ← Akun Saya
      </Link>
      <DepositStatus
        depositId={deposit.id}
        initial={{
          depositId: deposit.id,
          status: deposit.status,
          amount: deposit.amount.toString(),
          qrString: rawResponse?.qrString ?? null,
          expiredAt: deposit.expiredAt?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 6: Jalankan test suite (regresi) + type-check**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: Semua test PASS, `tsc` bersih.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/account/deposit web/src/app/api/deposits
git commit -m "feat(fase4): halaman deposit (form nominal + status QR polling)"
```

---

### Task 10: Dashboard member (`/account`, riwayat transaksi & deposit)

**Files:**
- Create: `web/src/lib/order/status-labels.ts`
- Modify: `web/src/app/account/page.tsx`
- Create: `web/src/app/account/orders/page.tsx`
- Create: `web/src/app/account/deposits/page.tsx`

**Interfaces:**
- Produces: `ORDER_STATUS_LABEL: Record<string, string>`, `DEPOSIT_STATUS_LABEL: Record<string, string>` — dipakai ketiga halaman dashboard.

- [ ] **Step 1: Buat `web/src/lib/order/status-labels.ts`**

```ts
export const ORDER_STATUS_LABEL: Record<string, string> = {
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

export const DEPOSIT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu Pembayaran",
  PAID: "Berhasil",
  EXPIRED: "Kadaluarsa",
  FAILED: "Gagal",
};
```

- [ ] **Step 2: Ganti isi `web/src/app/account/page.tsx`**

```tsx
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABEL, DEPOSIT_STATUS_LABEL } from "@/lib/order/status-labels";

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

export default async function AccountPage() {
  const session = await auth();
  const userId = session!.user.id; // middleware proxy.ts sudah menjamin ada sesi di /account/*

  const [wallet, recentOrders, recentDeposits] = await Promise.all([
    db.wallet.findUnique({ where: { userId } }),
    db.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.deposit.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 3 }),
  ]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="font-heading text-2xl font-bold">Akun Saya</h1>
        <p className="text-sm text-muted-foreground">
          Halo, {session!.user.name} ({session!.user.email})
        </p>
      </div>

      <div className="flex items-center justify-between rounded-[var(--radius)] border bg-card p-5">
        <div>
          <p className="text-sm text-muted-foreground">Saldo</p>
          <p className="font-heading text-3xl font-bold text-primary">{formatRupiah(wallet?.balance ?? 0n)}</p>
        </div>
        <Link href="/account/deposit" className={cn(buttonVariants({ size: "default" }))}>
          Isi Saldo
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Transaksi Terakhir</h2>
          <Link href="/account/orders" className="text-sm text-primary hover:underline">
            Lihat semua
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada transaksi.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recentOrders.map((order) => (
              <Link
                key={order.id}
                href={`/invoice/${order.orderNumber}`}
                className="flex items-center justify-between rounded-md border bg-card px-4 py-3 text-sm hover:bg-muted"
              >
                <div>
                  <p className="font-medium">
                    {order.productName} · {order.itemName}
                  </p>
                  <p className="text-xs text-muted-foreground">{order.orderNumber}</p>
                </div>
                <Badge variant="muted">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Riwayat Deposit</h2>
          <Link href="/account/deposits" className="text-sm text-primary hover:underline">
            Lihat semua
          </Link>
        </div>
        {recentDeposits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada deposit.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recentDeposits.map((deposit) => (
              <Link
                key={deposit.id}
                href={`/account/deposit/${deposit.id}`}
                className="flex items-center justify-between rounded-md border bg-card px-4 py-3 text-sm hover:bg-muted"
              >
                <p className="font-medium">{formatRupiah(deposit.amount)}</p>
                <Badge variant="muted">{DEPOSIT_STATUS_LABEL[deposit.status] ?? deposit.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Buat `web/src/app/account/orders/page.tsx`**

```tsx
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABEL } from "@/lib/order/status-labels";

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

export default async function AccountOrdersPage() {
  const session = await auth();
  const orders = await db.order.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-10">
      <Link href="/account" className="font-heading text-sm font-bold text-primary hover:underline">
        ← Akun Saya
      </Link>
      <h1 className="font-heading text-2xl font-bold">Riwayat Transaksi</h1>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada transaksi.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/invoice/${order.orderNumber}`}
              className="flex items-center justify-between rounded-md border bg-card px-4 py-3 text-sm hover:bg-muted"
            >
              <div>
                <p className="font-medium">
                  {order.productName} · {order.itemName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {order.orderNumber} · {formatRupiah(order.total)}
                </p>
              </div>
              <Badge variant="muted">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Buat `web/src/app/account/deposits/page.tsx`**

```tsx
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { DEPOSIT_STATUS_LABEL } from "@/lib/order/status-labels";

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

export default async function AccountDepositsPage() {
  const session = await auth();
  const deposits = await db.deposit.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-10">
      <Link href="/account" className="font-heading text-sm font-bold text-primary hover:underline">
        ← Akun Saya
      </Link>
      <h1 className="font-heading text-2xl font-bold">Riwayat Deposit</h1>
      {deposits.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada deposit.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {deposits.map((deposit) => (
            <Link
              key={deposit.id}
              href={`/account/deposit/${deposit.id}`}
              className="flex items-center justify-between rounded-md border bg-card px-4 py-3 text-sm hover:bg-muted"
            >
              <p className="font-medium">{formatRupiah(deposit.amount)}</p>
              <Badge variant="muted">{DEPOSIT_STATUS_LABEL[deposit.status] ?? deposit.status}</Badge>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Jalankan test suite (regresi) + type-check + lint**

Run: `cd web && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: Semua test PASS, `tsc` bersih, lint bersih (perhatikan `<img>` di `deposit-status.tsx` — Fase 3 sudah punya warning `@next/next/no-img-element` yang sama persis di `invoice-status.tsx` dan diterima sebagai Minor non-blocking; boleh diikuti pola yang sama, jangan blokir task ini karenanya).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/order/status-labels.ts web/src/app/account
git commit -m "feat(fase4): dashboard member (saldo, riwayat transaksi & deposit)"
```

---

### Task 11: Verifikasi akhir Fase 4 (end-to-end)

**Files:** Tidak ada file produksi baru — task ini murni verifikasi, mengikuti pola Task 13 Fase 3.

**Interfaces:** Tidak ada.

- [ ] **Step 1: Jalankan seluruh automated check**

Run: `cd web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: Semua PASS — test suite penuh (Task 1-10 tidak boleh regresi test Fase 1-3 manapun), type-check bersih, lint bersih, build sukses termasuk semua route baru (`/account`, `/account/deposit`, `/account/deposit/[depositId]`, `/account/orders`, `/account/deposits`, `/api/deposits/[depositId]/status`).

- [ ] **Step 2: Verifikasi manual — jalur bayar saldo + deposit (dev server + Playwright MCP)**

Jalankan `npm run dev` di `web/`, lalu (kredensial Midtrans sandbox asli kemungkinan besar masih belum ada — kalau begitu, pola sintesis yang sama seperti Task 13 Fase 3 berlaku: server key palsu konsisten + konfirmasi status via shim eksternal, TANPA mengubah source code):

1. Register akun baru → login → `/account` menampilkan saldo Rp0, "Belum ada transaksi.", "Belum ada deposit."
2. `/account/deposit` → pilih preset Rp50.000 → submit → redirect ke `/account/deposit/[id]` → QR tampil, status "Menunggu Pembayaran".
3. Simulasikan webhook `settlement` untuk deposit itu (payload `order_id` = id deposit) → status berubah jadi "Berhasil" tanpa reload (polling) → `/account` saldo bertambah Rp50.000, deposit itu muncul di "Riwayat Deposit".
4. Buka halaman produk (mis. Mobile Legends) dalam keadaan login → radio "Saldo (Rp50.000)" aktif kalau nominal item ≤ saldo, disabled + link "Isi saldo dulu" kalau nominal > saldo.
5. Checkout pilih item ≤ saldo, metode "Saldo" → submit → redirect ke `/invoice/[orderNumber]`, status langsung "Diproses" (bukan "Menunggu Pembayaran", karena balance branch langsung `PAID`) → saldo di `/account` berkurang sesuai harga item → order muncul di "Transaksi Terakhir" dan `/account/orders`.
6. Simulasikan fulfillment gagal (mis. SKU dengan `provider_status` yang bikin `selectFulfillmentSku` return `no_provider`, atau via IP-whitelist rejection asli seperti Task 13 Fase 3) untuk order yang dibayar saldo tadi → order berubah jadi `REFUNDED`, saldo di `/account` kembali bertambah sejumlah `order.total`, tidak ada duplikasi (cek `WalletLedger` cuma 2 baris untuk order itu: `ORDER_PAYMENT` negatif lalu `REFUND` positif, `balanceAfter` di baris terakhir = saldo saat ini).
7. **Regresi guest**: ulangi langkah 4-6 TANPA login (guest checkout, bayar QRIS seperti Fase 3) → pastikan fulfillment gagal tetap menghasilkan `REFUND_PENDING` (BUKAN `REFUNDED`) — memastikan Task 6 tidak mengubah perilaku guest yang sudah ada.
8. Coba 2 tab checkout saldo bersamaan dengan saldo pas-pasan (simulasi race) → satu order `PAID`, satu lagi `FAILED` dengan pesan "Saldo tidak cukup" → saldo cuma terpotong sekali.

- [ ] **Step 3: Tulis laporan verifikasi**

Buat `.superpowers/sdd/2026-07-25-fase-4-member-deposit/task-11-report.md` isinya: hasil tiap langkah di atas (PASS/PARSIAL/tidak teruji + alasan, ikuti format Task 13 Fase 3 di `.superpowers/sdd/2026-07-25-fase-3-order-midtrans/task-13-report.md` sebagai referensi format), termasuk daftar bagian mana yang disintesis karena kredensial Midtrans sandbox asli belum ada (kalau memang belum ada saat eksekusi task ini).

- [ ] **Step 4: Hentikan dev server, bersihkan data uji**

Pastikan `npm run dev` dihentikan, port 3000 tidak listening lagi. Hapus semua `Order`/`Deposit`/`WalletLedger`/`User` yang dibuat khusus untuk pengujian manual ini dari DB dev (kecuali kalau memang mau dipakai lanjut sebagai akun uji tetap — putuskan & catat di laporan).

- [ ] **Step 5: Commit laporan**

```bash
git add .superpowers/sdd/2026-07-25-fase-4-member-deposit/task-11-report.md
git commit -m "docs(fase4): laporan verifikasi akhir Task 11"
```

---

## Self-Review (dilakukan penulis plan, bukan subagent)

**Cakupan spec:** Semua 7 bagian `docs/superpowers/specs/2026-07-25-fase-4-member-deposit-design.md` punya task yang mengimplementasikannya — §2/§3 → Task 3-5, §4 → Task 1, 7-9, §5 → Task 2, 6, §6 → Task 10, §7 → Task 7 (job) + Task 11 (testing plan). Tidak ada gap.

**Placeholder scan:** Tidak ada "TBD"/"implement later"/"add error handling" generik — semua step berisi kode lengkap atau instruksi run yang konkret.

**Konsistensi tipe:** `hasSufficientBalance(balance: bigint, total: bigint): boolean` dan `decideRefundDestination(userId: string | null): "wallet" | "queue"` (Task 2) dipakai dengan signature persis sama di Task 5 dan Task 6. `depositSchema`/`MIN_DEPOSIT`/`MAX_DEPOSIT` (Task 1) dipakai persis sama di Task 7 dan Task 9. `createDeposit(_prev, formData): Promise<DepositResult>` (Task 7) dipakai persis sama di Task 9 (`useActionState(createDeposit, ...)`). `ORDER_STATUS_LABEL`/`DEPOSIT_STATUS_LABEL` (Task 10 Step 1) dipakai konsisten di ketiga halaman dashboard.
