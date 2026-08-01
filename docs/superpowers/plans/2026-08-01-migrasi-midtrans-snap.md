# Migrasi Midtrans Core API QRIS → Snap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pindahkan checkout order dan deposit saldo dari Midtrans Core API (QRIS-only, `chargeQris`) ke Midtrans Snap popup, supaya customer bisa pilih metode bayar apapun yang aktif di akun Midtrans (QRIS/VA/CC/dll) tanpa kita bikin integrasi manual per metode.

**Architecture:** Server Action tetap bikin Order/Deposit row seperti sekarang, tapi manggil `createSnapTransaction` (fungsi baru, Snap Transaction API) alih-alih `chargeQris`, dapat `token` balik. Client component load `snap.js` (script pihak ketiga Midtrans) lewat `next/script`, panggil `window.snap.pay(token, callbacks)` begitu token diterima dari action — popup Midtrans muncul, customer pilih & selesaikan pembayaran di situ. Webhook (`api/webhooks/midtrans/route.ts`) TIDAK diubah kodenya (asumsi format notifikasi Snap = Core API), tapi WAJIB diverifikasi nyata di Task 7.

**Tech Stack:** Next.js 16 App Router, Server Actions, `next/script`, Midtrans Snap API (`POST /snap/v1/transactions`), Zod, Vitest.

## Global Constraints

- Semua pesan error/UI yang dilihat user tetap Bahasa Indonesia.
- TDD penuh untuk fungsi baru yang murni (pola network-call `chargeQris`/`getTransactionStatus` di `tests/midtrans-client.test.ts` — mock `fetch` global via `vi.stubGlobal`, verifikasi URL+body+parsing, BUKAN "tidak ada test buat network code").
- Orchestration code (Server Action, route handler, client component) TIDAK butuh test otomatis — konsisten konvensi repo.
- Tidak ada migrasi Prisma — `rawResponse`/`actions` sudah kolom `Json`, tinggal ganti isi key yang disimpan.
- `chargeQris` di `lib/midtrans/client.ts` TIDAK dihapus (jadi kode menganggur setelah migrasi ini, sengaja dibiarkan — lihat spec §2).
- Webhook (`api/webhooks/midtrans/route.ts`) TIDAK diubah kodenya di task manapun kecuali Task 7 menemukan ketidakcocokan format nyata saat verifikasi sandbox — kalau itu terjadi, STOP dan laporkan ke user sebelum improvisasi perubahan (nyentuh verifikasi nominal M-3/signature L-2 yang sudah dikeraskan Fase 7c/7d).
- Commit tiap task selesai (test hijau dulu kalau ada), pesan commit format `fix(snap): <ringkas>`.

Spec lengkap: `docs/superpowers/specs/2026-08-01-migrasi-midtrans-snap-design.md`

---

## Task 1: `createSnapTransaction()` di Midtrans client

**Files:**
- Modify: `web/src/lib/midtrans/client.ts`
- Test: `web/tests/midtrans-client.test.ts`

**Interfaces:**
- Produces: `createSnapTransaction(input: { orderId: string; grossAmount: number }, creds?: MidtransCreds): Promise<{ token: string; redirectUrl: string }>` — dipakai Task 3 & Task 4.

- [ ] **Step 1: Tulis test gagal**

Tambahkan ke akhir `web/tests/midtrans-client.test.ts` (setelah blok `describe("getTransactionStatus", ...)` yang sudah ada, jangan hapus isi yang ada):

