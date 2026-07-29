# Fase 7a: Admin Orders + Refund Queue + Notifikasi Telegram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin bisa melihat, mencari, dan menyelesaikan order yang butuh perhatian manual (`NEEDS_REVIEW`, `REFUND_PENDING`) lewat halaman `/admin/orders`, dan dapat notifikasi proaktif via Telegram begitu ada order yang butuh aksi — tanpa harus memantau dashboard terus-menerus.

**Architecture:** Reuse model/enum yang sudah ada (tidak ada migrasi Prisma). Modul baru `web/src/lib/notify/telegram.ts` untuk kirim pesan (pola sama seperti `midtrans/client.ts`), dipanggil "best effort" (tidak pernah throw) dari titik-titik order sudah jatuh ke `NEEDS_REVIEW`/`REFUND_PENDING` di `fulfillment.ts`/`runner.ts`. Logic retry fulfillment dipecah jadi fungsi keputusan pure (`decideFulfillmentRetry`, TDD) + fungsi orkestrasi DB (`retryOrderFulfillment`) yang menangani 2 penyebab `NEEDS_REVIEW` berbeda (belum ada attempt sama sekali vs. attempt masih pending) secara transparan di balik satu tombol admin. Server actions ikut pola `ActionResult`/`requireAdmin`/`logAdmin` yang sudah dipakai di `catalog.ts`/`providers.ts`.

**Tech Stack:** Next.js 16 (App Router, Server Actions, async `params`/`searchParams`), React 19, Prisma/MySQL, Vitest, Tailwind + shared `@/components/ui/*` (base-ui wrapper).

## Global Constraints

- **Tidak ada migrasi Prisma** — semua model/enum yang dibutuhkan (`OrderStatus.NEEDS_REVIEW`/`REFUND_PENDING`/`REFUNDED`/`COMPLETED`, `OrderStatusHistory.note`, `AdminActionLog`) sudah ada di schema.
- **TDD untuk logic pure** — `decideFulfillmentRetry` (Task 1) dan `formatOrderAlertMessage` (Task 2) adalah fungsi pure, wajib TDD. Kode orkestrasi DB (server actions, halaman admin, `sendTelegramAlert`) **tidak** diuji lewat DB/network tiruan — tidak ada infrastruktur test-DB di repo ini — diverifikasi manual end-to-end di Task 8, persis pola Task 11 Fase 4 / Task 13 Fase 3.
- **`sendTelegramAlert` tidak pernah melempar error** — kegagalan kirim Telegram (bot down/network) TIDAK BOLEH mengganggu jalur uang di `fulfillment.ts`/`runner.ts`. Selalu dibungkus try/catch internal.
- **Idempotensi & klaim atomik** — setiap transisi status order pakai `updateMany` dengan guard status (pola established sejak Fase 3), setiap kredit `Wallet.balance` di `retryOrderRefund` tetap dalam satu `db.$transaction` dengan `WalletLedger` ber-`idempotencyKey` sama persis dengan yang dipakai jalur otomatis (`order-refund:${order.id}`) — supaya unique constraint mencegah kredit dobel kalau retry dipanggil lebih dari sekali.
- **Tidak re-alert Telegram saat retry manual gagal lagi** — hanya transisi OTOMATIS (dispatch awal, escalasi recheck 30x, refund-tx-crash awal) yang kirim Telegram. Retry manual oleh admin yang gagal lagi TIDAK kirim alert baru (admin sudah tahu, mereka yang baru saja klik) — mencegah spam.
- **Semua teks UI, commit message, dan komentar kode dalam Bahasa Indonesia**, konsisten dengan Fase 1-4.
- **Ikuti design token & komponen yang sudah ada** — `Table`/`Badge`/`Button`/`Card` dari `@/components/ui/*`, label status dari `ORDER_STATUS_LABEL` (`web/src/lib/order/status-labels.ts`), pola halaman admin sama seperti `web/src/app/admin/products/page.tsx`. **Tidak ada komponen Dialog/Modal di codebase ini** — konfirmasi sebelum aksi pakai `window.confirm(...)` browser native, pola sama seperti `test-transaction-form.tsx:48`.
- **`/admin/orders` dan `/admin/orders/[orderNumber]` sudah otomatis ter-proteksi** oleh `web/src/proxy.ts` (matcher `/admin/:path*`) dan `web/src/app/admin/layout.tsx` (re-check role ADMIN) — tidak perlu kode auth tambahan di halaman baru.

---

## Peta File

**Baru:**
- `web/src/lib/order/retry-decision.ts` — fungsi pure `decideFulfillmentRetry`
- `web/tests/order-retry-decision.test.ts`
- `web/src/lib/notify/telegram.ts` — `sendTelegramAlert`, `formatOrderAlertMessage`
- `web/tests/notify-telegram.test.ts`
- `web/src/app/actions/orders.ts` — 4 server action: `retryFulfillmentAction`, `retryRefundAction`, `markCompletedManualAction`, `markRefundedAction`
- `web/src/app/admin/orders/action-utils.tsx` — helper client (`ActionResult`, `withPrevState`, `ActionMessage`) khusus fitur orders
- `web/src/app/admin/orders/page.tsx` — daftar order + tab filter + pencarian
- `web/src/app/admin/orders/[orderNumber]/page.tsx` — detail order
- `web/src/app/admin/orders/[orderNumber]/order-actions.tsx` — client component 4 form aksi

