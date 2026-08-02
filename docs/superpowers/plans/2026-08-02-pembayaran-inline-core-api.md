# Pembayaran Inline Core API (Bagian B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti Midtrans Snap popup dengan Core API inline — customer (guest maupun member) memilih metode pembayaran (QRIS atau VA 6 bank) langsung di halaman checkout/deposit dengan fee terlihat sebelum bayar, lalu QR/nomor VA tampil langsung di halaman invoice tanpa popup.

**Architecture:** Tabel baru `PaymentMethodConfig` (fee + aktif/nonaktif, diatur admin) jadi sumber kebenaran metode yang ditawarkan. Server Action menghitung fee + kode unik acak (server-side, tidak pernah dipercaya dari klien), menambahkannya ke `Order.total`/`Deposit.totalPaid`, lalu memanggil salah satu dari 4 fungsi charge Core API (`chargeQris` yang sudah ada, atau 3 fungsi baru untuk VA/Permata/Mandiri — ketiganya beda bentuk request/response, sudah diverifikasi ke dokumentasi resmi Midtrans, bukan diasumsikan sama). Hasil charge disimpan sebagai `PaymentActions` diskriminatif di `OrderPayment.actions`/`Deposit.rawResponse`, dan halaman invoice merender QR/VA/kode bayar langsung dari situ — tidak ada lagi popup untuk dibuka ulang.

**Tech Stack:** Next.js 16 App Router, Server Actions, Prisma/MySQL, Midtrans Core API, Zod, Vitest, `qrcode` (sudah terpasang sejak Fase 7d).

## Global Constraints

- Semua pesan error/UI yang dilihat user tetap Bahasa Indonesia.
- Uang tidak pernah dihitung dengan floating point — semua `BigInt`, fee persen disimpan sebagai basis point integer.
- Kode unik & fee **selalu dihitung ulang di server** saat order/deposit dibuat, tidak pernah dipercaya dari payload klien.
- TDD penuh untuk fungsi murni (fee, kode unik, fungsi client Midtrans baru) — pola sudah ada di `tests/midtrans-client.test.ts` (mock `fetch` via `vi.stubGlobal`, verifikasi URL+body+parsing). Orchestration code (Server Action, route handler) tidak butuh test otomatis, konsisten konvensi repo.
- `Order.total` = jumlah yang ditagih (`sellingPrice + fee + uniqueCode`) — dipertahankan artinya supaya webhook amount-check (`route.ts:38`) dan auto-refund (`fulfillment.ts:219,399`) tidak perlu diubah.
- `Deposit.amount` = jumlah yang **dikredit ke wallet**, TIDAK BOLEH berubah artinya. `Deposit.totalPaid` = jumlah yang **ditagih & diverifikasi webhook**. Kalau tertukar, customer dikreditkan fee + kode unik — kebocoran uang nyata. Ini titik paling rawan di seluruh plan (Task 1 & Task 6).
- Commit tiap task selesai (test hijau dulu kalau ada), pesan commit format `feat(payment): <ringkas>`.

Spec lengkap: `docs/superpowers/specs/2026-08-02-redesign-storefront-pembayaran-inline-design.md` (§3, §6 nomor urut B→C→A, §8 tabel risiko).

---

## Task 1: Schema — `PaymentMethodConfig` + field baru `Order`/`Deposit` + seed

**Files:**
- Modify: `web/prisma/schema.prisma`
- Modify: `web/prisma/seed.ts`
- Create: migration via `prisma migrate dev` (nama disarankan `add_payment_method_config`)

**Interfaces:**
- Produces: model `PaymentMethodConfig` (field: `id, code, label, logoUrl, feeFlat, feePercent, isActive, sortOrder, createdAt, updatedAt`), field baru `Order.fee/uniqueCode/paymentMethod`, field baru `Deposit.fee/uniqueCode/totalPaid/paymentMethod`. Dipakai oleh Task 2 (kalkulasi), Task 4 (admin CRUD), Task 5 (checkout), Task 6 (deposit).

- [ ] **Step 1: Tambah model & field di schema**

Tambahkan model baru di `web/prisma/schema.prisma` (taruh dekat model `Order`/`OrderPayment` di Blok 2):

```prisma
model PaymentMethodConfig {
  id         String   @id @default(cuid())
  code       String   @unique // "qris" | "va_bca" | "va_bni" | "va_bri" | "va_mandiri" | "va_permata" | "va_cimb"
  label      String
  logoUrl    String?
  feeFlat    BigInt   @default(0)
  feePercent Int      @default(0) // basis point: 100 = 1.00%
  isActive   Boolean  @default(true)
  sortOrder  Int      @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

Tambahkan field baru pada model `Order` (setelah `total`):

```prisma
  fee           BigInt  @default(0)
  uniqueCode    Int     @default(0)
  paymentMethod String?
```

Tambahkan field baru pada model `Deposit` (setelah `amount`):

```prisma
  fee           BigInt  @default(0)
  uniqueCode    Int     @default(0)
  totalPaid     BigInt  @default(0)
  paymentMethod String?
```

**Jangan mengubah arti `amount` pada `Deposit` maupun `total` pada `Order` di step ini** — keduanya cuma dapat kolom baru, isinya baru diisi di Task 5/6.

- [ ] **Step 2: Generate migration**

Jalankan dari `web/`:

```bash
npx prisma migrate dev --name add_payment_method_config
```

Verifikasi filenya dibuat di `web/prisma/migrations/<timestamp>_add_payment_method_config/migration.sql` dan mengandung `CREATE TABLE` untuk `PaymentMethodConfig` + `ALTER TABLE` untuk `Order` dan `Deposit`. Prisma otomatis regenerate client.

- [ ] **Step 3: Seed 7 metode pembayaran**

Di `web/prisma/seed.ts`, tambahkan array baru sejajar `CATEGORIES`/`PROVIDERS` (sebelum `async function main()`):

```ts
const PAYMENT_METHODS = [
  { code: "qris", label: "QRIS", feeFlat: 0n, feePercent: 70, sortOrder: 1 },
  { code: "va_bca", label: "BCA Virtual Account", feeFlat: 4000n, feePercent: 0, sortOrder: 2 },
  { code: "va_bni", label: "BNI Virtual Account", feeFlat: 4000n, feePercent: 0, sortOrder: 3 },
  { code: "va_bri", label: "BRI Virtual Account", feeFlat: 4000n, feePercent: 0, sortOrder: 4 },
  { code: "va_mandiri", label: "Mandiri Bill Payment", feeFlat: 4000n, feePercent: 0, sortOrder: 5 },
  { code: "va_permata", label: "Permata Virtual Account", feeFlat: 4000n, feePercent: 0, sortOrder: 6 },
  { code: "va_cimb", label: "CIMB Niaga Virtual Account", feeFlat: 4000n, feePercent: 0, sortOrder: 7 },
];
```

Di dalam `main()`, sejajar loop `CATEGORIES` yang sudah ada, tambahkan:

```ts
for (const m of PAYMENT_METHODS) {
  await db.paymentMethodConfig.upsert({
    where: { code: m.code },
    update: {}, // sengaja no-op — jangan timpa fee yang mungkin sudah diubah admin lewat panel
    create: m,
  });
}
```

`update: {}` disengaja: seed ini juga dijalankan ulang tiap deploy (pola yang sama dengan `CATEGORIES`), dan fee yang sudah diatur admin lewat `/admin/payment-methods` tidak boleh tertimpa balik ke nilai default tiap kali seed jalan.

Fee QRIS 0.7% (`feePercent: 70` basis point) meniru biaya riil gateway QRIS Indonesia; fee VA flat Rp4.000 meniru biaya riil VA Midtrans. Ini nilai awal yang masuk akal, bukan angka final — admin bisa ubah kapan saja lewat Task 4.

- [ ] **Step 4: Jalankan seed & verifikasi**

```bash
npx prisma db seed
```

Verifikasi lewat Prisma Studio atau query cepat:

```bash
node -e "
const {PrismaClient} = require('@prisma/client');
const db = new PrismaClient();
db.paymentMethodConfig.findMany().then(rows => { console.log(rows.length, 'rows'); console.log(rows.map(r=>r.code)); return db.\$disconnect(); });
"
```

Expected: `7 rows`, semua 7 kode di atas muncul.

- [ ] **Step 5: `tsc` bersih + commit**

```bash
npx tsc --noEmit
git add web/prisma/schema.prisma web/prisma/migrations web/prisma/seed.ts
git commit -m "feat(payment): tambah PaymentMethodConfig + field fee/uniqueCode/totalPaid"
```

---

## Task 2: Perhitungan fee & kode unik — pure function + test

**Files:**
- Create: `web/src/lib/payment/fee.ts`
- Test: `web/tests/payment-fee.test.ts`

**Interfaces:**
- Consumes: tidak ada (pure function, tidak menyentuh DB/network).
- Produces: `calculateFee(baseAmount: bigint, feeFlat: bigint, feePercentBp: number): bigint`, `generateUniqueCode(): number`, `calculateTotal(baseAmount: bigint, fee: bigint, uniqueCode: number): bigint`. Dipakai Task 5 (checkout), Task 6 (deposit).

- [ ] **Step 1: Tulis test gagal**

```ts
// web/tests/payment-fee.test.ts
import { describe, expect, it, vi } from "vitest";
import { calculateFee, calculateTotal, generateUniqueCode } from "@/lib/payment/fee";