```ts
describe("createSnapTransaction", () => {
  it("POST ke /snap/v1/transactions dengan Basic Auth, tanpa payment_type", async () => {
    const fn = mockFetchOnce({
      token: "snap-token-abc",
      redirect_url: "https://app.sandbox.midtrans.com/snap/v3/redirection/snap-token-abc",
    });

    const result = await createSnapTransaction({ orderId: "INV-1", grossAmount: 22000 }, creds);

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://app.sandbox.midtrans.com/snap/v1/transactions");
    const req = init as RequestInit;
    expect((req.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("SB-server-key:").toString("base64")}`,
    );
    const body = JSON.parse(req.body as string);
    expect(body.payment_type).toBeUndefined();
    expect(body.transaction_details).toEqual({ order_id: "INV-1", gross_amount: 22000 });

    expect(result.token).toBe("snap-token-abc");
    expect(result.redirectUrl).toBe("https://app.sandbox.midtrans.com/snap/v3/redirection/snap-token-abc");
  });

  it("pakai base URL production kalau isProduction true", async () => {
    const fn = mockFetchOnce({ token: "t", redirect_url: "https://app.midtrans.com/snap/v3/redirection/t" });
    await createSnapTransaction({ orderId: "INV-1", grossAmount: 1000 }, { serverKey: "prod-key", isProduction: true });
    expect(fn.mock.calls[0][0]).toBe("https://app.midtrans.com/snap/v1/transactions");
  });

  it("lempar error kalau response tidak sesuai skema", async () => {
    mockFetchOnce({ error_messages: ["invalid"] });
    await expect(createSnapTransaction({ orderId: "INV-1", grossAmount: 1000 }, creds)).rejects.toThrow(
      /Snap transaction: response tidak sesuai/,
    );
  });
});
```

Tambahkan `createSnapTransaction` ke baris import paling atas file test (baris 2): ganti
```ts
import { chargeQris, getTransactionStatus } from "@/lib/midtrans/client";
```
jadi
```ts
import { chargeQris, getTransactionStatus, createSnapTransaction } from "@/lib/midtrans/client";
```

Run: `cd web && npx vitest run tests/midtrans-client.test.ts`
Expected: FAIL — `createSnapTransaction` belum ada di `@/lib/midtrans/client`.

- [ ] **Step 2: Implementasi `createSnapTransaction`**

Di `web/src/lib/midtrans/client.ts`, tambah fungsi baru di akhir file (setelah `getTransactionStatus`):

```ts
function snapBaseUrl(creds: MidtransCreds): string {
  return creds.isProduction ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
}

const snapTransactionSchema = z.object({
  token: z.string(),
  redirect_url: z.string(),
});

export interface SnapTransactionResult {
  token: string;
  redirectUrl: string;
}

export async function createSnapTransaction(
  input: { orderId: string; grossAmount: number },
  creds: MidtransCreds = {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  },
): Promise<SnapTransactionResult> {
  const raw = await request(`${snapBaseUrl(creds)}/snap/v1/transactions`, creds, {
    method: "POST",
    body: JSON.stringify({
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
    }),
  });
  const parsed = snapTransactionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Snap transaction: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
  }
  return { token: parsed.data.token, redirectUrl: parsed.data.redirect_url };
}
```

**Catatan implementasi:** endpoint `/snap/v1/transactions` dan base URL `app.sandbox.midtrans.com`/`app.midtrans.com` (BEDA dari `api.sandbox.midtrans.com` yang dipakai Core API) berdasarkan dokumentasi Midtrans — kalau saat Step 3 (jalankan test) atau Task 7 (sandbox nyata) ternyata endpoint ini salah/berubah, cek dokumentasi resmi Midtrans (`https://docs.midtrans.com/reference/snap-token`) untuk nilai yang benar, jangan asumsikan test yang salah.

- [ ] **Step 3: Jalankan test, pastikan lulus**