**Diubah:**
- `web/src/lib/order/fulfillment.ts` — wire Telegram alert (Task 3) + extract `selectAndSend` + tambah `retryOrderFulfillment`/`retryOrderRefund` (Task 4)
- `web/src/lib/jobs/runner.ts` — wire Telegram alert di eskalasi `recheck-fulfillment` (Task 3)
- `.env.example` — tambah `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

---

### Task 1: Fungsi keputusan retry fulfillment (TDD)

**Files:**
- Create: `web/src/lib/order/retry-decision.ts`
- Test: `web/tests/order-retry-decision.test.ts`

**Interfaces:**
- Produces: `decideFulfillmentRetry(fulfillments: FulfillmentAttempt[]): RetryDecision`, tipe `FulfillmentAttempt = { id: string; attemptNo: number; status: "SENT" | "PROCESSING" | "SUCCESS" | "FAILED" }`, tipe `RetryDecision = { action: "recheck_status"; fulfillmentId: string } | { action: "send_fresh"; nextAttemptNo: number } | { action: "not_eligible"; reason: string }` — dipakai Task 4.

Order bisa jatuh ke `NEEDS_REVIEW` karena 2 penyebab beda (ditemukan saat riset plan ini, lihat `web/src/lib/order/fulfillment.ts` & `web/src/lib/jobs/runner.ts`): (a) belum pernah ada percobaan fulfillment sama sekali (SKU provider tidak tersedia saat order pertama diproses), (b) sudah ada percobaan tapi masih `SENT`/`PROCESSING` (macet, dieskalasi otomatis setelah 30x recheck tanpa hasil). Fungsi ini memutuskan aksi retry yang tepat dari daftar attempt yang ada, tanpa menyentuh DB — dipakai Task 4 untuk mengarahkan satu tombol admin "Coba Lagi" ke penanganan yang benar secara otomatis.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// web/tests/order-retry-decision.test.ts
import { describe, expect, it } from "vitest";
import { decideFulfillmentRetry } from "@/lib/order/retry-decision";

describe("decideFulfillmentRetry", () => {
  it("belum ada attempt sama sekali → send_fresh attempt 1", () => {
    expect(decideFulfillmentRetry([])).toEqual({ action: "send_fresh", nextAttemptNo: 1 });
  });

  it("attempt terakhir SENT (masih dikirim, belum ada hasil) → recheck_status", () => {
    const result = decideFulfillmentRetry([{ id: "f1", attemptNo: 1, status: "SENT" }]);
    expect(result).toEqual({ action: "recheck_status", fulfillmentId: "f1" });
  });

  it("attempt terakhir PROCESSING → recheck_status", () => {
    const result = decideFulfillmentRetry([{ id: "f1", attemptNo: 1, status: "PROCESSING" }]);
    expect(result).toEqual({ action: "recheck_status", fulfillmentId: "f1" });
  });

  it("attempt terakhir FAILED → send_fresh dengan attemptNo berikutnya", () => {
    const result = decideFulfillmentRetry([{ id: "f1", attemptNo: 1, status: "FAILED" }]);
    expect(result).toEqual({ action: "send_fresh", nextAttemptNo: 2 });
  });

  it("attempt terakhir SUCCESS → not_eligible (order sudah selesai)", () => {
    const result = decideFulfillmentRetry([{ id: "f1", attemptNo: 1, status: "SUCCESS" }]);
    expect(result).toEqual({ action: "not_eligible", reason: "Order sudah selesai (SN sudah terbit)." });
  });

  it("banyak attempt tidak berurutan → pilih attemptNo tertinggi, bukan urutan array", () => {
    const result = decideFulfillmentRetry([
      { id: "f2", attemptNo: 2, status: "FAILED" },
      { id: "f1", attemptNo: 1, status: "FAILED" },
    ]);
    expect(result).toEqual({ action: "send_fresh", nextAttemptNo: 3 });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd web && npx vitest run tests/order-retry-decision.test.ts`
Expected: FAIL — `Cannot find module '@/lib/order/retry-decision'` (file belum ada).

- [ ] **Step 3: Implementasi**

```ts
// web/src/lib/order/retry-decision.ts
export interface FulfillmentAttempt {
  id: string;
  attemptNo: number;
  status: "SENT" | "PROCESSING" | "SUCCESS" | "FAILED";
}

export type RetryDecision =
  | { action: "recheck_status"; fulfillmentId: string }
  | { action: "send_fresh"; nextAttemptNo: number }
  | { action: "not_eligible"; reason: string };

export function decideFulfillmentRetry(fulfillments: FulfillmentAttempt[]): RetryDecision {
  if (fulfillments.length === 0) return { action: "send_fresh", nextAttemptNo: 1 };

  const latest = fulfillments.reduce((a, b) => (a.attemptNo > b.attemptNo ? a : b));

  if (latest.status === "SUCCESS") {
    return { action: "not_eligible", reason: "Order sudah selesai (SN sudah terbit)." };
  }
  if (latest.status === "SENT" || latest.status === "PROCESSING") {
    return { action: "recheck_status", fulfillmentId: latest.id };
  }
  return { action: "send_fresh", nextAttemptNo: latest.attemptNo + 1 };
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd web && npx vitest run tests/order-retry-decision.test.ts`
Expected: PASS, 6/6 test.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/order/retry-decision.ts web/tests/order-retry-decision.test.ts
git commit -m "feat(fase7a): fungsi keputusan retry fulfillment (TDD)"
```

---

### Task 2: Modul notifikasi Telegram (TDD untuk bagian pure)

**Files:**
- Create: `web/src/lib/notify/telegram.ts`
- Test: `web/tests/notify-telegram.test.ts`

**Interfaces:**
- Produces: `sendTelegramAlert(message: string, config?: TelegramConfig): Promise<void>` (tidak pernah throw), `formatOrderAlertMessage(params: { orderNumber: string; status: string; reason: string }, baseUrl?: string): string`, tipe `TelegramConfig = { botToken: string; chatId: string }` — dipakai Task 3 & 4.

- [ ] **Step 1: Tulis test untuk `formatOrderAlertMessage` (pure, gagal dulu)**

```ts
// web/tests/notify-telegram.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatOrderAlertMessage, sendTelegramAlert } from "@/lib/notify/telegram";

describe("formatOrderAlertMessage", () => {
  it("menyusun pesan dengan nomor order, status, alasan, dan link admin", () => {
    const msg = formatOrderAlertMessage(
      { orderNumber: "INV-20260729-0001", status: "NEEDS_REVIEW", reason: "Tidak ada provider SKU tersedia" },
      "https://dannshop.test",
    );
    expect(msg).toContain("INV-20260729-0001");
    expect(msg).toContain("NEEDS_REVIEW");
    expect(msg).toContain("Tidak ada provider SKU tersedia");
    expect(msg).toContain("https://dannshop.test/admin/orders/INV-20260729-0001");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `cd web && npx vitest run tests/notify-telegram.test.ts`
Expected: FAIL — module belum ada.

- [ ] **Step 3: Implementasi `formatOrderAlertMessage` + kerangka `sendTelegramAlert`**

```ts
// web/src/lib/notify/telegram.ts
export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

function configFromEnv(): TelegramConfig {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
  };
}

export function formatOrderAlertMessage(
  params: { orderNumber: string; status: string; reason: string },
  baseUrl: string = process.env.NEXT_PUBLIC_APP_URL ?? "",
): string {
  return `⚠️ Order ${params.orderNumber} → ${params.status}\n${params.reason}\n${baseUrl}/admin/orders/${params.orderNumber}`;
}

// Tidak pernah throw - kegagalan kirim notifikasi tidak boleh mengganggu
// jalur uang di fulfillment.ts/runner.ts yang memanggil fungsi ini.
export async function sendTelegramAlert(message: string, config: TelegramConfig = configFromEnv()): Promise<void> {
  if (!config.botToken || !config.chatId) {
    console.error("Telegram: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID belum di-set, notifikasi dilewati", { message });
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text: message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Telegram: gagal kirim notifikasi (status ${res.status}): ${text.slice(0, 200)}`);
    }
  } catch (e) {
    console.error("Telegram: gagal kirim notifikasi", { error: e instanceof Error ? e.message : String(e) });
  }
}
```

- [ ] **Step 4: Jalankan test `formatOrderAlertMessage`, pastikan lulus**

Run: `cd web && npx vitest run tests/notify-telegram.test.ts`
Expected: PASS untuk describe block `formatOrderAlertMessage`.

- [ ] **Step 5: Tambah test untuk `sendTelegramAlert` (fetch di-mock, pola sama seperti `midtrans-client.test.ts`)**

```ts
// tambahkan ke web/tests/notify-telegram.test.ts, di bawah describe("formatOrderAlertMessage", ...)