describe("calculateFee", () => {
  it("fee flat saja (feePercent 0)", () => {
    expect(calculateFee(22000n, 4000n, 0)).toBe(4000n);
  });

  it("fee persen saja (basis point, feeFlat 0)", () => {
    // 22000 * 70bp (0.70%) = 154
    expect(calculateFee(22000n, 0n, 70)).toBe(154n);
  });

  it("gabungan flat + persen", () => {
    expect(calculateFee(100_000n, 1000n, 100)).toBe(2000n); // 1000 + (100000*1%=1000)
  });

  it("basis point dibulatkan ke bawah (integer division)", () => {
    // 999 * 75bp (0.75%) = 7.4925 -> 7
    expect(calculateFee(999n, 0n, 75)).toBe(7n);
  });
});

describe("generateUniqueCode", () => {
  it("selalu antara 1 dan 999 inklusif", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateUniqueCode();
      expect(code).toBeGreaterThanOrEqual(1);
      expect(code).toBeLessThanOrEqual(999);
    }
  });

  it("pakai crypto.randomInt, bukan Math.random", async () => {
    const crypto = await import("node:crypto");
    const spy = vi.spyOn(crypto, "randomInt");
    generateUniqueCode();
    expect(spy).toHaveBeenCalledWith(1, 1000);
    spy.mockRestore();
  });
});