Run: `cd web && npx vitest run tests/midtrans-client.test.ts`
Expected: semua test PASS (termasuk 2 describe block lama `chargeQris`/`getTransactionStatus` yang tidak disentuh).

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/midtrans/client.ts web/tests/midtrans-client.test.ts
git commit -m "fix(snap): tambah createSnapTransaction (Snap Transaction API)"
```

---

## Task 2: Load Snap.js + update CSP

**Files:**
- Create: `web/src/lib/midtrans/snap-config.ts`
- Modify: `web/src/app/layout.tsx`
- Modify: `web/next.config.ts`
- Create: `web/src/types/midtrans-snap.d.ts`

**Interfaces:**
- Produces: `SNAP_JS_URL` (konstanta string) dari `snap-config.ts`, dipakai Task 2 sendiri (root layout). `window.snap` (tipe global) dipakai Task 3 & 4.

- [ ] **Step 1: Tambah env var public baru**

Di `web/.env.example`, ganti baris:
```
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY="isi-client-key-sandbox-dari-dashboard-midtrans"
MIDTRANS_IS_PRODUCTION="false"
```
jadi (tambah 1 baris baru di antaranya):
```
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY="isi-client-key-sandbox-dari-dashboard-midtrans"
MIDTRANS_IS_PRODUCTION="false"
NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION="false"
```

Di `web/.env` (lokal, sudah ada `MIDTRANS_SERVER_KEY`/`NEXT_PUBLIC_MIDTRANS_CLIENT_KEY`/`MIDTRANS_IS_PRODUCTION="false"` dari sesi sebelumnya), tambah baris baru persis di bawah `MIDTRANS_IS_PRODUCTION="false"`:
```
NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION="false"
```
**PENTING — gunakan Edit tool, JANGAN `cat >>`/heredoc bash buat nambah baris ke `.env`** (insiden sesi sebelumnya: append heredoc pernah bikin baris kegabung tanpa newline dan merusak `MIDTRANS_IS_PRODUCTION`, verifikasi hasil edit dengan Read sebelum lanjut).

**Kenapa dobel dengan `MIDTRANS_IS_PRODUCTION` yang sudah ada:** yang lama itu server-only (dipakai `lib/midtrans/client.ts`, tidak boleh ke-bundle ke browser), yang baru khusus dipakai client component buat pilih URL `snap.js` yang benar — dua kebutuhan beda, keduanya harus tetap sinkron manual kalau ganti ke production nanti (bukan bug, konsekuensi Next.js env var).

- [ ] **Step 2: Buat `snap-config.ts`**

```ts
export const SNAP_JS_URL =
  process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true"
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";
```

- [ ] **Step 3: Buat deklarasi tipe global `window.snap`**

```ts
export {};

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        options?: {
          onSuccess?: (result: unknown) => void;
          onPending?: (result: unknown) => void;
          onError?: (result: unknown) => void;
          onClose?: () => void;
        },
      ) => void;
    };
  }
}
```

- [ ] **Step 4: Muat script di root layout**

Di `web/src/app/layout.tsx`, tambah import di baris paling atas (setelah import `QueryProvider`):
```ts
import Script from "next/script";
import { SNAP_JS_URL } from "@/lib/midtrans/snap-config";
```

Ganti isi `<body>` dari:
```tsx
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
```
jadi:
```tsx
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
        <Script
          src={SNAP_JS_URL}
          data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY}
          strategy="afterInteractive"
        />
      </body>
```

- [ ] **Step 5: Update CSP di `next.config.ts`**

Ganti blok `CSP` di `web/next.config.ts`:
```ts
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join("; ");
```
jadi:
```ts
const MIDTRANS_SNAP_DOMAINS = "https://app.sandbox.midtrans.com https://app.midtrans.com";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${MIDTRANS_SNAP_DOMAINS}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${MIDTRANS_SNAP_DOMAINS}`,
  `frame-src ${MIDTRANS_SNAP_DOMAINS}`,
  "frame-ancestors 'none'",
].join("; ");
```

**PENTING:** ini best-guess berdasar domain resmi Midtrans yang sudah dipakai di kode (`snapBaseUrl`/`baseUrl` Task 1). **WAJIB diverifikasi ulang di Task 7** — buka DevTools Console pas testing sandbox nyata, kalau ada CSP violation error (biasanya nyebut domain yang diblokir persis di pesan errornya), tambah domain itu ke directive yang sesuai. Jangan anggap daftar ini final sebelum Task 7 selesai tanpa violation.

- [ ] **Step 6: Verifikasi build**

Run: `cd web && npx tsc --noEmit`
Expected: bersih, tidak ada error (termasuk dari `.d.ts` baru).

Run: `cd web && npm run build`
Expected: build sukses, tidak ada error.

- [ ] **Step 7: Commit**

```bash
git add web/.env.example web/src/lib/midtrans/snap-config.ts web/src/types/midtrans-snap.d.ts web/src/app/layout.tsx web/next.config.ts
git commit -m "fix(snap): muat script Snap.js di root layout + update CSP"
```

(`.env`/`.env.production` lokal gitignored, tidak ikut commit — pastikan sudah diedit manual sesuai Step 1.)

---

## Task 3: Checkout order pindah ke Snap

**Files:**
- Modify: `web/src/app/actions/checkout.ts`
- Modify: `web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx`

**Interfaces:**
- Consumes: `createSnapTransaction` (Task 1), `window.snap`/`SNAP_JS_URL` sudah termuat global (Task 2).
- Produces: `CheckoutResult.snapToken?: string` — dipakai Task 5 (invoice resume) TIDAK langsung, tapi field ini juga yang disimpan ke `rawResponse` yang dibaca Task 5.

- [ ] **Step 1: Update `CheckoutResult` + `createMidtransOrder`**

Di `web/src/app/actions/checkout.ts`, ganti import (baris 9):
```ts
import { chargeQris } from "@/lib/midtrans/client";
```
jadi:
```ts
import { createSnapTransaction } from "@/lib/midtrans/client";
```