function mockFetchOnce(ok: boolean, status = 200) {
  const fn = vi.fn().mockResolvedValue(new Response(ok ? "{}" : "error body", { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("sendTelegramAlert", () => {
  const config = { botToken: "test-token", chatId: "12345" };

  it("POST ke Telegram Bot API dengan chat_id dan text", async () => {
    const fn = mockFetchOnce(true);
    await sendTelegramAlert("Halo admin", config);

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bottest-token/sendMessage");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ chat_id: "12345", text: "Halo admin" });
  });

  it("tidak throw kalau Telegram balas non-200", async () => {
    mockFetchOnce(false, 401);
    await expect(sendTelegramAlert("Halo admin", config)).resolves.toBeUndefined();
  });

  it("tidak throw kalau fetch gagal total (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(sendTelegramAlert("Halo admin", config)).resolves.toBeUndefined();
  });

  it("tidak memanggil fetch sama sekali kalau botToken/chatId kosong", async () => {
    const fn = mockFetchOnce(true);
    await sendTelegramAlert("Halo admin", { botToken: "", chatId: "" });
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Jalankan seluruh test file, pastikan lulus**

Run: `cd web && npx vitest run tests/notify-telegram.test.ts`
Expected: PASS, 5/5 test (1 `formatOrderAlertMessage` + 4 `sendTelegramAlert`).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/notify/telegram.ts web/tests/notify-telegram.test.ts
git commit -m "feat(fase7a): modul notifikasi Telegram (sendTelegramAlert + formatOrderAlertMessage)"
```

---

### Task 3: Wire notifikasi Telegram ke titik NEEDS_REVIEW/REFUND_PENDING yang sudah ada

**Files:**
- Modify: `web/src/lib/order/fulfillment.ts`
- Modify: `web/src/lib/jobs/runner.ts`

**Interfaces:**
- Consumes: `sendTelegramAlert`, `formatOrderAlertMessage` (Task 2).

Tidak ada test otomatis baru di task ini (kode orkestrasi DB, lihat Global Constraints) — verifikasi lewat regresi test yang sudah ada + manual di Task 8. Ada 4 titik order jatuh ke status yang butuh perhatian admin, ketiganya di kode yang SUDAH ADA (Fase 3-4), belum pernah mengirim notifikasi apa pun:

1. `fulfillment.ts` — `dispatchFulfillment`, saat `selectFulfillmentSku` gagal (`NEEDS_REVIEW`)
2. `fulfillment.ts` — `applyFulfillmentResult`, saat transaksi kredit-saldo gagal (`NEEDS_REVIEW`)
3. `fulfillment.ts` — `applyFulfillmentResult`, jalur refund guest (`REFUND_PENDING`)
4. `runner.ts` — handler `recheck-fulfillment`, saat eskalasi 30x recheck tanpa hasil (`NEEDS_REVIEW`)

- [ ] **Step 1: Tambah import di `fulfillment.ts`**

Di bagian atas `web/src/lib/order/fulfillment.ts`, tambahkan setelah baris import `decideRefundDestination`:

```ts
import { formatOrderAlertMessage, sendTelegramAlert } from "@/lib/notify/telegram";
```

- [ ] **Step 2: Wire alert di titik 1 (`dispatchFulfillment`, `no_provider`/`price_increased`)**

Cari blok ini di `dispatchFulfillment` (sekitar baris 26-33):

```ts
  const decision = selectFulfillmentSku({ sellingPrice: order.sellingPrice }, item.providerSkus);
  if (!decision.ok) {
    await db.order.update({ where: { id: order.id }, data: { status: "NEEDS_REVIEW" } });
    await db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: "PROCESSING", toStatus: "NEEDS_REVIEW", note: decision.reason },
    });
    return;
  }
```

Ganti jadi:

```ts
  const decision = selectFulfillmentSku({ sellingPrice: order.sellingPrice }, item.providerSkus);
  if (!decision.ok) {
    const note = decision.reason === "no_provider" ? "Tidak ada provider SKU tersedia" : "Harga modal naik di atas harga jual";
    await db.order.update({ where: { id: order.id }, data: { status: "NEEDS_REVIEW" } });
    await db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: "PROCESSING", toStatus: "NEEDS_REVIEW", note },
    });
    await sendTelegramAlert(formatOrderAlertMessage({ orderNumber: order.orderNumber, status: "NEEDS_REVIEW", reason: note }));
    return;
  }
```

- [ ] **Step 3: Wire alert di titik 2 (`applyFulfillmentResult`, refund-tx-crash)**

Cari blok catch di `applyFulfillmentResult` (sekitar baris 129-141):

```ts
      } catch (e) {
        console.error("applyFulfillmentResult: auto-refund ke saldo gagal, eskalasi ke NEEDS_REVIEW", {
          orderId: order.id, error: e,
        });
        await db.order.update({ where: { id: order.id }, data: { status: "NEEDS_REVIEW" } });
        await db.orderStatusHistory.create({
          data: {
            orderId: order.id,
            toStatus: "NEEDS_REVIEW",
            note: `Auto-refund gagal: ${e instanceof Error ? e.message : String(e)}`,
          },
        });
      }
```

Ganti jadi:

```ts
      } catch (e) {
        const note = `Auto-refund gagal: ${e instanceof Error ? e.message : String(e)}`;
        console.error("applyFulfillmentResult: auto-refund ke saldo gagal, eskalasi ke NEEDS_REVIEW", {
          orderId: order.id, error: e,
        });
        await db.order.update({ where: { id: order.id }, data: { status: "NEEDS_REVIEW" } });
        await db.orderStatusHistory.create({
          data: { orderId: order.id, toStatus: "NEEDS_REVIEW", note },
        });
        await sendTelegramAlert(formatOrderAlertMessage({ orderNumber: order.orderNumber, status: "NEEDS_REVIEW", reason: note }));
      }
```

- [ ] **Step 4: Wire alert di titik 3 (`applyFulfillmentResult`, refund guest → `REFUND_PENDING`)**

Cari blok ini (sekitar baris 142-148):

```ts
    } else {
      // Guest — antrean manual admin (Fase 7), tidak berubah dari Fase 3
      await db.order.update({ where: { id: order.id }, data: { status: "REFUND_PENDING" } });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, toStatus: "REFUND_PENDING", note: result.message },
      });
    }
```

Ganti jadi:

```ts
    } else {
      // Guest — antrean manual admin (Fase 7a: halaman /admin/orders + notifikasi Telegram)
      await db.order.update({ where: { id: order.id }, data: { status: "REFUND_PENDING" } });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, toStatus: "REFUND_PENDING", note: result.message },
      });
      await sendTelegramAlert(
        formatOrderAlertMessage({ orderNumber: order.orderNumber, status: "REFUND_PENDING", reason: result.message }),
      );
    }