describe("calculateTotal", () => {
  it("menjumlahkan base + fee + kode unik", () => {
    expect(calculateTotal(22000n, 4000n, 237)).toBe(26237n);
  });

  it("kode unik 0 (mis. bayar saldo) tidak menambah apa-apa", () => {
    expect(calculateTotal(22000n, 0n, 0)).toBe(22000n);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
cd web && npx vitest run tests/payment-fee.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/payment/fee'`.

- [ ] **Step 3: Implementasi**

```ts
// web/src/lib/payment/fee.ts
import { randomInt } from "node:crypto";

// Hitung fee dari flat + persen (basis point, 100 = 1.00%). Dibawa ke basis
// integer 10_000 dulu (sejalan dengan pola applyMarkup di bulk-import.ts)
// supaya pembagian akhir konsisten tanpa floating point.
export function calculateFee(baseAmount: bigint, feeFlat: bigint, feePercentBp: number): bigint {
  if (feePercentBp < 0) throw new Error("feePercentBp tidak boleh negatif");
  const percentFee = (baseAmount * BigInt(feePercentBp)) / 10_000n;
  return feeFlat + percentFee;
}

// Kode unik Rp1-999 untuk membantu pencocokan manual & menaikkan margin
// kecil. Server-only (node:crypto) - JANGAN dipanggil dari client component.
export function generateUniqueCode(): number {
  return randomInt(1, 1000); // upper bound eksklusif -> hasil 1..999
}

export function calculateTotal(baseAmount: bigint, fee: bigint, uniqueCode: number): bigint {
  return baseAmount + fee + BigInt(uniqueCode);
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

```bash
npx vitest run tests/payment-fee.test.ts
```

Expected: PASS, 6 test.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/payment/fee.ts web/tests/payment-fee.test.ts
git commit -m "feat(payment): fungsi murni hitung fee + kode unik"
```

---

## Task 3: Fungsi Midtrans client — VA (bank_transfer), Permata, Mandiri (echannel)

**Files:**
- Modify: `web/src/lib/midtrans/client.ts`
- Test: `web/tests/midtrans-client.test.ts`

**Interfaces:**
- Consumes: `MidtransCreds`, `request()`, `baseUrl()`, `authHeader()` — semua sudah ada di file ini, dipakai ulang apa adanya.
- Produces:
  - `chargeBankTransfer(input: { orderId: string; grossAmount: number; bank: "bca" | "bni" | "bri" | "cimb" }, creds?: MidtransCreds): Promise<{ transactionId: string; orderId: string; transactionStatus: string; bank: string; vaNumber: string; raw: unknown }>`
  - `chargePermataVA(input: { orderId: string; grossAmount: number }, creds?: MidtransCreds): Promise<{ transactionId: string; orderId: string; transactionStatus: string; vaNumber: string; raw: unknown }>`
  - `chargeEchannel(input: { orderId: string; grossAmount: number }, creds?: MidtransCreds): Promise<{ transactionId: string; orderId: string; transactionStatus: string; billerCode: string; billKey: string; raw: unknown }>`
  - `chargeByMethodCode(method: string, orderId: string, grossAmount: number): Promise<{ actions: PaymentActions }>` — dispatcher tunggal dipakai Task 5 (checkout) & Task 6 (deposit), supaya logika pemetaan kode metode → fungsi charge tidak ditulis dua kali.
  - `type PaymentActions = { kind: "qris"; qrString: string } | { kind: "va"; bank: string; vaNumber: string } | { kind: "echannel"; billerCode: string; billKey: string }` — dipakai Task 5, 6, 7, 8.

**Catatan penting (diverifikasi ke dokumentasi resmi Midtrans, bukan diasumsikan):** BCA/BNI/BRI/CIMB memakai bentuk seragam — `payment_type: "bank_transfer"` + `bank_transfer: { bank }`, response berisi array `va_numbers: [{ bank, va_number }]`. **Permata BEDA** — request TIDAK punya field `bank_transfer` sama sekali (cukup `payment_type` + `transaction_details`), dan response-nya `permata_va_number` sebagai string top-level, bukan array. **Mandiri BEDA LAGI** — `payment_type: "echannel"`, response `bill_key` + `biller_code`, bukan nomor VA sama sekali. Tiga fungsi terpisah, bukan satu fungsi dengan percabangan bank string, supaya tiap fungsi tetap konsisten bentuk request/response-nya sendiri.

- [ ] **Step 1: Tulis test gagal**

Tambahkan ke akhir `web/tests/midtrans-client.test.ts` (jangan hapus isi yang sudah ada):

```ts
describe("chargeBankTransfer", () => {
  it("POST /v2/charge dengan payment_type bank_transfer + bank di body", async () => {
    const fn = mockFetchOnce({
      status_code: "201", transaction_id: "trx-va1", order_id: "INV-1",
      transaction_status: "pending", gross_amount: "44000.00", currency: "IDR",
      payment_type: "bank_transfer",
      va_numbers: [{ bank: "bca", va_number: "812785002530231" }],
    });

    const result = await chargeBankTransfer({ orderId: "INV-1", grossAmount: 44000, bank: "bca" }, creds);

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://api.sandbox.midtrans.com/v2/charge");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.payment_type).toBe("bank_transfer");
    expect(body.bank_transfer).toEqual({ bank: "bca" });

    expect(result.bank).toBe("bca");
    expect(result.vaNumber).toBe("812785002530231");
    expect(result.transactionStatus).toBe("pending");
  });

  it("bekerja untuk bni/bri/cimb dengan bentuk response yang sama", async () => {
    mockFetchOnce({
      status_code: "201", transaction_id: "trx-va2", order_id: "INV-2",
      transaction_status: "pending", gross_amount: "10000.00", currency: "IDR",
      payment_type: "bank_transfer",
      va_numbers: [{ bank: "cimb", va_number: "9998887776665" }],
    });
    const result = await chargeBankTransfer({ orderId: "INV-2", grossAmount: 10000, bank: "cimb" }, creds);
    expect(result.vaNumber).toBe("9998887776665");
  });

  it("lempar error kalau va_numbers tidak ada di response", async () => {
    mockFetchOnce({
      status_code: "201", transaction_id: "trx-x", order_id: "INV-1",
      transaction_status: "pending", gross_amount: "1000.00", currency: "IDR", payment_type: "bank_transfer",
    });
    await expect(chargeBankTransfer({ orderId: "INV-1", grossAmount: 1000, bank: "bca" }, creds)).rejects.toThrow(
      /Midtrans bank_transfer: response tidak sesuai/,
    );
  });
});

describe("chargePermataVA", () => {
  it("POST /v2/charge TANPA field bank_transfer, baca permata_va_number", async () => {
    const fn = mockFetchOnce({
      status_code: "201", transaction_id: "trx-permata", order_id: "INV-3",
      transaction_status: "pending", gross_amount: "44000.00", currency: "IDR",
      payment_type: "bank_transfer",
      permata_va_number: "850003072869607",
    });

    const result = await chargePermataVA({ orderId: "INV-3", grossAmount: 44000 }, creds);

    const [, init] = fn.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.payment_type).toBe("bank_transfer");
    expect(body.bank_transfer).toBeUndefined();

    expect(result.vaNumber).toBe("850003072869607");
  });
});

describe("chargeEchannel", () => {
  it("POST /v2/charge dengan payment_type echannel, baca bill_key + biller_code", async () => {
    const fn = mockFetchOnce({
      status_code: "201", transaction_id: "trx-mandiri", order_id: "INV-4",
      transaction_status: "pending", gross_amount: "44000.00", currency: "IDR",
      payment_type: "echannel",
      bill_key: "778347787706",
      biller_code: "70012",
    });

    const result = await chargeEchannel({ orderId: "INV-4", grossAmount: 44000 }, creds);

    const [, init] = fn.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.payment_type).toBe("echannel");
    expect(body.transaction_details).toEqual({ order_id: "INV-4", gross_amount: 44000 });

    expect(result.billKey).toBe("778347787706");
    expect(result.billerCode).toBe("70012");
  });
});
```

Update baris import paling atas file test:

```ts
import { chargeQris, getTransactionStatus, chargeBankTransfer, chargePermataVA, chargeEchannel } from "@/lib/midtrans/client";
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
npx vitest run tests/midtrans-client.test.ts
```

Expected: FAIL — fungsi belum ada.

- [ ] **Step 3: Implementasi**

Tambahkan di `web/src/lib/midtrans/client.ts`, setelah fungsi `chargeQris` yang sudah ada (sebelum blok `snapBaseUrl`/`createSnapTransaction` — blok itu akan dihapus di Task 9, jangan hapus sekarang):

```ts
const bankTransferSchema = z.object({
  status_code: z.string(),
  transaction_id: z.string(),
  order_id: z.string(),
  transaction_status: z.string(),
  va_numbers: z.array(z.object({ bank: z.string(), va_number: z.string() })).optional(),
});

export interface BankTransferResult {
  transactionId: string;
  orderId: string;
  transactionStatus: string;
  bank: string;
  vaNumber: string;
  raw: unknown;
}

export async function chargeBankTransfer(
  input: { orderId: string; grossAmount: number; bank: "bca" | "bni" | "bri" | "cimb" },
  creds: MidtransCreds = {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  },
): Promise<BankTransferResult> {
  const raw = await request(`${baseUrl(creds)}/v2/charge`, creds, {
    method: "POST",
    body: JSON.stringify({
      payment_type: "bank_transfer",
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
      bank_transfer: { bank: input.bank },
    }),
  });
  const parsed = bankTransferSchema.safeParse(raw);
  const va = parsed.success ? parsed.data.va_numbers?.[0] : undefined;
  if (!parsed.success || !va) {
    throw new Error(`Midtrans bank_transfer: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
  }
  return {
    transactionId: parsed.data.transaction_id,
    orderId: parsed.data.order_id,
    transactionStatus: parsed.data.transaction_status,
    bank: va.bank,
    vaNumber: va.va_number,
    raw,
  };
}

const permataSchema = z.object({
  status_code: z.string(),
  transaction_id: z.string(),
  order_id: z.string(),
  transaction_status: z.string(),
  permata_va_number: z.string(),
});

export interface PermataResult {
  transactionId: string;
  orderId: string;
  transactionStatus: string;
  vaNumber: string;
  raw: unknown;
}

// Permata TIDAK memakai field bank_transfer sama sekali (beda dari BCA/BNI/
// BRI/CIMB) - request cuma payment_type + transaction_details, dan Midtrans
// otomatis mengartikannya sebagai permintaan Permata VA. Response-nya juga
// field top-level permata_va_number, bukan array va_numbers.
export async function chargePermataVA(
  input: { orderId: string; grossAmount: number },
  creds: MidtransCreds = {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  },
): Promise<PermataResult> {
  const raw = await request(`${baseUrl(creds)}/v2/charge`, creds, {
    method: "POST",
    body: JSON.stringify({
      payment_type: "bank_transfer",
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
    }),
  });
  const parsed = permataSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Midtrans permata: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
  }
  return {
    transactionId: parsed.data.transaction_id,
    orderId: parsed.data.order_id,
    transactionStatus: parsed.data.transaction_status,
    vaNumber: parsed.data.permata_va_number,
    raw,
  };
}

const echannelSchema = z.object({
  status_code: z.string(),
  transaction_id: z.string(),
  order_id: z.string(),
  transaction_status: z.string(),
  bill_key: z.string(),
  biller_code: z.string(),
});

export interface EchannelResult {
  transactionId: string;
  orderId: string;
  transactionStatus: string;
  billerCode: string;
  billKey: string;
  raw: unknown;
}

// Mandiri Bill Payment - payment_type BEDA ("echannel", bukan "bank_transfer")
// dan tidak menghasilkan nomor VA sama sekali, melainkan pasangan
// biller_code + bill_key yang dimasukkan customer lewat ATM/e-banking.
export async function chargeEchannel(
  input: { orderId: string; grossAmount: number },
  creds: MidtransCreds = {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  },
): Promise<EchannelResult> {
  const raw = await request(`${baseUrl(creds)}/v2/charge`, creds, {
    method: "POST",
    body: JSON.stringify({
      payment_type: "echannel",
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
      echannel: { bill_info1: "Pembayaran", bill_info2: "DannShop" },
    }),
  });
  const parsed = echannelSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Midtrans echannel: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
  }
  return {
    transactionId: parsed.data.transaction_id,
    orderId: parsed.data.order_id,
    transactionStatus: parsed.data.transaction_status,
    billerCode: parsed.data.biller_code,
    billKey: parsed.data.bill_key,
    raw,
  };
}
```

- [ ] **Step 4: Dispatcher `chargeByMethodCode` — satu tempat pemetaan kode metode ke fungsi charge**

Tambahkan di akhir `web/src/lib/midtrans/client.ts` (dipakai Task 5 & 6, supaya logika ini tidak ditulis ulang di dua Server Action berbeda):

```ts
export type PaymentActions =
  | { kind: "qris"; qrString: string }
  | { kind: "va"; bank: string; vaNumber: string }
  | { kind: "echannel"; billerCode: string; billKey: string };

export async function chargeByMethodCode(
  method: string,
  orderId: string,
  grossAmount: number,
): Promise<{ actions: PaymentActions }> {
  if (method === "qris") {
    const r = await chargeQris({ orderId, grossAmount });
    return { actions: { kind: "qris", qrString: r.qrString ?? "" } };
  }
  if (method === "va_permata") {
    const r = await chargePermataVA({ orderId, grossAmount });
    return { actions: { kind: "va", bank: "permata", vaNumber: r.vaNumber } };
  }
  if (method === "va_mandiri") {
    const r = await chargeEchannel({ orderId, grossAmount });
    return { actions: { kind: "echannel", billerCode: r.billerCode, billKey: r.billKey } };
  }
  if (method.startsWith("va_")) {
    const bank = method.slice(3) as "bca" | "bni" | "bri" | "cimb";
    const r = await chargeBankTransfer({ orderId, grossAmount, bank });
    return { actions: { kind: "va", bank: r.bank, vaNumber: r.vaNumber } };
  }
  throw new Error(`Metode pembayaran tidak dikenali: ${method}`);
}
```

`chargeQris` yang sudah ada mengembalikan `qrString: string | null` — cabang `"qris"` di atas menjaganya tetap `string` (fallback `""`) supaya bentuk `PaymentActions` konsisten non-nullable; kalau `qrString` benar-benar kosong dari Midtrans, itu kondisi yang sudah salah dari sisi Midtrans sendiri (QRIS charge tanpa QR string), bukan sesuatu yang perlu ditangani berbeda di sini.

- [ ] **Step 5: Jalankan test, pastikan lolos**

```bash
npx vitest run tests/midtrans-client.test.ts
```

Expected: PASS, semua test (lama + baru).

- [ ] **Step 6: `tsc` bersih + commit**

```bash
npx tsc --noEmit
git add web/src/lib/midtrans/client.ts web/tests/midtrans-client.test.ts
git commit -m "feat(payment): chargeBankTransfer/chargePermataVA/chargeEchannel"
```

---

## Task 4: Admin CRUD metode pembayaran

**Files:**
- Create: `web/src/app/actions/payment-methods.ts`
- Create: `web/src/app/admin/payment-methods/page.tsx`
- Create: `web/src/app/admin/payment-methods/payment-method-form.tsx`
- Modify: `web/src/app/admin/layout.tsx` (tambah link nav, cek isi file dulu untuk pola link yang sudah ada)

**Interfaces:**
- Consumes: `requireAdmin`/`logAdmin` (pola sama seperti `web/src/app/actions/catalog.ts` — didefinisikan lokal ulang, konsisten dengan alasan yang sudah dituliskan di komentar `catalog.ts:21-27`, jangan diimpor lintas file).
- Produces: server action `updatePaymentMethod(formData): Promise<ActionResult>` — TIDAK dipakai task lain, ini task admin-facing yang mandiri.

- [ ] **Step 1: Server action**

```ts
// web/src/app/actions/payment-methods.ts
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export type ActionResult = { ok?: string; error?: string };