Ganti interface `CheckoutResult` (baris 17-22):
```ts
export interface CheckoutResult {
  ok?: string;
  error?: string;
  orderNumber?: string;
  publicToken?: string;
}
```
jadi:
```ts
export interface CheckoutResult {
  ok?: string;
  error?: string;
  orderNumber?: string;
  publicToken?: string;
  snapToken?: string;
}
```

Di fungsi `createMidtransOrder`, ganti blok `payment: { create: ... }` (baris 179):
```ts
    payment: { create: { method: "qris", status: "PENDING", expiredAt } },
```
jadi:
```ts
    payment: { create: { method: "snap", status: "PENDING", expiredAt } },
```

Ganti blok try-charge (baris 185-203):
```ts
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
```
jadi:
```ts
  let snapToken: string;
  try {
    const snap = await createSnapTransaction({ orderId: order.orderNumber, grossAmount: Number(input.item.sellingPrice) });
    snapToken = snap.token;
    await db.orderPayment.update({
      where: { orderId: order.id },
      data: {
        rawResponse: { snapToken: snap.token, redirectUrl: snap.redirectUrl } as object,
      },
    });
  } catch (e) {
    console.error("Checkout: Midtrans Snap transaction gagal", { orderId: order.id, error: e });
    await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    await db.orderPayment.update({ where: { orderId: order.id }, data: { status: "FAILED" } });
    await db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "FAILED", note: "Snap transaction Midtrans gagal" },
    });
    return { error: "Gagal membuat pembayaran, silakan coba lagi." };
  }
```

(`paymentRef` — sebelumnya diisi `charge.transactionId` dari Core API — SENGAJA tidak diisi di sini: Snap Transaction API tidak balikin `transaction_id` di respons pembuatan token, baru ada setelah settlement lewat webhook. Ini simplifikasi sadar, bukan bug — `paymentRef` tetap `null` untuk pembayaran via Snap, field ini cuma dipakai buat lookup admin, tidak dipakai logic verifikasi nominal/signature.)

Ganti baris return terakhir fungsi (baris 214):
```ts
  return { ok: "Order dibuat.", orderNumber: order.orderNumber, publicToken: order.publicToken };
```
jadi:
```ts
  return { ok: "Order dibuat.", orderNumber: order.orderNumber, publicToken: order.publicToken, snapToken };
```

- [ ] **Step 2: Update `product-detail-client.tsx` — trigger Snap popup**

Ganti baris import (baris 1-14):
```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QrCode, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TrustBadges } from "@/components/trust-badges";
import { createCheckoutOrder, type CheckoutResult } from "@/app/actions/checkout";
import { hasSufficientBalance } from "@/lib/wallet/decisions";
import type { ProductForCheckout } from "@/lib/catalog/public";
```
jadi:
```tsx
"use client";

import { useActionState, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QrCode, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TrustBadges } from "@/components/trust-badges";
import { createCheckoutOrder, type CheckoutResult } from "@/app/actions/checkout";
import { hasSufficientBalance } from "@/lib/wallet/decisions";
import type { ProductForCheckout } from "@/lib/catalog/public";
```

Ganti blok `useEffect` yang sekarang (baris 53-55):
```tsx
  useEffect(() => {
    if (state.publicToken) router.push(`/invoice/${state.publicToken}`);
  }, [state.publicToken, router]);
```
jadi:
```tsx
  const goToInvoice = useCallback(() => {
    if (state.publicToken) router.push(`/invoice/${state.publicToken}`);
  }, [state.publicToken, router]);

  useEffect(() => {
    // paymentMethod "balance" tidak pernah balikin snapToken (bayar langsung
    // di server, tidak lewat Midtrans) - order.publicToken saja cukup buat
    // langsung ke invoice, tidak perlu tunggu popup Snap.
    if (state.publicToken && !state.snapToken) {
      goToInvoice();
      return;
    }
    if (!state.snapToken) return;
    if (!window.snap) {
      console.error("Snap.js belum termuat, tidak bisa buka popup pembayaran");
      return;
    }
    window.snap.pay(state.snapToken, {
      onSuccess: goToInvoice,
      onPending: goToInvoice,
      onClose: () => {
        // customer tutup popup tanpa bayar - order tetap PENDING_PAYMENT,
        // form tetap tampil, bisa submit ulang (dapat snapToken baru).
      },
    });
  }, [state.snapToken, state.publicToken, goToInvoice]);
```