```

- [ ] **Step 5: Wire alert di titik 4 (`runner.ts`, eskalasi recheck 30x)**

Tambahkan import di bagian atas `web/src/lib/jobs/runner.ts`, setelah import `buildCustomerNo`:

```ts
import { formatOrderAlertMessage, sendTelegramAlert } from "@/lib/notify/telegram";
```

Cari blok ini di handler `recheck-fulfillment` (sekitar baris 122-128):

```ts
    if (shouldEscalateRecheck(attempt, result.status)) {
      await db.order.update({ where: { id: order.id }, data: { status: "NEEDS_REVIEW" } });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, toStatus: "NEEDS_REVIEW", note: "Eskalasi: 30x recheck tanpa hasil final" },
      });
      return "escalated";
    }
```

Ganti jadi:

```ts
    if (shouldEscalateRecheck(attempt, result.status)) {
      const note = "Eskalasi: 30x recheck tanpa hasil final";
      await db.order.update({ where: { id: order.id }, data: { status: "NEEDS_REVIEW" } });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, toStatus: "NEEDS_REVIEW", note },
      });
      await sendTelegramAlert(formatOrderAlertMessage({ orderNumber: order.orderNumber, status: "NEEDS_REVIEW", reason: note }));
      return "escalated";
    }
```

- [ ] **Step 6: Jalankan test suite (regresi) + type-check**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: Semua PASS (termasuk `jobs-runner.test.ts`, `jobs-order-handlers.test.ts` yang sudah ada — task ini tidak mengubah fungsi pure `computeBackoff`/`decideAfterFailure`/`shouldEscalateRecheck`), `tsc` bersih.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/order/fulfillment.ts web/src/lib/jobs/runner.ts
git commit -m "feat(fase7a): kirim notifikasi Telegram saat order jatuh ke NEEDS_REVIEW/REFUND_PENDING"
```

---

### Task 4: Retry orchestration — `retryOrderFulfillment` + `retryOrderRefund`

**Files:**
- Modify: `web/src/lib/order/fulfillment.ts`

**Interfaces:**
- Consumes: `decideFulfillmentRetry` (Task 1), `getAdapter` dari `@/lib/providers/registry` (sudah ada), `buildCustomerNo` dari `@/lib/order/customer-no` (sudah ada).
- Produces: `retryOrderFulfillment(orderId: string): Promise<{ ok: true } | { ok: false; error: string }>`, `retryOrderRefund(orderId: string): Promise<{ ok: true } | { ok: false; error: string }>` — dipakai Task 5.

Tidak ada test otomatis baru (kode orkestrasi DB, lihat Global Constraints) — diverifikasi manual di Task 8.

- [ ] **Step 1: Tambah import di `fulfillment.ts`**

Tambahkan di bagian atas file, setelah import yang sudah ada:

```ts
import { Prisma } from "@prisma/client";
import { decideFulfillmentRetry } from "@/lib/order/retry-decision";
```

- [ ] **Step 2: Ekstrak logic "pilih SKU + kirim" jadi fungsi `selectAndSend` yang reusable**

Ganti isi `dispatchFulfillment` (dari baris `const decision = selectFulfillmentSku(...)` sampai akhir fungsi, yaitu seluruh isi setelah `orderStatusHistory.create` untuk `PAID→PROCESSING`) — pindahkan ke fungsi baru `selectAndSend`, lalu panggil dari `dispatchFulfillment`. Hasil akhir `dispatchFulfillment` + fungsi baru:

```ts
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

  await selectAndSend(order, item, 1);
}

type OrderForFulfillment = { id: string; orderNumber: string; sellingPrice: bigint; target: unknown };
type ItemForFulfillment = {
  providerSkus: { provider: import("@prisma/client").ProviderKey; providerSkuCode: string; costPrice: bigint; status: import("@prisma/client").ProviderSkuStatus }[];
  product: { inputFields: unknown };
};

async function selectAndSend(order: OrderForFulfillment, item: ItemForFulfillment, attemptNo: number): Promise<void> {
  const decision = selectFulfillmentSku({ sellingPrice: order.sellingPrice }, item.providerSkus);
  if (!decision.ok) {
    const note = decision.reason === "no_provider" ? "Tidak ada provider SKU tersedia" : "Harga modal naik di atas harga jual";
    await db.order.update({ where: { id: order.id }, data: { status: "NEEDS_REVIEW" } });
    await db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: "PROCESSING", toStatus: "NEEDS_REVIEW", note },
    });
    await sendTelegramAlert(formatOrderAlertMessage({ orderNumber: order.orderNumber, status: "NEEDS_REVIEW", reason: note }));
    return;
  }

  const ourRefId = generateRefId("FUL", new Date());
  const fulfillment = await db.orderFulfillment.create({
    data: {
      orderId: order.id,
      attemptNo,
      provider: decision.sku.provider,
      providerSkuCode: decision.sku.providerSkuCode,
      costPrice: decision.sku.costPrice,
      ourRefId,
      status: "SENT",
    },
  });

  const target = buildCustomerNo(item.product.inputFields as { name: string }[], order.target as Record<string, string>);

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
    console.error("selectAndSend: adapter.createTransaction gagal, mengandalkan job recheck-fulfillment", {
      orderId: order.id, fulfillmentId: fulfillment.id, error: e,
    });
    // JANGAN throw - job recheck-fulfillment yang sudah dijadwalkan akan coba checkStatus nanti.
    // Fulfillment row tetap berstatus SENT, itu status valid untuk recheck job mengambil alih.
  }
}
```

Pastikan `import { generateRefId } from "@/lib/order/order-number";` dan `import { getAdapter } from "@/lib/providers/registry";` (sudah ada di file dari sebelumnya) tetap ada — dipakai `selectAndSend`.

- [ ] **Step 3: Tambah `retryOrderFulfillment` (dipanggil admin, menangani 2 penyebab NEEDS_REVIEW via `decideFulfillmentRetry`)**

Tambahkan fungsi ini di akhir file `fulfillment.ts`:

```ts
export async function retryOrderFulfillment(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const claimed = await db.order.updateMany({
    where: { id: orderId, status: "NEEDS_REVIEW" },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) return { ok: false, error: "Order tidak dalam status yang bisa di-retry." };

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  await db.orderStatusHistory.create({
    data: { orderId, fromStatus: "NEEDS_REVIEW", toStatus: "PROCESSING", note: "Retry manual oleh admin" },
  });

  const fulfillments = await db.orderFulfillment.findMany({
    where: { orderId },
    orderBy: { attemptNo: "desc" },
    select: { id: true, attemptNo: true, status: true },
  });
  const decision = decideFulfillmentRetry(fulfillments);

  if (decision.action === "not_eligible") {
    await db.order.update({ where: { id: orderId }, data: { status: "NEEDS_REVIEW" } });
    await db.orderStatusHistory.create({
      data: { orderId, fromStatus: "PROCESSING", toStatus: "NEEDS_REVIEW", note: decision.reason },
    });
    return { ok: false, error: decision.reason };
  }

  const item = await db.productItem.findUniqueOrThrow({
    where: { id: order.productItemId! },
    include: { providerSkus: true, product: true },
  });

  if (decision.action === "recheck_status") {
    const fulfillment = await db.orderFulfillment.findUniqueOrThrow({ where: { id: decision.fulfillmentId } });
    const target = buildCustomerNo(item.product.inputFields as { name: string }[], order.target as Record<string, string>);
    try {
      const adapter = await getAdapter(fulfillment.provider);
      const result = await adapter.checkStatus({ skuCode: fulfillment.providerSkuCode, target, refId: fulfillment.ourRefId });
      await applyFulfillmentResult(fulfillment.id, result);
      if (result.status === "pending") {
        await db.job.create({
          data: { type: "recheck-fulfillment", payload: { fulfillmentId: fulfillment.id, attempt: 1 }, runAt: new Date(Date.now() + 60_000) },
        });
      }
    } catch (e) {
      console.error("retryOrderFulfillment: checkStatus gagal, menjadwalkan recheck job", { orderId, error: e });
      // JANGAN biarkan order diam tanpa jaring pengaman - jadwalkan recheck job
      // seperti dispatchFulfillment/selectAndSend melakukannya untuk attempt baru.
      await db.job.create({
        data: { type: "recheck-fulfillment", payload: { fulfillmentId: fulfillment.id, attempt: 1 }, runAt: new Date(Date.now() + 60_000) },
      });
    }
    return { ok: true };
  }

  // decision.action === "send_fresh"
  await selectAndSend(order, item, decision.nextAttemptNo);
  return { ok: true };
}

export async function retryOrderRefund(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "NEEDS_REVIEW" || !order.userId) {
    return { ok: false, error: "Order ini bukan kasus refund-ke-saldo yang gagal." };
  }

  try {
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
      data: { orderId: order.id, toStatus: "REFUNDED", note: "Refund ke saldo diulang manual oleh admin" },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Refund untuk order ini sudah pernah berhasil sebelumnya." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Gagal mengulang refund." };
  }
}
```

- [ ] **Step 4: Jalankan test suite (regresi) + type-check**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: Semua PASS (refactor `selectAndSend` tidak mengubah perilaku `dispatchFulfillment` — tidak ada test otomatis yang menyentuh fungsi ini langsung, tapi pastikan tidak ada regresi tipe/compile), `tsc` bersih.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/order/fulfillment.ts
git commit -m "feat(fase7a): retryOrderFulfillment + retryOrderRefund untuk aksi admin"
```

---

### Task 5: Server actions admin orders

**Files:**
- Create: `web/src/app/actions/orders.ts`
- Create: `web/src/app/admin/orders/action-utils.tsx`

**Interfaces:**
- Consumes: `retryOrderFulfillment`, `retryOrderRefund` (Task 4), `auth` dari `@/lib/auth`, `db` dari `@/lib/db`.
- Produces: `ActionResult = { ok?: string; error?: string }`, `retryFulfillmentAction`, `retryRefundAction`, `markCompletedManualAction`, `markRefundedAction` (semua `(formData: FormData) => Promise<ActionResult>`) — dipakai Task 7. `withPrevState`, `ActionMessage`, `INITIAL_STATE` dari `action-utils.tsx` — dipakai Task 7.

Tidak ada test otomatis baru (server action, orkestrasi DB — lihat Global Constraints).

- [ ] **Step 1: Buat `web/src/app/actions/orders.ts`**

```ts
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { retryOrderFulfillment, retryOrderRefund } from "@/lib/order/fulfillment";

export interface ActionResult {
  ok?: string;
  error?: string;
}

// Duplikasi requireAdmin/logAdmin dari catalog.ts/providers.ts sengaja
// dipertahankan (bukan diimpor) - file "use server" di Next.js 16 hanya
// boleh mengekspor async function, jadi helper non-async tidak bisa dipakai
// lintas file "use server". Pola sama persis di catalog.ts:21-27, providers.ts:27-33.
async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) return { error: "Tidak diizinkan" };
  return { adminId: session.user.id };
}

async function logAdmin(adminId: string, action: string, targetId: string, detail?: object) {
  await db.adminActionLog.create({
    data: { adminId, action, targetType: "order", targetId, detail },
  });
}

export async function retryFulfillmentAction(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const orderId = formData.get("orderId");
  const orderNumber = formData.get("orderNumber");
  if (typeof orderId !== "string" || !orderId || typeof orderNumber !== "string" || !orderNumber) {
    return { error: "Order tidak ditemukan." };
  }

  const result = await retryOrderFulfillment(orderId);
  if (!result.ok) return { error: result.error };

  await logAdmin(admin.adminId, "order.retry_fulfillment", orderId);
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderNumber}`);
  return { ok: "Percobaan fulfillment ulang dikirim." };
}

export async function retryRefundAction(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const orderId = formData.get("orderId");
  const orderNumber = formData.get("orderNumber");
  if (typeof orderId !== "string" || !orderId || typeof orderNumber !== "string" || !orderNumber) {
    return { error: "Order tidak ditemukan." };
  }

  const result = await retryOrderRefund(orderId);
  if (!result.ok) return { error: result.error };

  await logAdmin(admin.adminId, "order.retry_refund", orderId);
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderNumber}`);
  return { ok: "Refund ke saldo berhasil diulang." };
}

export async function markCompletedManualAction(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const orderId = formData.get("orderId");
  const orderNumber = formData.get("orderNumber");
  const sn = formData.get("sn");
  if (typeof orderId !== "string" || !orderId || typeof orderNumber !== "string" || !orderNumber) {
    return { error: "Order tidak ditemukan." };
  }
  if (typeof sn !== "string" || sn.trim().length === 0) {
    return { error: "SN/kode voucher wajib diisi." };
  }

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || (order.status !== "NEEDS_REVIEW" && order.status !== "PROCESSING")) {
    return { error: "Order tidak dalam status yang bisa ditandai selesai manual." };
  }

  await db.order.update({ where: { id: orderId }, data: { status: "COMPLETED", completedAt: new Date() } });
  await db.orderStatusHistory.create({
    data: { orderId, toStatus: "COMPLETED", note: `Ditandai selesai manual oleh admin. SN: ${sn.trim()}` },
  });
  await logAdmin(admin.adminId, "order.mark_completed_manual", orderId, { sn: sn.trim() });
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderNumber}`);
  return { ok: "Order ditandai selesai." };
}

export async function markRefundedAction(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const orderId = formData.get("orderId");
  const orderNumber = formData.get("orderNumber");
  const note = formData.get("note");
  if (typeof orderId !== "string" || !orderId || typeof orderNumber !== "string" || !orderNumber) {
    return { error: "Order tidak ditemukan." };
  }
  if (typeof note !== "string" || note.trim().length === 0) {
    return { error: "Catatan (nomor referensi transfer) wajib diisi." };
  }

  const claimed = await db.order.updateMany({
    where: { id: orderId, status: "REFUND_PENDING" },
    data: { status: "REFUNDED" },
  });
  if (claimed.count === 0) return { error: "Order tidak dalam status Refund Pending." };

  await db.orderStatusHistory.create({
    data: { orderId, toStatus: "REFUNDED", note: `Direfund manual oleh admin: ${note.trim()}` },
  });
  await logAdmin(admin.adminId, "order.mark_refunded", orderId, { note: note.trim() });
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderNumber}`);
  return { ok: "Order ditandai sudah direfund." };
}
```

- [ ] **Step 2: Buat `web/src/app/admin/orders/action-utils.tsx`**

```tsx
"use client";
import type { ActionResult } from "@/app/actions/orders";