async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) return { error: "Tidak diizinkan" };
  const fresh = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, updatedAt: true } });
  if (!fresh || fresh.role !== "ADMIN" || fresh.updatedAt.getTime() !== session.user.updatedAt) {
    return { error: "Tidak diizinkan" };
  }
  return { adminId: session.user.id };
}

const updateSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, "Label wajib diisi"),
  feeFlat: z.coerce.bigint().min(0n, "Fee flat tidak boleh negatif"),
  feePercent: z.coerce.number().int().min(0, "Fee persen tidak boleh negatif"),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.string().optional(),
});

export async function updatePaymentMethod(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    label: formData.get("label"),
    feeFlat: formData.get("feeFlat"),
    feePercent: formData.get("feePercent"),
    sortOrder: formData.get("sortOrder") ?? 0,
    isActive: formData.get("isActive"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.paymentMethodConfig.update({
    where: { id: parsed.data.id },
    data: {
      label: parsed.data.label,
      feeFlat: parsed.data.feeFlat,
      feePercent: parsed.data.feePercent,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive === "on",
    },
  });
  await db.adminActionLog.create({
    data: { adminId: admin.adminId, action: "payment_method.update", targetType: "payment_method", targetId: parsed.data.id },
  });
  revalidatePath("/admin/payment-methods");
  return { ok: "Metode pembayaran tersimpan." };
}
```

- [ ] **Step 2: Halaman list + form per baris**

```tsx
// web/src/app/admin/payment-methods/page.tsx
import { db } from "@/lib/db";
import { PaymentMethodForm } from "./payment-method-form";
import { updatePaymentMethod } from "@/app/actions/payment-methods";

export default async function PaymentMethodsPage() {
  const methods = await db.paymentMethodConfig.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Metode Pembayaran</h1>
        <p className="text-sm text-muted-foreground">
          Atur fee dan aktif/nonaktif metode pembayaran yang ditawarkan saat checkout & deposit.
        </p>
      </div>
      <div className="space-y-3">
        {methods.map((m) => (
          <PaymentMethodForm
            key={m.id}
            method={{
              id: m.id,
              code: m.code,
              label: m.label,
              feeFlat: m.feeFlat.toString(),
              feePercent: m.feePercent,
              sortOrder: m.sortOrder,
              isActive: m.isActive,
            }}
            action={updatePaymentMethod}
          />
        ))}
      </div>
    </div>
  );
}
```

```tsx
// web/src/app/admin/payment-methods/payment-method-form.tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function PaymentMethodForm({
  method,
  action,
}: {
  method: { id: string; code: string; label: string; feeFlat: string; feePercent: number; sortOrder: number; isActive: boolean };
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-5 sm:items-end">
      <input type="hidden" name="id" value={method.id} />
      <div className="col-span-2 sm:col-span-1">
        <Label className="text-xs text-muted-foreground">{method.code}</Label>
        <Input name="label" defaultValue={method.label} required />
      </div>
      <div>
        <Label htmlFor={`feeFlat-${method.id}`} className="text-xs">Fee flat (Rp)</Label>
        <Input id={`feeFlat-${method.id}`} name="feeFlat" type="number" min={0} defaultValue={method.feeFlat} />
      </div>
      <div>
        <Label htmlFor={`feePercent-${method.id}`} className="text-xs">Fee (basis point)</Label>
        <Input id={`feePercent-${method.id}`} name="feePercent" type="number" min={0} defaultValue={method.feePercent} />
      </div>
      <div>
        <Label htmlFor={`sortOrder-${method.id}`} className="text-xs">Urutan</Label>
        <Input id={`sortOrder-${method.id}`} name="sortOrder" type="number" defaultValue={method.sortOrder} />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox name="isActive" defaultChecked={method.isActive} />
        <span className="text-sm">Aktif</span>
        <Button type="submit" size="sm" disabled={pending} className="ml-auto">
          {pending ? "..." : "Simpan"}
        </Button>
      </div>
      {(state.ok || state.error) && (
        <p className={`col-span-full text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Tambah link navigasi admin**

Baca `web/src/app/admin/layout.tsx`, cari pola link nav yang sudah ada (mis. link ke "Produk & Harga", "Providers"), tambahkan satu link baru "Metode Pembayaran" → `/admin/payment-methods` mengikuti pola/styling yang persis sama dengan link yang sudah ada di file itu.

- [ ] **Step 4: `tsc` bersih, test manual**

```bash
npx tsc --noEmit
```

Login sebagai admin, buka `/admin/payment-methods`, ubah fee salah satu metode, submit, refresh halaman, verifikasi nilai baru tersimpan (bukan cuma di state React).

- [ ] **Step 5: Commit**

```bash
git add web/src/app/actions/payment-methods.ts web/src/app/admin/payment-methods web/src/app/admin/layout.tsx
git commit -m "feat(payment): halaman admin kelola fee & aktif/nonaktif metode pembayaran"
```

---

## Task 5: Checkout — pilih metode + hitung fee + charge + redirect ke invoice

**Files:**
- Modify: `web/src/lib/validation/checkout.ts`
- Modify: `web/src/app/actions/checkout.ts`
- Modify: `web/src/app/(public)/[categorySlug]/[productSlug]/page.tsx`
- Modify: `web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx`

**Interfaces:**
- Consumes: `calculateFee`/`calculateTotal`/`generateUniqueCode` (Task 2), `chargeBankTransfer`/`chargePermataVA`/`chargeEchannel` (Task 3), `chargeQris` (sudah ada).
- Produces: `CheckoutResult` baru TANPA `snapToken` (dihapus — tidak ada lagi popup, client langsung redirect ke invoice begitu `publicToken` ada).

- [ ] **Step 1: Longgarkan validasi `paymentMethod`**

Di `web/src/lib/validation/checkout.ts`, ganti:

```ts
paymentMethod: z.enum(["qris", "balance"]).default("qris"),
```

menjadi:

```ts
paymentMethod: z.string().min(1, "Metode pembayaran wajib dipilih"),
```

Metode sekarang dinamis dari tabel `PaymentMethodConfig`, bukan literal tetap — validasi keberadaan & status aktifnya dilakukan di server action (Step 3), sama seperti `activeProviders`/`selectFulfillmentSku` yang juga divalidasi di action, bukan di skema Zod murni.

- [ ] **Step 2: Halaman produk — ambil daftar metode pembayaran aktif**

Di `web/src/app/(public)/[categorySlug]/[productSlug]/page.tsx`, tambahkan fetch `paymentMethods` paralel dengan `getProductForCheckout`:

```ts
const [product, paymentMethods] = await Promise.all([
  getProductForCheckout(categorySlug, productSlug),
  db.paymentMethodConfig.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
]);
```

(Perhatikan: file ini sudah punya `if (!product) notFound();` setelah fetch — sesuaikan urutan supaya tetap mengecek `product` dulu sebelum dipakai.) Teruskan `paymentMethods` sebagai prop baru ke `<ProductDetailClient>`, di-map ke bentuk plain serializable:

```ts
paymentMethods={paymentMethods.map((m) => ({
  code: m.code, label: m.label, feeFlat: m.feeFlat.toString(), feePercent: m.feePercent,
}))}
```

- [ ] **Step 3: Server action `createCheckoutOrder`**

Di `web/src/app/actions/checkout.ts`:

1. Tambah import:
```ts
import { chargeByMethodCode } from "@/lib/midtrans/client";
import { calculateFee, calculateTotal, generateUniqueCode } from "@/lib/payment/fee";
```

2. Di `createCheckoutOrder`, SEBELUM percabangan `if (parsed.data.paymentMethod === "balance")`, tambahkan lookup metode (kecuali untuk `"balance"` yang jalurnya sendiri, tidak lewat `PaymentMethodConfig`):

```ts
if (parsed.data.paymentMethod !== "balance") {
  const method = await db.paymentMethodConfig.findUnique({ where: { code: parsed.data.paymentMethod } });
  if (!method || !method.isActive) return { error: "Metode pembayaran tidak tersedia." };
}
```

(Lookup kedua terjadi lagi di `createMidtransOrder` di bawah — boleh, harganya satu query ekstra, tapi memastikan `createMidtransOrder` tidak bergantung pada state yang sudah divalidasi di scope lain. Kalau ingin optimal, teruskan hasil lookup pertama sebagai parameter — pilihan implementer, bukan keharusan.)

3. Ubah `createMidtransOrder` — signature bertambah `input.paymentMethodCode: string`, hitung fee sebelum bikin order, charge sesuai metode:

```ts
async function createMidtransOrder(input: {
  userId: string | null;
  orderNumber: string;
  item: { id: string; sellingPrice: bigint; product: { name: string }; name: string };
  target: Record<string, string>;
  buyerEmail: string;
  now: Date;
  paymentMethodCode: string;
}): Promise<CheckoutResult> {
  const expiredAt = new Date(input.now.getTime() + EXPIRY_MINUTES * 60_000);

  const method = await db.paymentMethodConfig.findUnique({ where: { code: input.paymentMethodCode } });
  if (!method || !method.isActive) return { error: "Metode pembayaran tidak tersedia." };

  const fee = calculateFee(input.item.sellingPrice, method.feeFlat, method.feePercent);
  const uniqueCode = generateUniqueCode();
  const total = calculateTotal(input.item.sellingPrice, fee, uniqueCode);

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
    fee,
    uniqueCode,
    total,
    paymentMethod: method.code,
    expiredAt,
    payment: { create: { method: method.code, status: "PENDING", expiredAt } },
  });
  const historyPromise = db.orderStatusHistory.create({
    data: { orderId: order.id, toStatus: "PENDING_PAYMENT", note: "Checkout" },
  });

  try {
    const { actions } = await chargeByMethodCode(method.code, order.orderNumber, Number(total));
    await Promise.all([
      db.orderPayment.update({ where: { orderId: order.id }, data: { actions } }),
      historyPromise,
    ]);
  } catch (e) {
    console.error("Checkout: charge Midtrans gagal", { orderId: order.id, method: method.code, error: e });
    await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    await db.orderPayment.update({ where: { orderId: order.id }, data: { status: "FAILED" } });
    await db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "FAILED", note: "Charge Midtrans gagal" },
    });
    return { error: "Gagal membuat pembayaran, silakan coba lagi." };
  }

  try {
    await db.job.create({ data: { type: "expire-order", payload: { orderId: order.id }, runAt: expiredAt } });
  } catch (e) {
    console.error("Checkout: gagal schedule job expire-order", { orderId: order.id, error: e });
  }

  return { ok: "Order dibuat.", orderNumber: order.orderNumber, publicToken: order.publicToken };
}
```

Perhatikan **`grossAmount` yang dikirim ke Midtrans sekarang `Number(total)`** (bukan `Number(input.item.sellingPrice)` seperti sebelumnya) — ini krusial, kalau salah maka nominal yang benar-benar ditagih Midtrans tidak akan cocok dengan `order.total` dan webhook amount-check (`route.ts:38`) akan menolak SEMUA pembayaran.

4. Update `CheckoutResult` interface (hapus `snapToken`):

```ts
export interface CheckoutResult {
  ok?: string;
  error?: string;
  orderNumber?: string;
  publicToken?: string;
}
```

5. Update pemanggilan `createMidtransOrder` di `createCheckoutOrder` (sekarang harus mengirim `paymentMethodCode`):

```ts
return createMidtransOrder({
  userId, orderNumber, item, target: parsed.data.target, buyerEmail: parsed.data.buyerEmail, now,
  paymentMethodCode: parsed.data.paymentMethod,
});
```

- [ ] **Step 4: Form checkout — step pembayaran untuk guest & member, redirect tanpa popup**

Di `web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx`:

1. Terima prop baru `paymentMethods: { code: string; label: string; feeFlat: string; feePercent: number }[]`.
2. **Hapus pembungkus `{session && (...)}`** di sekeliling step pemilihan pembayaran — step ini sekarang tampil untuk semua orang. Baris opsi "Saldo" di dalamnya TETAP dikondisikan `{session && ...}` (cuma opsi itu, bukan seluruh step).
3. Ganti isi `RadioGroup` yang sekarang cuma berisi QRIS + Saldo, jadi me-render seluruh `paymentMethods` (state default `useState(paymentMethods[0]?.code ?? "")`):

```tsx
<RadioGroup name="paymentMethod" value={selectedMethod} onValueChange={setSelectedMethod}>
  {paymentMethods.map((m) => {
    const feeBp = m.feePercent;
    const fee = selectedItem
      ? (selectedItem.sellingPrice * BigInt(feeBp)) / 10_000n + BigInt(m.feeFlat)
      : 0n;
    return (
      <RadioGroupItem key={m.code} value={m.code}>
        {m.label}
        <span className="ml-auto text-xs text-muted-foreground">
          {fee > 0n ? `+ ${formatRupiah(fee)}` : "Gratis"}
        </span>
      </RadioGroupItem>
    );
  })}
  {session && (
    <RadioGroupItem value="balance" disabled={!canPayWithBalance}>
      <Wallet className="size-4" aria-hidden="true" />
      Saldo ({formatRupiah(session.walletBalance)})
    </RadioGroupItem>
  )}