Ganti label QRIS di `RadioGroupItem` (baris 124-127):
```tsx
              <RadioGroupItem value="qris">
                <QrCode className="size-4" aria-hidden="true" />
                QRIS
              </RadioGroupItem>
```
jadi:
```tsx
              <RadioGroupItem value="qris">
                <QrCode className="size-4" aria-hidden="true" />
                QRIS, VA, & Lainnya
              </RadioGroupItem>
```

(Value `"qris"` di form SENGAJA tidak diganti — itu cuma dipakai server action buat cabang if `paymentMethod === "balance"` vs bukan, bukan nama metode aktual yang dikirim ke Midtrans lagi setelah migrasi ini. Cuma label yang dilihat user yang perlu jujur direfleksikan.)

- [ ] **Step 3: Verifikasi**

Run: `cd web && npm test`
Expected: semua test PASS (termasuk test Task 1).

Run: `cd web && npx tsc --noEmit`
Expected: bersih.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/actions/checkout.ts "web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx"
git commit -m "fix(snap): checkout order pindah ke Snap popup"
```

---

## Task 4: Deposit saldo pindah ke Snap

**Files:**
- Modify: `web/src/app/actions/deposit.ts`
- Modify: `web/src/app/account/deposit/deposit-form.tsx`

**Interfaces:**
- Consumes: `createSnapTransaction` (Task 1), `window.snap` (Task 2).
- Produces: `DepositResult.snapToken?: string`, `DepositResult.depositId?: string` — dipakai Task 6.

- [ ] **Step 1: Ubah `createDeposit` — return object, bukan redirect**

Ganti seluruh isi `web/src/app/actions/deposit.ts`:
```ts
"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { depositSchema } from "@/lib/validation/deposit";
import { createSnapTransaction } from "@/lib/midtrans/client";

const EXPIRY_MINUTES = 15;

export interface DepositResult {
  error?: string;
  depositId?: string;
  snapToken?: string;
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