export type ServerAction = (formData: FormData) => Promise<ActionResult>;
export const INITIAL_STATE: ActionResult = {};

export function withPrevState(action: ServerAction) {
  return (_prev: ActionResult, formData: FormData) => action(formData);
}

export function ActionMessage({ state }: { state: ActionResult }) {
  if (!state.ok && !state.error) return null;
  return (
    <p aria-live="polite" className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
      {state.error ?? state.ok}
    </p>
  );
}
```

- [ ] **Step 3: Jalankan test suite (regresi) + type-check**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: Semua PASS, `tsc` bersih.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/actions/orders.ts web/src/app/admin/orders/action-utils.tsx
git commit -m "feat(fase7a): server actions admin orders (retry fulfillment/refund, tandai manual/refund)"
```

---

### Task 6: Halaman daftar order (`/admin/orders`)

**Files:**
- Create: `web/src/app/admin/orders/page.tsx`

**Interfaces:**
- Consumes: `ORDER_STATUS_LABEL` dari `@/lib/order/status-labels` (sudah ada).
- Produces: tidak ada export baru — halaman baru yang bisa diakses browser (`/admin/orders`).

Tidak ada test otomatis baru (halaman server component, orkestrasi DB).

- [ ] **Step 1: Buat `web/src/app/admin/orders/page.tsx`**

```tsx
import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABEL } from "@/lib/order/status-labels";
import type { OrderStatus } from "@prisma/client";

const TABS = [
  { key: "all", label: "Semua", statuses: null },
  { key: "needs_review", label: "Butuh Perhatian", statuses: ["NEEDS_REVIEW"] as OrderStatus[] },
  { key: "refund_pending", label: "Refund Pending", statuses: ["REFUND_PENDING"] as OrderStatus[] },
] as const;

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(amount));
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { tab: rawTab, q } = await searchParams;
  const activeTab = TABS.find((t) => t.key === rawTab) ?? TABS[0];

  const where = {
    ...(activeTab.statuses ? { status: { in: activeTab.statuses } } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q } },
            { buyerEmail: { contains: q } },
            { buyerPhone: { contains: q } },
          ],
        }
      : {}),
  };

  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Orders</h1>
        <p className="text-sm text-muted-foreground">Daftar order, filter status, dan pencarian.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/admin/orders?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded px-3 py-1.5 text-sm ${activeTab.key === t.key ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <form action="/admin/orders" className="flex gap-2">
          <input type="hidden" name="tab" value={activeTab.key} />
          <Input name="q" defaultValue={q ?? ""} placeholder="Cari nomor order / email / HP" className="w-64" />
          <Button type="submit" variant="outline">Cari</Button>
        </form>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nomor Order</TableHead>
              <TableHead>Produk</TableHead>
              <TableHead>Pembeli</TableHead>
              <TableHead className="tabular-nums">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Tidak ada order.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link href={`/admin/orders/${order.orderNumber}`} className="font-medium hover:underline">
                      {order.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal">{order.productName} · {order.itemName}</TableCell>
                  <TableCell>{order.buyerEmail ?? order.buyerPhone ?? "-"}</TableCell>
                  <TableCell className="tabular-nums">{formatRupiah(order.total)}</TableCell>
                  <TableCell>
                    <Badge variant="muted">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Jalankan test suite (regresi) + type-check**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: Semua PASS, `tsc` bersih.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/admin/orders/page.tsx
git commit -m "feat(fase7a): halaman daftar order admin dengan filter tab + pencarian"
```

---

### Task 7: Halaman detail order + 4 aksi admin (`/admin/orders/[orderNumber]`)

**Files:**
- Create: `web/src/app/admin/orders/[orderNumber]/page.tsx`
- Create: `web/src/app/admin/orders/[orderNumber]/order-actions.tsx`

**Interfaces:**
- Consumes: `retryFulfillmentAction`, `retryRefundAction`, `markCompletedManualAction`, `markRefundedAction`, `ActionResult`, `withPrevState`, `ActionMessage`, `INITIAL_STATE` (Task 5), `ORDER_STATUS_LABEL` (sudah ada).
- Produces: tidak ada export baru — halaman baru yang bisa diakses browser (`/admin/orders/[orderNumber]`).

Tidak ada test otomatis baru (halaman + client component form, orkestrasi DB).

- [ ] **Step 1: Buat `web/src/app/admin/orders/[orderNumber]/order-actions.tsx`**

Empat tombol aksi kontekstual. Sesuai Global Constraints, tidak ada komponen Dialog di codebase — konfirmasi pakai `window.confirm(...)`.