</RadioGroup>
```

Hitung fee di klien hanya untuk **preview** (rumus sama seperti `calculateFee`, ditulis ulang manual di sini karena file ini `"use client"` dan tidak perlu impor modul server — fee final tetap dihitung ulang otoritatif di server action). Tambahkan state `selectedMethod` (default `paymentMethods[0]?.code`), dan `<input type="hidden" name="paymentMethod" value={session && selectedMethod === "balance" ? "balance" : selectedMethod} />`.

4. **Hapus total useEffect Snap** (blok `useEffect` yang mengecek `state.snapToken`/`window.snap.pay`) dan **hapus state `snapError`** — tidak dipakai lagi. Ganti dengan langsung redirect begitu order berhasil dibuat:

```tsx
useEffect(() => {
  if (state.publicToken) router.push(`/invoice/${state.publicToken}`);
}, [state.publicToken, router]);
```

Hapus juga `goToInvoice`/`useCallback` lama kalau isinya sudah tercakup blok ini, dan hapus baris JSX yang merender `{snapError && ...}`.

- [ ] **Step 5: `createBalanceOrder` — set `paymentMethod` eksplisit, `fee`/`uniqueCode` tetap default**

Bayar pakai saldo tidak lewat Midtrans, jadi tidak ada fee dan tidak ada yang perlu dicocokkan ke webhook — `fee`/`uniqueCode` di `Order` sudah `@default(0)` dari Task 1, tidak perlu diisi eksplisit. Yang perlu ditambah cuma `paymentMethod` (untuk konsistensi tampilan admin/riwayat, bukan dipakai logika apa pun), di `createBalanceOrder`'s `createOrderWithRetry({...})`:

```ts
    paidVia: "BALANCE",
    sellingPrice: input.item.sellingPrice,
    total: input.item.sellingPrice,
    paymentMethod: "balance",
    payment: { create: { method: "balance", status: "PENDING" } },
```

(`"balance"` di sini sengaja bukan baris di `PaymentMethodConfig` — jalur saldo tidak pernah lewat lookup tabel itu, lihat Step 2 di atas yang eksplisit skip lookup untuk `paymentMethod === "balance"`.)

- [ ] **Step 6: `tsc` bersih**

```bash
npx tsc --noEmit
```

Perbaiki semua error tipe yang muncul dari perubahan interface `CheckoutResult`/props baru sebelum lanjut.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/validation/checkout.ts web/src/app/actions/checkout.ts \
  "web/src/app/(public)/[categorySlug]/[productSlug]/page.tsx" \
  "web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx"
git commit -m "feat(payment): checkout pilih metode + fee inline, hapus Snap popup"
```

---

## Task 6: Deposit — pola sama, plus split `amount`/`totalPaid` yang wajib dijaga

**Files:**
- Modify: `web/src/lib/validation/deposit.ts`
- Modify: `web/src/app/actions/deposit.ts`
- Modify: `web/src/app/account/deposit/page.tsx` (atau file setara yang me-render `DepositForm` — cek nama file sebenarnya di direktori itu sebelum mengedit)
- Modify: `web/src/app/account/deposit/deposit-form.tsx`