  let snapToken: string;
  try {
    // deposit.id (cuid) dipakai langsung sebagai Midtrans order_id — Deposit
    // tidak punya nomor publik terpisah seperti Order.orderNumber, dan
    // createSnapTransaction generik terhadap format order_id.
    const snap = await createSnapTransaction({ orderId: deposit.id, grossAmount: Number(parsed.data.amount) });
    snapToken = snap.token;
    await db.deposit.update({
      where: { id: deposit.id },
      data: {
        rawResponse: { snapToken: snap.token, redirectUrl: snap.redirectUrl } as object,
      },
    });
  } catch (e) {
    console.error("Deposit: Midtrans Snap transaction gagal", { depositId: deposit.id, error: e });
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

  return { depositId: deposit.id, snapToken };
}
```

(Sama seperti checkout: `paymentRef` tidak lagi diisi dari respons charge — Snap tidak balikin `transaction_id` di titik ini. `redirect()` di akhir DIHAPUS — client yang navigasi setelah popup Snap selesai, lihat Step 2.)

- [ ] **Step 2: Update `deposit-form.tsx` — trigger Snap popup**

Ganti seluruh isi `web/src/app/account/deposit/deposit-form.tsx`:
```tsx
"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  const goToStatus = useCallback(() => {
    if (state.depositId) router.push(`/account/deposit/${state.depositId}`);
  }, [state.depositId, router]);

  useEffect(() => {
    if (!state.snapToken) return;
    if (!window.snap) {
      console.error("Snap.js belum termuat, tidak bisa buka popup pembayaran");
      return;
    }
    window.snap.pay(state.snapToken, {
      onSuccess: goToStatus,
      onPending: goToStatus,
      onClose: () => {
        // customer tutup popup tanpa bayar - deposit tetap PENDING, form
        // tetap tampil, bisa submit ulang (dapat snapToken baru).
      },
    });
  }, [state.snapToken, goToStatus]);

  const amount = selected === "custom" ? custom : selected.toString();

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-5">
      <input type="hidden" name="amount" value={amount} />

      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.toString()}
            type="button"
            aria-pressed={selected === preset}
            onClick={() => setSelected(preset)}
            className={`min-h-11 rounded-[var(--radius)] border-2 px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
              selected === preset ? "border-primary bg-primary/10 text-primary" : "border-border"
            }`}
          >
            {formatRupiah(preset)}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={selected === "custom"}
          onClick={() => setSelected("custom")}
          className={`min-h-11 rounded-[var(--radius)] border-2 px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
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

- [ ] **Step 3: Verifikasi**

Run: `cd web && npm test`
Expected: semua test PASS.

Run: `cd web && npx tsc --noEmit`
Expected: bersih.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/actions/deposit.ts web/src/app/account/deposit/deposit-form.tsx
git commit -m "fix(snap): deposit saldo pindah ke Snap popup"
```

---

## Task 5: Invoice order — tombol Lanjutkan Pembayaran

**Files:**
- Modify: `web/src/app/api/orders/[token]/status/route.ts`
- Modify: `web/src/app/invoice/[token]/page.tsx`
- Modify: `web/src/app/invoice/[token]/invoice-status.tsx`

**Interfaces:**
- Consumes: `window.snap` (Task 2), field `rawResponse.snapToken` yang disimpan Task 3.

- [ ] **Step 1: Route status — tambah `snapToken`**

Di `web/src/app/api/orders/[token]/status/route.ts`, ganti:
```ts
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
```
jadi:
```ts
  const latestFulfillment = order.fulfillments[0];
  const actions = order.payment?.actions as { qrString?: string } | null;
  const rawResponse = order.payment?.rawResponse as { snapToken?: string } | null;

  return NextResponse.json(
    {
      orderNumber: order.orderNumber,
      status: order.status,
      productName: order.productName,
      itemName: order.itemName,
      total: order.total.toString(),
      qrString: actions?.qrString ?? null,
      snapToken: rawResponse?.snapToken ?? null,
      expiredAt: order.expiredAt,
      sn: latestFulfillment?.status === "SUCCESS" ? latestFulfillment.sn : order.manualSn,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
```

- [ ] **Step 2: `page.tsx` — teruskan `snapToken`**

Di `web/src/app/invoice/[token]/page.tsx`, ganti:
```tsx
  const actions = order.payment?.actions as { qrString?: string } | null;
  const latestFulfillment = order.fulfillments[0];
  const qrDataUri = actions?.qrString ? await QRCode.toDataURL(actions.qrString, { width: 240, margin: 1 }) : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-10">
      <Link href="/" className="font-heading text-sm font-bold text-primary hover:underline">
        ← DannShop
      </Link>
      <InvoiceStatus
        token={order.publicToken}
        qrDataUri={qrDataUri}
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
```
jadi:
```tsx
  const actions = order.payment?.actions as { qrString?: string } | null;
  const rawResponse = order.payment?.rawResponse as { snapToken?: string } | null;
  const latestFulfillment = order.fulfillments[0];
  const qrDataUri = actions?.qrString ? await QRCode.toDataURL(actions.qrString, { width: 240, margin: 1 }) : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-10">
      <Link href="/" className="font-heading text-sm font-bold text-primary hover:underline">
        ← DannShop
      </Link>
      <InvoiceStatus
        token={order.publicToken}
        qrDataUri={qrDataUri}
        initial={{
          orderNumber: order.orderNumber,
          status: order.status,
          productName: order.productName,
          itemName: order.itemName,
          total: order.total.toString(),
          qrString: actions?.qrString ?? null,
          snapToken: rawResponse?.snapToken ?? null,
          expiredAt: order.expiredAt?.toISOString() ?? null,
          sn: latestFulfillment?.status === "SUCCESS" ? latestFulfillment.sn : order.manualSn,
        }}
      />
    </div>
  );
```

- [ ] **Step 3: `invoice-status.tsx` — tombol Lanjutkan Pembayaran**

Ganti baris import (baris 1-16), tambah `useEffect`:
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
```

Ganti interface `OrderStatusResponse` (baris 20-29):
```ts
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
```
jadi:
```ts
interface OrderStatusResponse {
  orderNumber: string;
  status: string;
  productName: string;
  itemName: string;
  total: string;
  qrString: string | null;
  snapToken: string | null;
  expiredAt: string | null;
  sn: string | null;
}
```

Tambah handler baru setelah `handleCopySn` (setelah baris 105, sebelum `return (`):
```tsx
  function handleContinuePayment() {
    if (!order.snapToken || !window.snap) return;
    window.snap.pay(order.snapToken, {});
  }
```

Tambah blok tombol setelah blok QR yang sudah ada (setelah baris 144, sebelum blok `order.status === "COMPLETED"`):
```tsx
      {order.status === "PENDING_PAYMENT" && order.snapToken && !order.qrString && (
        <Button onClick={handleContinuePayment} className="h-11 w-full text-base font-heading">
          Lanjutkan Pembayaran
        </Button>
      )}
```

(`!order.qrString` di kondisi — order lama dari sebelum migrasi ini masih render QR custom yang sudah ada, order baru [Snap, `qrString` selalu `null`] dapat tombol popup. Dua jalur ini tidak akan pernah aktif bareng untuk order yang sama.)

- [ ] **Step 4: Verifikasi**

Run: `cd web && npx tsc --noEmit`
Expected: bersih.

- [ ] **Step 5: Commit**

```bash
git add "web/src/app/api/orders/[token]/status/route.ts" "web/src/app/invoice/[token]/page.tsx" "web/src/app/invoice/[token]/invoice-status.tsx"
git commit -m "fix(snap): tombol lanjutkan pembayaran di halaman invoice"
```

---

## Task 6: Deposit status — tombol Lanjutkan Pembayaran

**Files:**
- Modify: `web/src/app/api/deposits/[depositId]/status/route.ts`
- Modify: `web/src/app/account/deposit/[depositId]/page.tsx`
- Modify: `web/src/app/account/deposit/[depositId]/deposit-status.tsx`

**Interfaces:**
- Consumes: `window.snap` (Task 2), field `rawResponse.snapToken` yang disimpan Task 4.

- [ ] **Step 1: Route status — tambah `snapToken`**

Di `web/src/app/api/deposits/[depositId]/status/route.ts`, ganti:
```ts
  const rawResponse = deposit.rawResponse as { qrString?: string } | null;

  return NextResponse.json(
    {
      depositId: deposit.id,
      status: deposit.status,
      amount: deposit.amount.toString(),
      qrString: rawResponse?.qrString ?? null,
      expiredAt: deposit.expiredAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
```
jadi:
```ts
  const rawResponse = deposit.rawResponse as { qrString?: string; snapToken?: string } | null;

  return NextResponse.json(
    {
      depositId: deposit.id,
      status: deposit.status,
      amount: deposit.amount.toString(),
      qrString: rawResponse?.qrString ?? null,
      snapToken: rawResponse?.snapToken ?? null,
      expiredAt: deposit.expiredAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
```

- [ ] **Step 2: `page.tsx` — teruskan `snapToken`**

Di `web/src/app/account/deposit/[depositId]/page.tsx`, ganti:
```tsx
  const rawResponse = deposit.rawResponse as { qrString?: string } | null;
  const qrDataUri = rawResponse?.qrString ? await QRCode.toDataURL(rawResponse.qrString, { width: 240, margin: 1 }) : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-10">
      <Link href="/account" className="font-heading text-sm font-bold text-primary hover:underline">
        ← Akun Saya
      </Link>
      <DepositStatus
        depositId={deposit.id}
        qrDataUri={qrDataUri}
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
```
jadi:
```tsx
  const rawResponse = deposit.rawResponse as { qrString?: string; snapToken?: string } | null;
  const qrDataUri = rawResponse?.qrString ? await QRCode.toDataURL(rawResponse.qrString, { width: 240, margin: 1 }) : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-10">
      <Link href="/account" className="font-heading text-sm font-bold text-primary hover:underline">
        ← Akun Saya
      </Link>
      <DepositStatus
        depositId={deposit.id}
        qrDataUri={qrDataUri}
        initial={{
          depositId: deposit.id,
          status: deposit.status,
          amount: deposit.amount.toString(),
          qrString: rawResponse?.qrString ?? null,
          snapToken: rawResponse?.snapToken ?? null,
          expiredAt: deposit.expiredAt?.toISOString() ?? null,
        }}
      />
    </div>
  );
```

- [ ] **Step 3: `deposit-status.tsx` — tombol Lanjutkan Pembayaran**

Ganti baris import (baris 1-6):
```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
```
jadi:
```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
```

Ganti interface `DepositStatusResponse` (baris 10-16):
```ts
interface DepositStatusResponse {
  depositId: string;
  status: string;
  amount: string;
  qrString: string | null;
  expiredAt: string | null;
}
```
jadi:
```ts
interface DepositStatusResponse {
  depositId: string;
  status: string;
  amount: string;
  qrString: string | null;
  snapToken: string | null;
  expiredAt: string | null;
}
```

Tambah handler baru di dalam komponen, sebelum `return (` (setelah baris `const StatusIcon = ...`, baris 61):
```tsx
  function handleContinuePayment() {
    if (!deposit.snapToken || !window.snap) return;
    window.snap.pay(deposit.snapToken, {});
  }
```

Tambah blok tombol setelah blok QR yang sudah ada (setelah baris 93, sebelum blok `deposit.status === "PAID"`):
```tsx
      {deposit.status === "PENDING" && deposit.snapToken && !deposit.qrString && (
        <Button onClick={handleContinuePayment} className="h-11 w-full text-base font-heading">
          Lanjutkan Pembayaran
        </Button>
      )}
```

- [ ] **Step 4: Verifikasi**

Run: `cd web && npx tsc --noEmit`
Expected: bersih.

Run: `cd web && npm test`
Expected: semua test PASS (139+3 dari Task 1 = 142).

Run: `cd web && npm run build`
Expected: build sukses.

- [ ] **Step 5: Commit**

```bash
git add "web/src/app/api/deposits/[depositId]/status/route.ts" "web/src/app/account/deposit/[depositId]/page.tsx" "web/src/app/account/deposit/[depositId]/deposit-status.tsx"
git commit -m "fix(snap): tombol lanjutkan pembayaran di halaman status deposit"
```

---

## Task 7: Verifikasi manual E2E sandbox (WAJIB sebelum merge)

Task ini tidak menghasilkan kode baru — checklist verifikasi nyata terhadap Midtrans sandbox. **Ini jalur uang, tidak boleh di-skip atau dianggap "kemungkinan besar jalan".**

- [ ] **Step 1: Jalankan dev server, buka checkout**

`cd web && npm run dev`. Buka produk apa saja di browser, isi form checkout, submit.
Expected: popup Snap muncul (bukan blank/error). Cek DevTools Console — **NOL CSP violation error**. Kalau ada violation, tambahkan domain yang disebutkan ke directive CSP yang sesuai di `next.config.ts` (lihat Task 2 Step 5), lalu ulangi dari awal step ini.

- [ ] **Step 2: Selesaikan pembayaran QRIS via popup**

Di popup Snap, pilih QRIS, selesaikan pakai simulator sandbox Midtrans (`https://simulator.sandbox.midtrans.com/qris/index`, sama seperti teknik yang dipakai Fase 7c — POST `qrCodeUrl` dari popup, atau cek `redirect_url`/`token` yang didapat untuk cara simulasi yang berlaku untuk transaksi Snap).
Expected: `onSuccess`/`onPending` jalan → redirect ke `/invoice/[token]`. Cek log server (`console.error` kalau ada) — webhook masuk, order jadi `PAID`, fulfillment jalan (SN muncul di invoice untuk produk auto-fulfillment).

Kalau webhook TIDAK masuk atau format tidak sesuai (`notifSchema` di `api/webhooks/midtrans/route.ts` menolak payload) — **STOP, jangan improvisasi ubah webhook sendiri**, laporkan temuan persis (payload yang diterima vs yang diharapkan) sebelum lanjut.

- [ ] **Step 3: Coba metode selain QRIS**

Ulangi checkout baru, di popup pilih Virtual Account (metode apa saja yang aktif di akun sandbox). Selesaikan lewat simulator sandbox yang sesuai metode itu.
Expected: sama seperti Step 2 — webhook masuk benar, order `PAID`, nominal (M-3) cocok tidak ke-escalate palsu.

- [ ] **Step 4: Tutup popup tanpa bayar**

Checkout baru, popup muncul, klik tutup (X) tanpa bayar.
Expected: `onClose` jalan (tidak redirect), order tetap `PENDING_PAYMENT` di DB. Buka manual halaman invoice-nya (`/invoice/[publicToken]` dari network tab/DB) — tombol "Lanjutkan Pembayaran" muncul, klik → popup Snap kebuka lagi dengan token yang sama, bisa diselesaikan.

- [ ] **Step 5: Ulangi Step 1-4 untuk deposit**

Buka `/account/deposit` (perlu login), isi nominal, submit — verifikasi popup muncul, selesaikan bayar via simulator, cek saldo bertambah (`WalletLedger` baru), cek tombol lanjutkan pembayaran di `/account/deposit/[depositId]` untuk kasus `onClose`.

- [ ] **Step 6: Catat hasil**

Kalau semua PASS: Fase ini siap untuk final whole-branch review. Kalau ada yang gagal (terutama Step 2/3 soal webhook): catat detail persis kegagalannya (payload, response, log error) sebelum lanjut — JANGAN mark task ini selesai kalau ada kegagalan money-flow yang belum diberesin.