```tsx
"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  retryFulfillmentAction, retryRefundAction, markCompletedManualAction, markRefundedAction,
} from "@/app/actions/orders";
import { ActionMessage, INITIAL_STATE, withPrevState } from "./action-utils";

function RetryFulfillmentForm({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [state, formAction, pending] = useActionState(withPrevState(retryFulfillmentAction), INITIAL_STATE);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Coba kirim ulang fulfillment order ini?")) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <Button type="submit" disabled={pending}>{pending ? "Memproses..." : "Coba Lagi"}</Button>
      <ActionMessage state={state} />
    </form>
  );
}

function RetryRefundForm({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [state, formAction, pending] = useActionState(withPrevState(retryRefundAction), INITIAL_STATE);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Coba ulang kredit refund ke saldo member?")) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <Button type="submit" disabled={pending} variant="outline">{pending ? "Memproses..." : "Coba Refund Ulang"}</Button>
      <ActionMessage state={state} />
    </form>
  );
}

function MarkCompletedManualForm({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [state, formAction, pending] = useActionState(withPrevState(markCompletedManualAction), INITIAL_STATE);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Tandai order ini selesai manual? Pastikan barang/voucher sudah benar-benar terkirim.")) {
          e.preventDefault();
        }
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <Label htmlFor="sn">SN / kode voucher</Label>
      <Textarea id="sn" name="sn" rows={2} placeholder="Isi SN/kode voucher yang diberikan ke pembeli" required />
      <Button type="submit" disabled={pending} variant="secondary">{pending ? "Memproses..." : "Tandai Selesai Manual"}</Button>
      <ActionMessage state={state} />
    </form>
  );
}

function MarkRefundedForm({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [state, formAction, pending] = useActionState(withPrevState(markRefundedAction), INITIAL_STATE);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Tandai order ini sudah direfund? Pastikan transfer sudah benar-benar dilakukan.")) {
          e.preventDefault();
        }
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <Label htmlFor="note">Catatan (nomor referensi transfer)</Label>
      <Textarea id="note" name="note" rows={2} placeholder="Mis. transfer BCA 29/07 12:34, ref 123456" required />
      <Button type="submit" disabled={pending} variant="secondary">{pending ? "Memproses..." : "Tandai Sudah Direfund"}</Button>
      <ActionMessage state={state} />
    </form>
  );
}

export function OrderActions({
  orderId, orderNumber, status, canRetryRefund,
}: {
  orderId: string;
  orderNumber: string;
  status: string;
  canRetryRefund: boolean;
}) {
  if (status === "NEEDS_REVIEW") {
    return (
      <div className="flex flex-col gap-4 rounded-xl ring-1 ring-foreground/10 p-4">
        <h2 className="text-sm font-semibold">Aksi</h2>
        {canRetryRefund ? (
          <RetryRefundForm orderId={orderId} orderNumber={orderNumber} />
        ) : (
          <RetryFulfillmentForm orderId={orderId} orderNumber={orderNumber} />
        )}
        <MarkCompletedManualForm orderId={orderId} orderNumber={orderNumber} />
      </div>
    );
  }

  if (status === "REFUND_PENDING") {
    return (
      <div className="flex flex-col gap-4 rounded-xl ring-1 ring-foreground/10 p-4">
        <h2 className="text-sm font-semibold">Aksi</h2>
        <MarkRefundedForm orderId={orderId} orderNumber={orderNumber} />
      </div>
    );
  }

  if (status === "PROCESSING") {
    return (
      <div className="flex flex-col gap-4 rounded-xl ring-1 ring-foreground/10 p-4">
        <h2 className="text-sm font-semibold">Aksi</h2>
        <MarkCompletedManualForm orderId={orderId} orderNumber={orderNumber} />
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Buat `web/src/app/admin/orders/[orderNumber]/page.tsx`**

`canRetryRefund` benar kalau order `userId` ada DAN percobaan fulfillment terakhir berstatus `FAILED` — kondisi persis yang membedakan penyebab (b) dari (a)/(c) di §3 spec.

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABEL } from "@/lib/order/status-labels";
import { OrderActions } from "./order-actions";

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(amount));
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: {
      payment: true,
      fulfillments: { orderBy: { attemptNo: "desc" } },
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();

  const latestFulfillment = order.fulfillments[0];
  const canRetryRefund = Boolean(order.userId) && latestFulfillment?.status === "FAILED";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/orders" className="text-sm text-primary hover:underline">← Orders</Link>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{order.orderNumber}</h1>
          <Badge variant="muted">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 flex flex-col gap-4">
          <div className="rounded-xl ring-1 ring-foreground/10 p-4">
            <h2 className="text-sm font-semibold mb-2">Info Order</h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Produk</dt>
              <dd>{order.productName} · {order.itemName}</dd>
              <dt className="text-muted-foreground">Pembeli</dt>
              <dd>{order.buyerEmail ?? "-"} / {order.buyerPhone ?? "-"}</dd>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="tabular-nums">{formatRupiah(order.total)}</dd>
              <dt className="text-muted-foreground">Metode Bayar</dt>
              <dd>{order.paidVia ?? "-"}</dd>
              <dt className="text-muted-foreground">Target</dt>
              <dd>{JSON.stringify(order.target)}</dd>
            </dl>
          </div>

          <div className="rounded-xl ring-1 ring-foreground/10 p-4">
            <h2 className="text-sm font-semibold mb-2">Percobaan Fulfillment</h2>
            {order.fulfillments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada percobaan.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {order.fulfillments.map((f) => (
                  <li key={f.id} className="rounded border p-2">
                    <p>Attempt {f.attemptNo} · {f.provider} · <Badge variant="muted">{f.status}</Badge></p>
                    {f.sn && <p className="text-xs text-muted-foreground">SN: {f.sn}</p>}
                    {f.message && <p className="text-xs text-muted-foreground">{f.message}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl ring-1 ring-foreground/10 p-4">
            <h2 className="text-sm font-semibold mb-2">Riwayat Status</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {order.statusHistory.map((h) => (
                <li key={h.id} className="border-b pb-2 last:border-0">
                  <p>{h.fromStatus ?? "-"} → {h.toStatus} <span className="text-xs text-muted-foreground">({formatDateTime(h.createdAt)})</span></p>
                  {h.note && <p className="text-xs text-muted-foreground">{h.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <OrderActions
            orderId={order.id}
            orderNumber={order.orderNumber}
            status={order.status}
            canRetryRefund={canRetryRefund}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Jalankan test suite (regresi) + type-check + lint**

Run: `cd web && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: Semua PASS, `tsc` bersih, lint bersih (tidak ada warning baru di file baru ini).

- [ ] **Step 4: Commit**

```bash
git add "web/src/app/admin/orders/[orderNumber]"
git commit -m "feat(fase7a): halaman detail order admin dengan 4 aksi kontekstual"
```

---

### Task 8: Env var + Verifikasi akhir Fase 7a (end-to-end)

**Files:**
- Modify: `.env.example`

**Interfaces:** Tidak ada.

- [ ] **Step 1: Tambah env var Telegram ke `.env.example`**

Tambahkan 2 baris di akhir `.env.example` (format sama seperti baris yang sudah ada):

```
TELEGRAM_BOT_TOKEN="isi-token-bot-dari-botfather"
TELEGRAM_CHAT_ID="isi-chat-id-tujuan-notifikasi"
```

- [ ] **Step 2: Commit env var**

```bash
git add .env.example
git commit -m "docs(fase7a): tambah env var Telegram ke .env.example"
```

- [ ] **Step 3: Jalankan seluruh automated check**

Run: `cd web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: Semua PASS — test suite penuh (tidak boleh regresi Fase 1-4 manapun), type-check bersih, lint bersih, build sukses termasuk route baru (`/admin/orders`, `/admin/orders/[orderNumber]`).

- [ ] **Step 4: Setup bot Telegram asli (kalau belum ada)**

Buka Telegram, chat ke `@BotFather`, kirim `/newbot`, ikuti instruksi (nama bot, username unik berakhiran `bot`) → dapat `TELEGRAM_BOT_TOKEN`. Untuk `TELEGRAM_CHAT_ID`: kirim pesan apa saja ke bot yang baru dibuat, lalu buka `https://api.telegram.org/bot<TOKEN>/getUpdates` di browser, cari field `chat.id` di response JSON. Isi keduanya ke `web/.env` (bukan `.env.example`).