**Interfaces:**
- Consumes: sama seperti Task 5 (`calculateFee`/`calculateTotal`/`generateUniqueCode`, fungsi charge Task 3).
- Produces: `DepositResult` baru TANPA `snapToken`.

**Peringatan yang wajib dibaca sebelum menulis kode task ini:** `Deposit.amount` adalah nominal yang **dikreditkan ke wallet** (dipakai `handleDepositWebhook` di `route.ts:129,135` — JANGAN DIUBAH). `Deposit.totalPaid` adalah nominal yang **ditagih ke Midtrans & diverifikasi webhook** (menggantikan `deposit.amount` di baris pembanding `route.ts:106`). Kalau fee/kode unik masuk ke `amount`, customer dikreditkan lebih dari yang seharusnya — kebocoran uang nyata di tiap transaksi. Task ini TIDAK mengubah `route.ts` (itu Task 6 lanjutan di bawah, Step 4) — baca dulu semuanya sebelum mulai coding, jangan cuma tempel field baru tanpa mengubah baris pembandingnya.

- [ ] **Step 1: Longgarkan validasi, tambah field baru ke action**

Cek `web/src/lib/validation/deposit.ts` — kemungkinan besar cuma berisi skema `amount`. Tidak perlu tambah `paymentMethod` di sini (deposit form kirim field terpisah, divalidasi manual di action seperti checkout).

- [ ] **Step 2: Server action `createDeposit`**

Tulis ulang `web/src/app/actions/deposit.ts`:

```ts
"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { depositSchema } from "@/lib/validation/deposit";
import { chargeByMethodCode } from "@/lib/midtrans/client";
import { calculateFee, calculateTotal, generateUniqueCode } from "@/lib/payment/fee";

const EXPIRY_MINUTES = 15;

export interface DepositResult {
  error?: string;
  depositId?: string;
}

export async function createDeposit(
  _prev: DepositResult | undefined,
  formData: FormData,
): Promise<DepositResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Harus login untuk isi saldo." };

  const parsed = depositSchema.safeParse({ amount: formData.get("amount") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const methodCode = String(formData.get("paymentMethod") ?? "");
  const method = await db.paymentMethodConfig.findUnique({ where: { code: methodCode } });
  if (!method || !method.isActive) return { error: "Metode pembayaran tidak tersedia." };

  const fee = calculateFee(parsed.data.amount, method.feeFlat, method.feePercent);
  const uniqueCode = generateUniqueCode();
  const totalPaid = calculateTotal(parsed.data.amount, fee, uniqueCode);

  const expiredAt = new Date(Date.now() + EXPIRY_MINUTES * 60_000);
  const deposit = await db.deposit.create({
    data: {
      userId: session.user.id,
      amount: parsed.data.amount, // TETAP nominal murni yang akan dikreditkan - JANGAN diisi totalPaid
      fee,
      uniqueCode,
      totalPaid,
      paymentMethod: method.code,
      status: "PENDING",
      expiredAt,
    },
  });

  try {
    // deposit.id (cuid) dipakai langsung sebagai Midtrans order_id - Deposit
    // tidak punya nomor publik terpisah seperti Order.orderNumber.
    const { actions } = await chargeByMethodCode(method.code, deposit.id, Number(totalPaid));
    await db.deposit.update({ where: { id: deposit.id }, data: { rawResponse: actions as object } });
  } catch (e) {
    console.error("Deposit: charge Midtrans gagal", { depositId: deposit.id, method: method.code, error: e });
    await db.deposit.update({ where: { id: deposit.id }, data: { status: "FAILED" } });
    return { error: "Gagal membuat pembayaran, silakan coba lagi." };
  }

  try {
    await db.job.create({ data: { type: "expire-deposit", payload: { depositId: deposit.id }, runAt: expiredAt } });
  } catch (e) {
    console.error("Deposit: gagal schedule job expire-deposit", { depositId: deposit.id, error: e });
  }

  return { depositId: deposit.id };
}
```

Catat: `grossAmount` yang dikirim ke Midtrans adalah `Number(totalPaid)`, BUKAN `Number(parsed.data.amount)` — sama seperti Task 5, ini yang membuat nominal settlement webhook cocok.

- [ ] **Step 3: Form deposit — pilih metode, hapus Snap, redirect ke status**

Di halaman yang me-render `<DepositForm>` (baca dulu isi `web/src/app/account/deposit/` untuk nama file page-nya), ambil `paymentMethods` sama seperti Task 5 Step 2 dan teruskan sebagai prop.

Di `web/src/app/account/deposit/deposit-form.tsx`:
1. Terima prop `paymentMethods`.
2. Tambah UI pilih metode (pola sama seperti Task 5 Step 4 — daftar radio dengan fee preview), tambah `<input type="hidden" name="paymentMethod" value={selectedMethod} />`.
3. **Hapus** `useEffect` yang cek `state.snapToken`/`window.snap.pay`, hapus state `snapError`.
4. Ganti jadi:

```tsx
useEffect(() => {
  if (state.depositId) router.push(`/account/deposit/${state.depositId}`);
}, [state.depositId, router]);
```

Hapus `goToStatus`/`useCallback` lama kalau sudah tercakup, hapus baris JSX `{snapError && ...}`.

- [ ] **Step 4: Webhook — ganti pembanding nominal deposit**

Di `web/src/app/api/webhooks/midtrans/route.ts`, fungsi `handleDepositWebhook`:

Ganti parameter fungsi dari `deposit: { id: string; amount: bigint }` menjadi `deposit: { id: string; totalPaid: bigint }`, dan baris pembanding:

```ts
// SEBELUM
if (mapped === "paid" && BigInt(Math.round(Number(confirmed.grossAmount))) !== deposit.amount) {
```

```ts
// SESUDAH
if (mapped === "paid" && BigInt(Math.round(Number(confirmed.grossAmount))) !== deposit.totalPaid) {
```

Cari pemanggil `handleDepositWebhook(...)` di file yang sama (kemungkinan di handler `POST` utama, query `db.deposit.findUnique`) dan pastikan `select`/objek yang dioper menyertakan `totalPaid`, bukan cuma `amount`. **Baris yang mengkredit wallet (`full.amount` di `tx.wallet.update`, `tx.walletLedger.create`) TIDAK disentuh sama sekali** — itu tetap harus `amount`.

- [ ] **Step 5: `tsc` bersih**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Verifikasi manual jalur kritis (belum E2E sandbox penuh, itu Task 10)**

Jalankan skrip cepat memverifikasi `amount` vs `totalPaid` tidak pernah tertukar dalam kode yang baru ditulis:

```bash
grep -n "deposit.amount\|full.amount\|deposit.totalPaid" src/app/api/webhooks/midtrans/route.ts src/app/actions/deposit.ts
```

Baca outputnya baris per baris — pastikan SETIAP kemunculan `amount` (bukan `totalPaid`) ada di konteks "mengkredit wallet", dan SETIAP kemunculan yang membandingkan ke `grossAmount` Midtrans pakai `totalPaid`. Kalau ada yang terbalik, perbaiki sebelum commit.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/validation/deposit.ts web/src/app/actions/deposit.ts \
  web/src/app/account/deposit web/src/app/api/webhooks/midtrans/route.ts
git commit -m "feat(payment): deposit pilih metode + fee inline, pisahkan amount vs totalPaid"
```

---

## Task 7: Invoice order — render QR/VA/kode bayar inline, hapus tombol popup

**Files:**
- Modify: `web/src/app/invoice/[token]/page.tsx`
- Modify: `web/src/app/invoice/[token]/invoice-status.tsx`
- Modify: `web/src/app/api/orders/[token]/status/route.ts`

**Interfaces:**
- Consumes: `OrderPayment.actions` berisi salah satu dari `{kind:"qris",qrString}` / `{kind:"va",bank,vaNumber}` / `{kind:"echannel",billerCode,billKey}` (ditulis Task 5).

**Simplifikasi yang disengaja dibanding draf awal spec §3.10:** spec menyebut tombol "Lanjutkan Pembayaran" tetap ada dan "kalau expired, buat ulang charge". Setelah dianalisis ulang: dengan QR/VA tampil inline (bukan popup), tidak ada lagi yang perlu "dibuka ulang" — info pembayaran otomatis selalu terlihat selama status `PENDING_PAYMENT`. Order berstatus `EXPIRED` sudah terminal di kode yang ada sekarang (tidak ada jalur retry untuk status apa pun sebelum perubahan ini juga) — task ini TIDAK menambah fitur retry-setelah-expired baru. Tombol tersebut dihapus total, bukan diubah fungsinya.

- [ ] **Step 1: `page.tsx` — generate QR cuma untuk kind "qris"**

```ts
// web/src/app/invoice/[token]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import type { PaymentActions } from "@/lib/midtrans/client";
import { InvoiceStatus } from "./invoice-status";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await db.order.findUnique({
    where: { publicToken: token },
    include: { payment: true, fulfillments: { orderBy: { attemptNo: "desc" }, take: 1 } },
  });
  if (!order) notFound();

  const actions = order.payment?.actions as PaymentActions | null;
  const latestFulfillment = order.fulfillments[0];
  const qrDataUri = actions?.kind === "qris" ? await QRCode.toDataURL(actions.qrString, { width: 240, margin: 1 }) : null;

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
          sellingPrice: order.sellingPrice.toString(),
          fee: order.fee.toString(),
          uniqueCode: order.uniqueCode,
          total: order.total.toString(),
          payment: actions,
          expiredAt: order.expiredAt?.toISOString() ?? null,
          sn: latestFulfillment?.status === "SUCCESS" ? latestFulfillment.sn : order.manualSn,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Status API route — bentuk JSON yang sama**

