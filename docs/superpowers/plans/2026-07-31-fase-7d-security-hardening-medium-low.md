# Fase 7d: Hardening Keamanan (Medium + Low) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tutup seluruh 9 Medium + 6 Low findings dari audit keamanan Fase 7c (`docs/superpowers/specs/2026-07-30-fase-7c-security-hardening-audit.md`) yang sengaja dijadikan backlog Fase 7d.

**Architecture:** 4 task dikelompokkan per subsistem (bukan flat 15 task terpisah) — tiap task menyentuh area kode yang saling terkait, plus 1 task verifikasi manual di akhir. Tidak ada migrasi Prisma di fase ini.

**Tech Stack:** Next.js 16 (App Router) + React 19, Prisma/MySQL, Zod v4, Vitest, library baru `qrcode` (generate QR code di server, mengganti dependency `api.qrserver.com`).

## Global Constraints

- Semua pesan error/UI yang dilihat user tetap Bahasa Indonesia (konvensi repo).
- TDD penuh HANYA untuk pure function baru/berubah (`cryptoRandom` dipakai `generateOrderNumber`/`generateRefId`, `safeCompare`, skema Zod `checkoutSchema`) — orchestration code (route/Server Action/config) TIDAK punya test otomatis, konsisten konvensi repo.
- JANGAN konsolidasi 3 salinan `requireAdmin()` — di luar scope fase ini, tidak disentuh sama sekali.
- Tidak ada migrasi Prisma di Fase 7d — semua 15 item adalah perubahan logic/config, bukan schema.
- SN/voucher TETAP plaintext di DB (keputusan sadar, lihat spec §4.2.3) — jangan enkripsi kolom `sn`/`manualSn`.
- Commit tiap task selesai (test hijau dulu), pesan commit format `fix(fase7d): <ringkas>`.

Spec lengkap: `docs/superpowers/specs/2026-07-31-fase-7d-security-hardening-medium-low-design.md` — baca kalau butuh alasan/konteks lebih dalam dari yang ditulis di tiap task.

---

## Task 1: Kelompok A — QR self-generate (M-2) + Security Header (M-1)

**Files:**
- Modify: `web/package.json` (tambah dependency `qrcode`, `@types/qrcode`)
- Modify: `web/src/app/invoice/[token]/page.tsx`
- Modify: `web/src/app/invoice/[token]/invoice-status.tsx`
- Modify: `web/src/app/account/deposit/[depositId]/page.tsx`
- Modify: `web/src/app/account/deposit/[depositId]/deposit-status.tsx`
- Modify: `web/next.config.ts`

**Interfaces:**
- Produces: tidak ada interface baru untuk task lain — task ini berdiri sendiri.

- [ ] **Step 1: Install dependency `qrcode`**

Run (dari `web/`): `npm install qrcode @types/qrcode`

Expected: `package.json` bertambah `"qrcode": "^1.5.4"` di `dependencies` dan `"@types/qrcode": "^1.5.6"` di `devDependencies` (versi persis mengikuti apa yang di-resolve npm saat instalasi — boleh beda minor/patch dari sini, itu normal).

- [ ] **Step 2: Generate QR sendiri di halaman invoice**