- [ ] **Step 5: Verifikasi manual — dev server + Playwright/browser asli**

Jalankan `npm run dev` di `web/`, lalu:

1. Buat kondisi order `NEEDS_REVIEW` kasus (a) — nonaktifkan sementara semua `ProviderSku` untuk satu item produk (`status = "UNAVAILABLE"` via DB), checkout item itu (bayar saldo atau QRIS+webhook settlement sintetis seperti Task 11 Fase 4) → order harus jatuh ke `NEEDS_REVIEW`, pesan Telegram harus masuk dalam hitungan detik berisi nomor order + link.
2. Buka link dari pesan Telegram (atau navigasi manual ke `/admin/orders/[orderNumber]`) → login admin dulu kalau perlu → halaman detail tampil, tombol "Coba Lagi" muncul (bukan "Coba Refund Ulang", karena belum ada fulfillment attempt).
3. Kembalikan `ProviderSku` ke `ACTIVE`, klik "Coba Lagi" → confirm dialog muncul → order lanjut fulfillment (kalau Digiflazz IP-whitelist reject seperti fase-fase sebelumnya, order akan lanjut ke jalur gagal — itu jaringan nyata, bukan bug, dokumentasikan di laporan).
4. Buat kondisi order `NEEDS_REVIEW` kasus (b) — pakai order member yang fulfillment-nya `FAILED` (lihat Task 11 Fase 4 untuk cara memicu ini via IP-whitelist Digiflazz asli), lalu di DB set `Wallet` row jadi tidak ada sementara (hapus baris `Wallet` user itu) SEBELUM memicu `applyFulfillmentResult` supaya `tx.wallet.update` gagal (`P2025`) → order `NEEDS_REVIEW`, Telegram masuk. Kembalikan `Wallet` row (buat ulang dengan balance sama seperti semula), buka halaman detail → tombol "Coba Refund Ulang" yang muncul (bukan "Coba Lagi") → klik → saldo member bertambah, order `REFUNDED`, `WalletLedger` cuma nambah 1 baris (bukan dobel).
5. Buat order guest yang fulfillment-nya gagal (pola sama Task 11 Fase 4: IP-whitelist Digiflazz) → order `REFUND_PENDING`, Telegram masuk. Buka halaman detail → isi catatan transfer → klik "Tandai Sudah Direfund" → order `REFUNDED`, `AdminActionLog` punya baris baru `action="order.mark_refunded"`.
6. Halaman `/admin/orders` — cek tab "Semua"/"Butuh Perhatian"/"Refund Pending" menyaring benar, pencarian by nomor order/email berfungsi.
7. Klik "Tandai Selesai Manual" di salah satu order `NEEDS_REVIEW`/`PROCESSING`, isi SN → order `COMPLETED`, `completedAt` terisi.

- [ ] **Step 6: Tulis laporan verifikasi**

Buat `.superpowers/sdd/2026-07-29-fase-7a-admin-orders-refund/task-8-report.md` isinya: hasil tiap langkah §5 di atas (PASS/PARSIAL/tidak teruji + alasan), daftar bagian yang disintesis (kalau kredensial Midtrans/Digiflazz asli terbatas seperti fase-fase sebelumnya). **Force-add file laporan ini** (`.superpowers/sdd/*` gitignored) supaya tidak hilang saat workspace dibersihkan — pola yang sudah diperbaiki di Task 11 Fase 4.

- [ ] **Step 7: Hentikan dev server, bersihkan data uji**

Pastikan `npm run dev` dihentikan, port 3000 tidak listening. Hapus semua `Order`/`WalletLedger`/`AdminActionLog`/`OrderFulfillment` uji dari DB dev. Kembalikan `ProviderSku`/`Wallet` yang sempat diubah sementara ke kondisi semula.

- [ ] **Step 8: Commit laporan**

```bash
git add -f .superpowers/sdd/2026-07-29-fase-7a-admin-orders-refund/task-8-report.md
git commit -m "docs(fase7a): laporan verifikasi akhir Task 8"
```

---

## Self-Review (dilakukan penulis plan, bukan subagent)

**Cakupan spec:** Semua bagian spec `docs/superpowers/specs/2026-07-29-fase-7a-admin-orders-refund-design.md` punya task yang mengimplementasikannya — §2 (scope routes) → Task 6-7, §3 (4 aksi admin) → Task 4-5-7, §4 (notifikasi Telegram) → Task 2-3, §5 (data model, tidak ada migrasi) → dikonfirmasi tidak ada Task migrasi, §6 (error handling/idempotensi) → Task 4 (`idempotencyKey`, klaim atomik), §7 (testing) → Task 1/2 TDD + Task 8 manual E2E. Tidak ada gap.

**Placeholder scan:** Tidak ada "TBD"/"implement later"/"tambah error handling generik" — semua step berisi kode lengkap atau instruksi verifikasi konkret dengan kriteria PASS/FAIL jelas.

**Konsistensi tipe:** `decideFulfillmentRetry(fulfillments: FulfillmentAttempt[]): RetryDecision` (Task 1) dipakai dengan signature persis sama di Task 4 (`retryOrderFulfillment`). `sendTelegramAlert`/`formatOrderAlertMessage` (Task 2) dipakai signature sama di Task 3 (4 titik wire) dan Task 4 (`selectAndSend`). `retryOrderFulfillment`/`retryOrderRefund` (Task 4, return `{ ok: true } | { ok: false; error: string }`) dipakai konsisten di Task 5 (`retryFulfillmentAction`/`retryRefundAction`). `ActionResult`/`withPrevState`/`ActionMessage`/`INITIAL_STATE` (Task 5) dipakai persis sama di Task 7 (`order-actions.tsx`). `ORDER_STATUS_LABEL` (sudah ada sejak Fase 4) dipakai konsisten di Task 6 dan Task 7.

**Catatan implementasi penting (bukan gap, keputusan sadar):** `NEEDS_REVIEW` punya 3 penyebab berbeda di kode yang ada (bukan 2 seperti dugaan awal spec) — ditemukan saat riset plan ini: (a) tidak ada provider SKU, (b) transaksi refund-ke-saldo crash, (c) fulfillment macet `SENT`/`PROCESSING` dieskalasi setelah 30x recheck. Daripada menambah tombol ke-5 di UI (yang bikin admin harus paham detail internal), `retryOrderFulfillment` (Task 4) menangani (a) dan (c) secara transparan lewat `decideFulfillmentRetry` di baliknya — admin cuma lihat satu tombol "Coba Lagi", sistem yang memutuskan apakah itu recheck status attempt lama atau kirim attempt baru. (b) tetap dapat tombol terpisah "Coba Refund Ulang" karena butuh input berbeda (tidak menyentuh provider). Ini konsisten dengan intent spec §3 ("dibedakan eksplisit by kondisi") walau detail percabangannya lebih rinci dari yang tertulis di spec — tidak mengubah scope atau UX yang sudah disetujui.