Di `web/src/app/api/orders/[token]/status/route.ts`, ganti bentuk response supaya sama dengan `initial` di atas: hapus `qrString`/`snapToken` dari JSON, tambah `sellingPrice`, `fee`, `uniqueCode`, `payment` (objek `actions` apa adanya, ganti nama variabel `actions` → `payment` di response biar konsisten nama field dengan `page.tsx`/`invoice-status.tsx`).

- [ ] **Step 3: `invoice-status.tsx` — render per `payment.kind`, hapus semua kode Snap**

Ganti interface `OrderStatusResponse`:

```ts
interface OrderStatusResponse {
  orderNumber: string;
  status: string;
  productName: string;
  itemName: string;
  sellingPrice: string;
  fee: string;
  uniqueCode: number;
  total: string;
  payment:
    | { kind: "qris"; qrString: string }
    | { kind: "va"; bank: string; vaNumber: string }
    | { kind: "echannel"; billerCode: string; billKey: string }
    | null;
  expiredAt: string | null;
  sn: string | null;
}
```

Hapus **seluruhnya**: state `snapError`, fungsi `handleContinuePayment`, dan blok JSX:
```tsx
{order.status === "PENDING_PAYMENT" && order.snapToken && !order.qrString && ( ... "Lanjutkan Pembayaran" ... )}
```

Tambahkan rincian biaya (di atas badge status atau di bawah harga total — sisipkan setelah blok `<p className="font-heading text-2xl font-bold">{...total...}</p>` yang sudah ada):

```tsx
<div className="flex flex-col gap-1 rounded-md bg-muted px-4 py-3 text-sm">
  <div className="flex justify-between"><span className="text-muted-foreground">Harga item</span><span>{formatRupiah(order.sellingPrice)}</span></div>
  <div className="flex justify-between"><span className="text-muted-foreground">Biaya admin</span><span>{formatRupiah(order.fee)}</span></div>
  <div className="flex justify-between"><span className="text-muted-foreground">Kode unik</span><span>{formatRupiah(BigInt(order.uniqueCode))}</span></div>
  <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>Total</span><span>{formatRupiah(order.total)}</span></div>
</div>
```

(Tambahkan helper `formatRupiah` kecil di file ini kalau belum ada — cek dulu, kemungkinan sudah ada inline `Intl.NumberFormat` yang dipakai berulang di file ini, jadikan satu fungsi lokal dipakai semua tempat.)

Ganti blok render QR yang sudah ada (`order.qrString && qrDataUri`) menjadi berbasis `payment.kind`, ditambah dua blok baru untuk VA dan echannel:

```tsx
{order.status === "PENDING_PAYMENT" && order.payment?.kind === "qris" && qrDataUri && (
  <div className="flex flex-col items-center gap-2">
    <p className="text-sm text-muted-foreground">Scan QRIS untuk membayar</p>
    <img alt="QRIS pembayaran" src={qrDataUri} width={240} height={240} />
  </div>
)}

{order.status === "PENDING_PAYMENT" && order.payment?.kind === "va" && (
  <div className="flex flex-col gap-2 rounded-md border p-4">
    <p className="text-sm text-muted-foreground">Transfer ke Virtual Account {order.payment.bank.toUpperCase()}</p>
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-xl font-bold tracking-wide">{order.payment.vaNumber}</span>
      <Button type="button" size="xs" variant="outline" onClick={() => navigator.clipboard.writeText(order.payment!.kind === "va" ? order.payment!.vaNumber : "")}>
        <Copy className="size-3.5" /> Salin
      </Button>
    </div>
  </div>
)}

{order.status === "PENDING_PAYMENT" && order.payment?.kind === "echannel" && (
  <div className="flex flex-col gap-2 rounded-md border p-4">
    <p className="text-sm text-muted-foreground">Bayar lewat Mandiri Bill Payment (ATM/Livin&apos;)</p>
    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Kode Perusahaan</span><span className="font-mono font-bold">{order.payment.billerCode}</span></div>
    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Kode Bayar</span><span className="font-mono font-bold">{order.payment.billKey}</span></div>
  </div>
)}
```

(Pola `order.payment!.kind === "va" ? order.payment!.vaNumber : ""` di tombol salin VA dipakai untuk menghindari TypeScript narrowing issue saat dipakai di dalam closure `onClick` — kalau editor/`tsc` masih komplain, ekstrak `order.payment.vaNumber` ke variabel lokal sebelum return JSX blok itu, lebih bersih daripada non-null assertion berulang.)

- [ ] **Step 4: `tsc` bersih + commit**

```bash
npx tsc --noEmit
git add "web/src/app/invoice/[token]/page.tsx" "web/src/app/invoice/[token]/invoice-status.tsx" \
  "web/src/app/api/orders/[token]/status/route.ts"
git commit -m "feat(payment): invoice render QRIS/VA/echannel inline, hapus tombol popup Snap"
```

---

## Task 8: Status deposit — pola sama seperti Task 7

**Files:**
- Modify: `web/src/app/account/deposit/[depositId]/page.tsx`
- Modify: `web/src/app/account/deposit/[depositId]/deposit-status.tsx`
- Modify: `web/src/app/api/deposits/[depositId]/status/route.ts`

**Interfaces:**
- Consumes: `Deposit.rawResponse` berisi bentuk `PaymentActions` yang sama seperti Task 7 (ditulis Task 6).

Task ini adalah pengulangan pola Task 7 pada 3 file setara untuk deposit, jadi ditulis sebagai satu task supaya reviewer melihat kesamaan/perbedaan pola secara langsung, bukan tersebar dua PR terpisah yang tidak berhubungan secara nyata.

- [ ] **Step 1: `page.tsx` — generate QR cuma untuk kind "qris", tambah field baru**

Ganti isi `web/src/app/account/deposit/[depositId]/page.tsx`, pola identik Task 7 Step 1 tapi dari `deposit.rawResponse` (bukan `order.payment.actions`) dan tambah `fee`/`uniqueCode`/`totalPaid` ke `initial`. Tambahkan `import type { PaymentActions } from "@/lib/midtrans/client";` (sama seperti Task 7 — jangan definisikan ulang tipe ini secara lokal, satu sumber kebenaran di `lib/midtrans/client.ts`):

```ts
const actions = deposit.rawResponse as PaymentActions | null;
const qrDataUri = actions?.kind === "qris" ? await QRCode.toDataURL(actions.qrString, { width: 240, margin: 1 }) : null;
// ...
initial={{
  depositId: deposit.id,
  status: deposit.status,
  amount: deposit.amount.toString(),
  fee: deposit.fee.toString(),
  uniqueCode: deposit.uniqueCode,
  totalPaid: deposit.totalPaid.toString(),
  payment: actions,
  expiredAt: deposit.expiredAt?.toISOString() ?? null,
}}
```

- [ ] **Step 2: Status API route**

Pola sama Task 7 Step 2, terapkan ke `web/src/app/api/deposits/[depositId]/status/route.ts` — tambah `fee`, `uniqueCode`, `totalPaid`, `payment`; hapus `qrString`/`snapToken`.

- [ ] **Step 3: `deposit-status.tsx` — render per `payment.kind`, hapus Snap, tambah rincian biaya**

Pola identik Task 7 Step 3: update `DepositStatusResponse` interface, hapus `snapError`/`handleContinuePayment`/tombol popup, tambah blok rincian biaya (sellingPrice diganti label "Nominal isi saldo" karena depositnya sendiri bukan harga barang), tambah 3 blok render (`qris`/`va`/`echannel`) identik Task 7.