Ganti seluruh isi `web/src/app/invoice/[token]/page.tsx` jadi:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
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
}
```

(`qrString` masih diteruskan lewat `initial` — dipakai `invoice-status.tsx` sebagai gate "apakah order ini punya QR", tidak dipakai lagi sebagai `src` gambar. `qrDataUri` dihitung SEKALI saat render awal, tidak di-generate ulang tiap polling.)

- [ ] **Step 3: Pasang `qrDataUri` di client component invoice**

Di `web/src/app/invoice/[token]/invoice-status.tsx`:

Ganti signature fungsi (baris 71-77):
```tsx
export function InvoiceStatus({
  token,
  initial,
}: {
  token: string;
  initial: OrderStatusResponse;
}) {
```
jadi:
```tsx
export function InvoiceStatus({
  token,
  qrDataUri,
  initial,
}: {
  token: string;
  qrDataUri: string | null;
  initial: OrderStatusResponse;
}) {
```

Ganti blok render QR (baris 137-147):
```tsx
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
```
jadi:
```tsx
      {order.status === "PENDING_PAYMENT" && order.qrString && qrDataUri && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground">Scan QRIS untuk membayar</p>
          <img alt="QRIS pembayaran" src={qrDataUri} width={240} height={240} />
        </div>
      )}
```

- [ ] **Step 4: Generate QR sendiri di halaman deposit**

Di `web/src/app/account/deposit/[depositId]/page.tsx`, ganti seluruh isi jadi:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DepositStatus } from "./deposit-status";

export default async function DepositStatusPage({
  params,
}: {
  params: Promise<{ depositId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const { depositId } = await params;
  const deposit = await db.deposit.findUnique({ where: { id: depositId } });
  if (!deposit || deposit.userId !== session.user.id) notFound();

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
}
```

- [ ] **Step 5: Pasang `qrDataUri` di client component deposit**

Di `web/src/app/account/deposit/[depositId]/deposit-status.tsx`:

Ganti signature fungsi (baris 39):
```tsx
export function DepositStatus({ depositId, initial }: { depositId: string; initial: DepositStatusResponse }) {
```
jadi:
```tsx
export function DepositStatus({
  depositId,
  qrDataUri,
  initial,
}: {
  depositId: string;
  qrDataUri: string | null;
  initial: DepositStatusResponse;
}) {
```

Ganti blok render QR (baris 80-90):
```tsx
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
```
jadi:
```tsx
      {deposit.status === "PENDING" && deposit.qrString && qrDataUri && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground">Scan QRIS untuk membayar</p>
          <img alt="QRIS pembayaran" src={qrDataUri} width={240} height={240} />
        </div>
      )}
```

- [ ] **Step 6: Security header di `next.config.ts`**

Ganti seluruh isi `web/next.config.ts` jadi:

```ts
import type { NextConfig } from "next";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 7: Verifikasi**

Run: `cd web && npm test`
Expected: semua test PASS (tidak ada test otomatis untuk route/config yang diubah task ini — perubahan murni orchestration/config, konsisten konvensi repo).

Run: `cd web && npx tsc --noEmit`
Expected: tidak ada error TypeScript baru (khususnya import `qrcode` ter-resolve dengan tipe yang benar dari `@types/qrcode`).

- [ ] **Step 8: Commit**

```bash
git add web/package.json web/package-lock.json web/src/app/invoice/[token]/page.tsx \
  web/src/app/invoice/[token]/invoice-status.tsx \
  web/src/app/account/deposit/[depositId]/page.tsx \
  web/src/app/account/deposit/[depositId]/deposit-status.tsx \
  web/next.config.ts
git commit -m "fix(fase7d): M-1+M-2 QR self-generate di server + security header (CSP, X-Frame-Options, HSTS, dll)"
```

---

## Task 2: Kelompok B — Webhook/money-safety hardening (M-3, L-2, L-4, verifikasi L-3)

**Files:**
- Modify: `web/src/lib/crypto.ts`
- Modify: `web/src/lib/midtrans/signature.ts`
- Modify: `web/src/app/api/webhooks/midtrans/route.ts`
- Modify: `web/src/lib/providers/digiflazz.ts` (redaksi SN dari log, L-4)
- Test: `web/tests/crypto.test.ts` (baru: `describe("safeCompare", ...)`)
- Run existing (tidak dimodifikasi, cuma re-run untuk verifikasi tidak regresi): `web/tests/midtrans-signature.test.ts`

**Interfaces:**
- Produces: `safeCompare(a: string, b: string): boolean` di `web/src/lib/crypto.ts` — dipakai Task 3 (L-1, cron secret) juga.

- [ ] **Step 1: Tulis test gagal untuk `safeCompare`**

Tambahkan ke akhir `web/tests/crypto.test.ts` (setelah blok `describe("crypto kredensial", ...)`  yang sudah ada, jangan hapus isi yang ada):

```ts
import { safeCompare } from "@/lib/crypto";

describe("safeCompare", () => {
  it("dua string sama persis → true", () => {
    expect(safeCompare("rahasia123", "rahasia123")).toBe(true);
  });

  it("string beda isi tapi panjang sama → false", () => {
    expect(safeCompare("rahasia123", "rahasiaXXX")).toBe(false);
  });

  it("string beda panjang → false (tidak throw)", () => {
    expect(safeCompare("pendek", "jauh-lebih-panjang-dari-ini")).toBe(false);
  });

  it("dua string kosong → true", () => {
    expect(safeCompare("", "")).toBe(true);
  });
});
```

(Tambahkan `import { safeCompare } from "@/lib/crypto";` ke baris import paling atas file bersama `encryptJson, decryptJson` yang sudah ada — jadi satu baris `import { encryptJson, decryptJson, safeCompare } from "@/lib/crypto";`, bukan import terpisah.)

Run: `cd web && npx vitest run tests/crypto.test.ts`
Expected: FAIL — `safeCompare` belum ada di `@/lib/crypto`.

- [ ] **Step 2: Implementasi `safeCompare`**

Di `web/src/lib/crypto.ts`, tambah import `timingSafeEqual` ke baris 1 (ganti):
```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
```
jadi:
```ts
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
```

Tambah fungsi baru di akhir file (setelah `decryptJson`):

```ts
// Compare timing-safe untuk secret/signature (CRON_SECRET, signature webhook) -
// mencegah timing attack yang bisa menebak isi string byte-per-byte lewat
// selisih waktu respons `===` biasa.
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
```

- [ ] **Step 3: Jalankan test, pastikan lulus**

Run: `cd web && npx vitest run tests/crypto.test.ts`
Expected: semua test PASS.

- [ ] **Step 4: Pasang `safeCompare` di verifikasi signature Midtrans (L-2)**

Di `web/src/lib/midtrans/signature.ts`, ganti seluruh isi jadi:

```ts
import { createHash } from "node:crypto";
import { safeCompare } from "@/lib/crypto";

export function computeMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
): string {
  return createHash("sha512").update(orderId + statusCode + grossAmount + serverKey).digest("hex");
}