- [ ] **Step 4: `tsc` bersih + commit**

```bash
npx tsc --noEmit
git add "web/src/app/account/deposit/[depositId]" "web/src/app/api/deposits/[depositId]/status/route.ts"
git commit -m "feat(payment): status deposit render QRIS/VA/echannel inline"
```

---

## Task 9: Bersih-bersih Snap

**Files:**
- Modify: `web/src/lib/midtrans/client.ts` (hapus `createSnapTransaction`, `snapBaseUrl`, `snapTransactionSchema`)
- Delete: `web/src/lib/midtrans/snap-config.ts`
- Delete: `web/src/types/midtrans-snap.d.ts`
- Modify: `web/src/app/layout.tsx`
- Modify: `web/next.config.ts`
- Modify: `web/.env.example`

Dikerjakan **setelah** Task 5-8 selesai (bukan sebelumnya) — supaya tidak ada window waktu di mana kode setengah-migrasi menyisakan referensi ke fungsi yang sudah hilang.

- [ ] **Step 1: Hapus fungsi Snap dari client Midtrans**

Di `web/src/lib/midtrans/client.ts`, hapus HANYA blok `snapBaseUrl`, `snapTransactionSchema`, `SnapTransactionResult`, `createSnapTransaction` (baris 126-158 di versi sebelum task ini — cek ulang nomor baris aktual sebelum menghapus, sudah bergeser karena Task 3 menambah kode di atasnya). **Jangan hapus** `chargeBankTransfer`, `chargePermataVA`, `chargeEchannel`, `chargeByMethodCode`, atau `type PaymentActions` — semuanya dari Task 3, masih dipakai aktif oleh Task 5-8.

Di `web/tests/midtrans-client.test.ts`, hapus `describe("createSnapTransaction", ...)` beserta importnya dari baris import teratas.

- [ ] **Step 2: Hapus file khusus Snap**

```bash
rm web/src/lib/midtrans/snap-config.ts web/src/types/midtrans-snap.d.ts
```

- [ ] **Step 3: Hapus tag `<Script>` Snap.js dari root layout**

Di `web/src/app/layout.tsx`, hapus import `Script`/`SNAP_JS_URL` dan seluruh elemen:

```tsx
<Script src={SNAP_JS_URL} data-client-key={...} strategy="afterInteractive" />
```

- [ ] **Step 4: Bersihkan CSP**

Di `web/next.config.ts`, hapus konstanta `MIDTRANS_SNAP_DOMAINS` dan semua pemakaiannya di `script-src`/`connect-src`/`frame-src` — domain Midtrans tidak lagi dibutuhkan sama sekali karena tidak ada script pihak ketiga atau iframe yang dimuat (charge sepenuhnya server-to-server).

- [ ] **Step 5: Hapus env var yang sudah tidak dipakai**

Di `web/.env.example`, hapus baris `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` dan `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION`. **Jangan hapus** `MIDTRANS_SERVER_KEY`/`MIDTRANS_IS_PRODUCTION` — keduanya masih dipakai (server-side) oleh `chargeQris`/`chargeBankTransfer`/dll.

Catat di commit message bahwa `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY`/`NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION` juga perlu dihapus dari Vercel Environment Variables (Production + Preview) secara manual — file plan ini tidak bisa melakukan itu.

- [ ] **Step 6: `tsc` + test penuh + commit**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: tidak ada error tipe (memastikan tidak ada referensi tersisa ke `window.snap`/`SNAP_JS_URL`/`createSnapTransaction`), semua test lolos.

```bash
git add -A
git commit -m "chore(payment): hapus Snap.js, script tag, CSP, dan fungsi createSnapTransaction"
```

---

## Task 10: Verifikasi E2E sandbox — QRIS, VA, kode unik, fee, webhook

**Files:** Tidak ada file kode diubah — task verifikasi murni. Kalau ditemukan bug nyata, catat di sini lalu kembali ke task yang relevan untuk memperbaikinya (jangan tambal langsung di task ini).

Memakai teknik yang sudah terdokumentasi (lihat §3.12 spec dan riwayat sesi Fase 7c/migrasi Snap): simulator sandbox Midtrans via HTTP langsung, bukan klik UI popup (tidak ada lagi popup untuk diklik).

- [ ] **Step 1: QRIS end-to-end**

1. Checkout produk apa pun dengan metode QRIS.
2. Verifikasi halaman invoice menampilkan QR image + rincian biaya (harga + fee + kode unik = total yang benar secara matematis).
3. Ambil `qrCodeUrl` dari QR (atau dari `OrderPayment.actions.qrString` langsung di DB), simulasikan bayar via `simulator.sandbox.midtrans.com/v2/qris/payment` → `/gopay` (2 langkah, decode HTML entity `exploreData`).
4. POST webhook manual ke `/api/webhooks/midtrans` pakai `signature_key` **asli** dari `getTransactionStatus` (jangan bypass).
5. Verifikasi: order `PENDING_PAYMENT → PAID`, dan **nominal yang dikonfirmasi Midtrans (`grossAmount`) sama persis dengan `order.total`** (harga + fee + kode unik) — kalau tidak sama, webhook amount-check akan menolaknya, cek log server untuk pesan `amount_mismatch`.

- [ ] **Step 2: VA (BCA) end-to-end**

1. Checkout dengan metode BCA VA.
2. Verifikasi invoice menampilkan nomor VA + tombol salin, bukan popup.
3. Simulasikan bayar: POST `va_number` ke `simulator.sandbox.midtrans.com/bca/va/inquiry` → POST field hidden ke `.../bca/va/payment`.
4. POST webhook manual (signature asli), verifikasi order `PAID`.

- [ ] **Step 3: Deposit end-to-end (titik paling kritis)**

1. Login sebagai member, deposit saldo dengan metode QRIS atau VA.
2. **Sebelum bayar**, catat di database: `deposit.amount` (harus = nominal yang dipilih di form, TANPA fee/kode unik) vs `deposit.totalPaid` (harus = amount + fee + kode unik).
3. Simulasikan bayar sesuai metode (teknik sama Step 1/2), dengan nominal settlement Midtrans **harus sama dengan `deposit.totalPaid`**, bukan `deposit.amount`.
4. POST webhook manual, verifikasi:
   - `Wallet.balance` bertambah tepat sebesar `deposit.amount` (BUKAN `totalPaid`)
   - Tepat **satu** baris `WalletLedger` baru dibuat, `amount`-nya sama dengan `deposit.amount`
   - Tidak ada duplikasi kalau webhook di-retry/dikirim ulang (idempotency existing `updateMany where status:"PENDING"` sudah menangani ini, tinggal dikonfirmasi masih berfungsi)

Kalau langkah 4 gagal (wallet bertambah lebih dari `deposit.amount`, atau `totalPaid` yang masuk ledger) — **STOP, jangan lanjut ke task berikutnya, ini persis skenario kebocoran uang yang diperingatkan di Task 6.** Perbaiki dulu di Task 6, ulangi Task 10 dari awal.

- [ ] **Step 4: Metode tanpa E2E sandbox penuh (BNI/BRI/CIMB/Permata/Mandiri)**

Simulator sandbox untuk kelima metode ini mengikuti pola URL yang sama seperti BCA (`{bank}/va/inquiry` dst.) kecuali Permata & Mandiri yang punya endpoint sendiri — cukup verifikasi **charge berhasil dibuat** (invoice menampilkan nomor VA/kode bayar yang benar dari response Midtrans, tidak error) untuk kelimanya. Tidak wajib mensimulasikan pembayaran penuh untuk semuanya — pola webhook-nya sudah terbukti method-agnostic di Step 1-3, risiko utama (bentuk request/response API per metode) sudah tervalidasi di Task 3 lewat unit test yang menguji bentuk JSON persis sesuai dokumentasi resmi.

- [ ] **Step 5: Guest checkout (bukan cuma member)**

Ulangi Step 1 sebagai **guest** (tidak login) — pastikan step "Pilih Pembayaran" muncul dengan pilihan lengkap (bukan cuma satu metode default seperti sebelum migrasi ini), dan seluruh alur sampai `PAID` berjalan sama seperti member.

- [ ] **Step 6: Catat hasil di ledger SDD**

Tulis ringkasan tiap step (PASS/FAIL + detail) ke `.superpowers/sdd/2026-08-02-pembayaran-inline-core-api/progress.md` mengikuti format laporan Task E2E fase-fase sebelumnya (lihat `PROGRESS.md` root repo untuk contoh format ringkasan akhir).