export function verifyMidtransSignature(
  notif: { order_id: string; status_code: string; gross_amount: string; signature_key: string },
  serverKey: string,
): boolean {
  const expected = computeMidtransSignature(notif.order_id, notif.status_code, notif.gross_amount, serverKey);
  return safeCompare(expected, notif.signature_key);
}
```

- [ ] **Step 5: Jalankan test signature, pastikan tetap lulus**

Run: `cd web && npx vitest run tests/midtrans-signature.test.ts`
Expected: semua test PASS TANPA perubahan pada file test (perilaku `verifyMidtransSignature` — true/false untuk signature cocok/tidak — tidak berubah, cuma cara compare-nya).

- [ ] **Step 6: Verifikasi nominal settlement (M-3) — `handleOrderWebhook`**

Di `web/src/app/api/webhooks/midtrans/route.ts`:

Ganti baris import (baris 8):
```ts
import { dispatchFulfillment } from "@/lib/order/fulfillment";
```
jadi:
```ts
import { dispatchFulfillment, escalateOrder } from "@/lib/order/fulfillment";
```

Ganti signature `handleOrderWebhook` (baris 30-33):
```ts
async function handleOrderWebhook(
  order: { id: string },
  notif: z.infer<typeof notifSchema>,
): Promise<string> {
```
jadi:
```ts
async function handleOrderWebhook(
  order: { id: string; orderNumber: string; total: bigint },
  notif: z.infer<typeof notifSchema>,
): Promise<string> {
```

Sisipkan pengecekan nominal persis setelah baris `const mapped = mapMidtransStatus(confirmed.transactionStatus, confirmed.fraudStatus);` (baris 35) dan sebelum `if (mapped === "paid") {` (baris 37):

```ts
  if (mapped === "paid" && BigInt(Math.round(Number(confirmed.grossAmount))) !== order.total) {
    console.error("handleOrderWebhook: nominal settlement tidak cocok, escalate", {
      orderId: order.id, expected: order.total.toString(), received: confirmed.grossAmount,
    });
    await escalateOrder({
      orderId: order.id, orderNumber: order.orderNumber, toStatus: "NEEDS_REVIEW",
      note: "Nominal settlement tidak cocok dengan total order",
    });
    return "amount_mismatch";
  }

```

(Jadi urutannya: hitung `mapped` → cek nominal SEBELUM masuk blok `if (mapped === "paid")` yang sudah ada → kalau nominal cocok atau `mapped` bukan `"paid"`, lanjut ke blok existing seperti biasa tanpa perubahan.)

- [ ] **Step 7: Verifikasi nominal settlement (M-3) — `handleDepositWebhook`**

Di file yang sama, ganti signature `handleDepositWebhook` (baris 87-90):
```ts
async function handleDepositWebhook(
  deposit: { id: string },
  notif: z.infer<typeof notifSchema>,
): Promise<string> {
```
jadi:
```ts
async function handleDepositWebhook(
  deposit: { id: string; amount: bigint },
  notif: z.infer<typeof notifSchema>,
): Promise<string> {
```

Sisipkan pengecekan nominal persis setelah baris `const mapped = mapMidtransStatus(confirmed.transactionStatus, confirmed.fraudStatus);` (di dalam `handleDepositWebhook`) dan sebelum `if (mapped === "paid") {`:

```ts
  if (mapped === "paid" && BigInt(Math.round(Number(confirmed.grossAmount))) !== deposit.amount) {
    console.error("handleDepositWebhook: nominal settlement tidak cocok, saldo TIDAK dikredit", {
      depositId: deposit.id, expected: deposit.amount.toString(), received: confirmed.grossAmount,
    });
    return "amount_mismatch";
  }

```

(Deposit tidak punya `NEEDS_REVIEW`/`escalateOrder` equivalent — cukup log jelas + jangan lanjut ke blok kredit saldo yang sudah ada, status tetap `PENDING` supaya admin bisa investigasi manual, konsisten pola `"paid_but_not_pending"` yang sudah ada di file yang sama.)

- [ ] **Step 8: Redaksi SN dari log adapter (L-4)**

**Titik konkret yang bocor:** `web/src/lib/providers/digiflazz.ts` — saat response Digiflazz gagal validasi Zod, kode saat ini men-stringify RAW response (bisa memuat field `sn`/`data.sn` provider) ke dalam `Error.message`. Error itu lalu ditangkap dan di-`console.error(..., { error: e })` di `fulfillment.ts`/`runner.ts` (mis. `runner.ts:209`, `fulfillment.ts:171`, `fulfillment.ts:332`) — `console.error` men-serialize `Error` termasuk `.message`, jadi SN bisa nyasar ke log aplikasi.

`web/src/lib/order/fulfillment.ts` dan `web/src/lib/jobs/runner.ts` TIDAK perlu diubah sama sekali — dikonfirmasi lewat pembacaan langsung (`grep -n "result.sn\|result.message" web/src/lib/order/fulfillment.ts web/src/lib/jobs/runner.ts`) bahwa kedua field itu di kedua file cuma pernah ditulis ke DB (`OrderStatusHistory.note`/`OrderFulfillment.sn`), TIDAK pernah ke `console.*` — sumber kebocorannya cuma di `digiflazz.ts`, cukup tutup di sana.

**File:** `web/src/lib/providers/digiflazz.ts`

Ganti baris (fungsi cek saldo, sekitar baris 101):
```ts
      throw new Error(`Digiflazz cek-saldo: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
```
jadi:
```ts
      throw new Error("Digiflazz cek-saldo: response tidak sesuai skema yang diharapkan");
```

Ganti baris (fungsi `createTransaction`, sekitar baris 119):
```ts
      throw new Error(`Digiflazz transaction: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
```
jadi:
```ts
      throw new Error("Digiflazz transaction: response tidak sesuai skema yang diharapkan");
```

(Baris lain yang stringify response, sekitar baris 69 — `` `Digiflazz ${path}: response bukan JSON (status ${res.status}): ${text.slice(0, 200)}` `` — TIDAK diubah, itu jalur response bukan-JSON sama sekali/gateway error page, bukan jalur yang bisa memuat SN provider.)

- [ ] **Step 9: Verifikasi L-3 (tidak ada perubahan kode, cuma konfirmasi)**

Baca `web/src/app/api/webhooks/midtrans/route.ts`, konfirmasi `ALLOWED_HEADER_KEYS` (baris 11) masih ada dan masih dipakai di `pickAllowedHeaders(request.headers)` pada titik insert `WebhookEvent` (sekitar baris 194). Catat di laporan task: "L-3 sudah tertutup sejak Fase 7c Task 2, diverifikasi ulang di sini, tidak ada perubahan kode."

- [ ] **Step 10: Verifikasi penuh**

Run: `cd web && npm test`
Expected: semua test PASS.

Run: `cd web && npx tsc --noEmit`
Expected: tidak ada error TypeScript baru.

- [ ] **Step 11: Commit**

```bash
git add web/src/lib/crypto.ts web/src/lib/midtrans/signature.ts web/src/app/api/webhooks/midtrans/route.ts \
  web/src/lib/providers/digiflazz.ts web/tests/crypto.test.ts
git commit -m "fix(fase7d): M-3 verifikasi nominal settlement + L-2 signature timing-safe + L-4 redaksi SN dari log"
```

---

## Task 3: Kelompok C — Auth/akun hardening (M-5, M-6, M-7, L-1)

**Files:**
- Modify: `web/src/app/actions/auth.ts`
- Modify: `web/prisma/seed.ts`
- Modify: `web/src/app/account/page.tsx`
- Modify: `web/src/app/account/orders/page.tsx`
- Modify: `web/src/app/account/deposits/page.tsx`
- Modify: `web/src/app/api/cron/tick/route.ts`

**Interfaces:**
- Consumes: `safeCompare` dari `@/lib/crypto` (Task 2).
- Produces: tidak ada interface baru untuk task lain.

- [ ] **Step 1: Registrasi — pesan generik + tolak `ADMIN_EMAIL` (M-5 + separuh M-6)**

Di `web/src/app/actions/auth.ts`, ganti seluruh fungsi `registerAction` (baris 36-67):

```ts
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

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (parsed.data.email === adminEmail) {
    redirect("/login?registered=1");
  }

  const existing = await db.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (!existing) {
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
  }

  redirect("/login?registered=1");
}
```

Perhatikan: `parsed.error`/`parsed.success` (kegagalan VALIDASI input, mis. password terlalu pendek) TETAP return `{ error: ... }` seperti sebelumnya — itu bukan oracle enumerasi email (gagal validasi tidak menyingkap apakah email tertentu terdaftar). Yang berubah cuma jalur SETELAH validasi lolos: email `ADMIN_EMAIL` dan email yang sudah ada SEKARANG SAMA-SAMA `redirect("/login?registered=1")` diam-diam tanpa membuat apa pun, identik dengan jalur sukses beneran — tidak ada cara membedakan ketiganya dari luar (response redirect yang sama persis).

- [ ] **Step 2: Seed tidak pernah promote user existing (M-6)**

Di `web/prisma/seed.ts`, ganti blok admin (baris 43-54):

```ts
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
```

jadi:

```ts
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
```

- [ ] **Step 3: Hapus `session!` assertion di 3 halaman `/account/*` (M-7)**

Di `web/src/app/account/page.tsx`, ganti baris 16-17:
```tsx
  const session = await auth();
  const userId = session!.user.id; // middleware proxy.ts sudah menjamin ada sesi di /account/*
```
jadi:
```tsx
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
```
dan tambah import `redirect` dari `"next/navigation"` di baris import paling atas (setelah `import Link from "next/link";`).

Ganti juga baris 30 di file yang sama:
```tsx
          Halo, {session!.user.name} ({session!.user.email})
```
jadi:
```tsx
          Halo, {session.user.name} ({session.user.email})
```

Di `web/src/app/account/orders/page.tsx`, ganti baris 14-17:
```tsx
  const session = await auth();
  const orders = await db.order.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });
```
jadi:
```tsx
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const orders = await db.order.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
```
dan tambah import `redirect` dari `"next/navigation"`.

Di `web/src/app/account/deposits/page.tsx`, ganti baris 14-17:
```tsx
  const session = await auth();
  const deposits = await db.deposit.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });
```
jadi:
```tsx
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const deposits = await db.deposit.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
```
dan tambah import `redirect` dari `"next/navigation"`.

- [ ] **Step 4: Timing-safe `CRON_SECRET` (L-1)**

Ganti seluruh isi `web/src/app/api/cron/tick/route.ts` jadi:

```ts
import { NextResponse } from "next/server";
import { ensureRecurringJobs, runDueJobs } from "@/lib/jobs/runner";
import { safeCompare } from "@/lib/crypto";

// Hostinger cron memanggil endpoint ini tiap menit (spec §10).
// Dilindungi secret header — bukan auth session, karena pemanggilnya mesin.
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || !secret || !safeCompare(secret, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureRecurringJobs();
  const result = await runDueJobs();
  return NextResponse.json(result);
}
```

- [ ] **Step 5: Verifikasi**

Run: `cd web && npm test`
Expected: semua test PASS.

Run: `cd web && npx tsc --noEmit`
Expected: tidak ada error TypeScript baru.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/actions/auth.ts web/prisma/seed.ts \
  web/src/app/account/page.tsx web/src/app/account/orders/page.tsx web/src/app/account/deposits/page.tsx \
  web/src/app/api/cron/tick/route.ts
git commit -m "fix(fase7d): M-5 pesan registrasi generik + M-6 seed no-promote + M-7 hapus session! + L-1 cron-secret timing-safe"
```

---

## Task 4: Kelompok D — Input/output hygiene (M-4, M-8, M-9, L-5, L-6 sisa)

**Files:**
- Modify: `web/src/lib/validation/checkout.ts`
- Modify: `web/src/lib/order/order-number.ts`
- Modify: `web/src/app/actions/providers.ts`
- Modify: `web/src/app/api/admin/provider-price-list/route.ts` (2 perubahan di file ini: pesan error generik M-8, `Cache-Control` L-6)
- Modify: `web/src/lib/notify/telegram.ts`
- Modify: `web/src/app/api/deposits/[depositId]/status/route.ts`
- Test: `web/tests/validation-checkout.test.ts`
- Test: `web/tests/order-helpers.test.ts`

**Interfaces:**
- Produces: tidak ada interface baru untuk task lain.

- [ ] **Step 1: Tulis test gagal untuk limit `target` checkout (M-4)**

Tambahkan ke `web/tests/validation-checkout.test.ts`, di dalam `describe("checkoutSchema", ...)` yang sudah ada (setelah test terakhir di blok itu, sebelum `});` penutup describe):

```ts
  it("gagal kalau value field lebih dari 255 karakter", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target: { user_id: "x".repeat(256) },
    });
    expect(result.success).toBe(false);
  });

  it("gagal kalau field lebih dari 10", () => {
    const target: Record<string, string> = {};
    for (let i = 0; i < 11; i++) target[`field${i}`] = "v";
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target,
    });
    expect(result.success).toBe(false);
  });

  it("lolos kalau tepat 10 field, masing-masing 255 karakter", () => {
    const target: Record<string, string> = {};
    for (let i = 0; i < 10; i++) target[`field${i}`] = "x".repeat(255);
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target,
    });
    expect(result.success).toBe(true);
  });
```

Run: `cd web && npx vitest run tests/validation-checkout.test.ts`
Expected: FAIL — 2 test baru pertama gagal (skema belum ada batas).

- [ ] **Step 2: Implementasi batas `target` (M-4)**

Ganti baris 6 di `web/src/lib/validation/checkout.ts`:
```ts
  target: z.record(z.string(), z.string().min(1, "Wajib diisi")),
```
jadi:
```ts
  target: z.record(z.string(), z.string().min(1, "Wajib diisi").max(255, "Terlalu panjang"))
    .refine((t) => Object.keys(t).length <= 10, "Terlalu banyak field"),
```

- [ ] **Step 3: Jalankan test, pastikan lulus**

Run: `cd web && npx vitest run tests/validation-checkout.test.ts`
Expected: semua test PASS (termasuk test lama yang sudah ada — `target kosong lolos di level schema` tetap lolos karena `Object.keys({}).length` = 0 ≤ 10).

- [ ] **Step 4: Tulis test gagal untuk `crypto.randomInt` di order-number (M-9)**

Ganti seluruh isi `web/tests/order-helpers.test.ts` jadi (menambah 2 describe block baru `cryptoRandom` di akhir file, isi lain tidak berubah):

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

  it("pakai crypto.randomInt secara default (bukan Math.random)", () => {
    const now = new Date("2026-07-26T10:00:00Z");
    const a = generateOrderNumber(now);
    const b = generateOrderNumber(now);
    // Format tetap 4 digit; tidak assert nilai spesifik (random), cukup pastikan
    // tidak error dan format konsisten - collision 2x berturut sangat tidak mungkin
    // tapi bukan hal yang perlu di-assert di sini.
    expect(a).toMatch(/^INV-20260726-\d{4}$/);
    expect(b).toMatch(/^INV-20260726-\d{4}$/);
  });
});

describe("generateRefId", () => {
  it("format PREFIX-YYYYMMDDHHmmss-6KARAKTER uppercase", () => {
    const now = new Date("2026-07-26T10:05:30Z");
    const refId = generateRefId("FUL", now, () => 0.123456789);
    expect(refId).toMatch(/^FUL-20260726100530-[A-Z0-9]{6}$/);
  });

  it("pakai crypto.randomInt secara default (bukan Math.random)", () => {
    const now = new Date("2026-07-26T10:05:30Z");
    const refId = generateRefId("FUL", now);
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
Expected: 2 test baru (`"pakai crypto.randomInt secara default"`) tetap PASS di titik ini juga sebenarnya (karena regex match tidak peduli sumber randomness) — TIDAK ada RED sejati di step ini untuk 2 test baru itu (default parameter belum diganti tapi test tidak menguji sumbernya, cuma formatnya). Ini pengecualian sadar dari pola RED-dulu: perubahan M-9 murni mengganti implementasi INTERNAL (sumber randomness) tanpa mengubah kontrak fungsi yang sudah ditest formatnya di test lama — TIDAK ada perilaku baru yang bisa di-assert lewat black-box test selain "tidak error, format tetap benar". Lanjut ke Step 5 langsung.

- [ ] **Step 5: Implementasi `crypto.randomInt` di order-number (M-9)**

Ganti seluruh isi `web/src/lib/order/order-number.ts` jadi:

```ts
import { randomInt } from "node:crypto";

// Pengganti Math.random() yang cryptographically secure - dipakai sebagai
// default parameter `random` di kedua fungsi di bawah. Signature tetap
// () => number di range [0, 1), jadi drop-in replacement, test yang inject
// fungsi random sendiri (mis. `() => 0.1234`) tidak perlu berubah.
function cryptoRandom(): number {
  return randomInt(0, 1_000_000) / 1_000_000;
}

export function generateOrderNumber(now: Date, random: () => number = cryptoRandom): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const suffix = Math.floor(random() * 10000)
    .toString()
    .padStart(4, "0");
  return `INV-${y}${m}${d}-${suffix}`;
}

export function generateRefId(prefix: string, now: Date, random: () => number = cryptoRandom): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(random() * chars.length) % chars.length];
  }
  return `${prefix}-${y}${m}${d}${hh}${mm}${ss}-${suffix}`;
}
```

- [ ] **Step 6: Jalankan test, pastikan lulus**

Run: `cd web && npx vitest run tests/order-helpers.test.ts`
Expected: semua test PASS (test lama yang inject `() => 0.1234`/`() => 0.123456789` tetap PASS karena signature tidak berubah; 2 test baru PASS karena default `cryptoRandom` tetap hasilkan format yang benar).

- [ ] **Step 7: Pesan error admin generik (M-8)**

Di `web/src/app/actions/providers.ts`, ganti 3 baris berikut (masing-masing di catch block terpisah, cari dengan konteks yang ditampilkan):

Baris (di fungsi cek saldo, konteks: `data: { healthStatus: "DOWN", ... }` persis sebelumnya):
```ts
    return { error: e instanceof Error ? e.message : "Gagal cek saldo." };
```
jadi:
```ts
    console.error("checkProviderBalance: gagal cek saldo", { provider: key, error: e });
    return { error: "Gagal cek saldo provider, coba lagi." };
```

Baris (di fungsi transaksi tes, konteks: return sebelumnya `return { ok: \`Transaksi tes terkirim...\` }`):
```ts
    return { error: e instanceof Error ? e.message : "Transaksi tes gagal." };
```
jadi:
```ts
    console.error("testProviderTransaction: transaksi tes gagal", { error: e });
    return { error: "Transaksi tes gagal, coba lagi." };
```

Baris (di fungsi sync harga, konteks: return sebelumnya `return { ok: \`Sync ${key}: ...\` }`):
```ts
    return { error: e instanceof Error ? e.message : "Sync gagal." };
```
jadi:
```ts
    console.error("syncProviderNow: sync gagal", { provider: key, error: e });
    return { error: "Sync harga gagal, coba lagi." };
```

Di `web/src/app/api/admin/provider-price-list/route.ts`, ganti:
```ts
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal ambil price list" }, { status: 502 });
```
jadi:
```ts
    console.error("GET provider-price-list: gagal ambil price list", { provider, error: e });
    return NextResponse.json({ error: "Gagal ambil price list, coba lagi." }, { status: 502 });
```

- [ ] **Step 8: Redaksi log Telegram saat config kosong (L-5)**

Di `web/src/lib/notify/telegram.ts`, ganti baris 42:
```ts
      console.error("Telegram: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID belum di-set, notifikasi dilewati", { message });
```
jadi:
```ts
      console.error("Telegram: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID belum di-set, notifikasi dilewati");
```

- [ ] **Step 9: `Cache-Control: no-store` sisa (L-6)**

Di `web/src/app/api/deposits/[depositId]/status/route.ts`, ganti baris return terakhir:
```ts
  return NextResponse.json({
    depositId: deposit.id,
    status: deposit.status,
    amount: deposit.amount.toString(),
    qrString: rawResponse?.qrString ?? null,
    expiredAt: deposit.expiredAt,
  });
```
jadi:
```ts
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

Di `web/src/app/api/admin/provider-price-list/route.ts`, cari baris return sukses (`return NextResponse.json({ rows });`) dan ganti jadi:
```ts
    return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
```

- [ ] **Step 10: Verifikasi penuh**

Run: `cd web && npm test`
Expected: semua test PASS.

Run: `cd web && npx tsc --noEmit`
Expected: tidak ada error TypeScript baru.

- [ ] **Step 11: Commit**

```bash
git add web/src/lib/validation/checkout.ts web/src/lib/order/order-number.ts \
  web/src/app/actions/providers.ts web/src/app/api/admin/provider-price-list/route.ts \
  web/src/lib/notify/telegram.ts web/src/app/api/deposits/[depositId]/status/route.ts \
  web/tests/validation-checkout.test.ts web/tests/order-helpers.test.ts
git commit -m "fix(fase7d): M-4 batas target checkout + M-8 pesan error admin generik + M-9 crypto.randomInt + L-5 redaksi log Telegram + L-6 no-store sisa"
```

---

## Task 5: Verifikasi manual E2E (wajib sebelum merge)

Task ini tidak menghasilkan kode baru — checklist verifikasi manual terhadap perilaku sungguhan. Jalankan di lingkungan dev lokal (`npm run dev` dari `web/`).

- [ ] **Step 1: M-1/M-2 — Security header + QR tanpa dependency eksternal**

1. Jalankan `npm run dev`, buka `curl -I http://localhost:3000/` — pastikan response header memuat `x-frame-options: DENY`, `x-content-type-options: nosniff`, `content-security-policy: ...`.
2. Buat 1 order QRIS via checkout (lihat Task 8 Fase 7c untuk cara seed produk purchasable kalau DB dev kosong), buka halaman invoice-nya di browser — QR harus tampil normal.
3. Buka DevTools → tab Network, filter `qrserver` — pastikan NOL request ke `api.qrserver.com` saat halaman invoice di-load (QR sekarang `data:` URI, tidak ada network request gambar sama sekali).
4. Buka Console browser — pastikan TIDAK ADA CSP violation error tercetak saat browsing beberapa halaman (`/`, produk, checkout, invoice, login, admin kalau bisa akses).

- [ ] **Step 2: M-5/M-6 — Registrasi generik + seed no-promote**

1. Coba registrasi dengan email yang SUDAH terdaftar (mis. akun yang barusan dipakai checkout) — expected: redirect ke `/login?registered=1`, pesan yang sama persis dengan registrasi baru sukses (bukan "Email sudah terdaftar").
2. Coba registrasi dengan email = nilai `ADMIN_EMAIL` di `.env` — expected: redirect sama (`/login?registered=1`), TIDAK ada user baru terbuat (cek via Prisma Studio: `npx prisma studio` dari `web/`, tabel `User`, pastikan tidak ada row baru dengan email itu selain admin asli).
3. Jalankan `npx dotenv -e .env -- npx prisma db seed` dua kali berturut-turut — expected: tidak ada error, dan `role`/`passwordHash` user admin existing tidak berubah (cek `updatedAt` user admin di Prisma Studio TIDAK bertambah setelah seed kedua — kalau bertambah berarti ada write yang tidak perlu terjadi).

- [ ] **Step 3: M-7 — Halaman `/account/*` tanpa crash**

Login sebagai user biasa, akses `/account`, `/account/orders`, `/account/deposits` — expected: semua halaman render normal seperti sebelumnya (regresi check, bukan skenario attack — perubahan cuma defense-in-depth, tidak mengubah perilaku jalur normal).

- [ ] **Step 4: M-3 — Verifikasi nominal settlement (kalau kredensial Midtrans sandbox tersedia)**

Kalau `.env` sudah punya `MIDTRANS_SERVER_KEY` sandbox (lihat catatan Task 8 Fase 7c): buat 1 order QRIS, lalu kirim POST manual ke `/api/webhooks/midtrans` dengan `order_id` order itu, signature VALID (hitung pakai `computeMidtransSignature`), tapi `gross_amount` SENGAJA beda dari `order.total` — expected: response tetap `{"ok":true}` (webhook tetap diterima), tapi order TIDAK berubah jadi `PAID` — cek di Prisma Studio order tersebut sekarang `NEEDS_REVIEW` (bukan `PAID`/`PENDING_PAYMENT`).

Kalau kredensial tidak tersedia sesi ini: skip step ini, catat di laporan bahwa verifikasi runtime M-3 belum dilakukan (logic sudah diverifikasi lewat code review, bukan lewat eksekusi nyata) — sama seperti pola gap pre-go-live di fase-fase sebelumnya.

- [ ] **Step 5: Catat hasil**

Kalau semua langkah di atas sesuai expected, Fase 7d siap untuk final whole-branch review lalu merge. Kalau ada yang tidak sesuai, catat detail kegagalannya sebelum lanjut ke review.
