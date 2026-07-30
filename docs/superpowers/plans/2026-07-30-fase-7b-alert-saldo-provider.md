# Fase 7b: Alert Saldo Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin dapat notifikasi Telegram otomatis begitu saldo deposit provider (Digiflazz, dan provider lain saat aktif nanti) turun di bawah ambang batas yang mereka tentukan sendiri, sebelum order mulai gagal fulfillment karena kehabisan saldo.

**Architecture:** Job berkala baru (`check-provider-balance`, self-reschedule tiap 1 jam, pola identik `sync-prices`) yang meng-iterasi tiap `ProviderConfig` aktif dengan ambang batas terisi, memanggil `adapter.fetchBalance()` yang sudah ada, lalu memutuskan lewat 1 fungsi pure (`decideBalanceAlertTransition`) apakah status alert berubah (edge-triggered, bukan alert berulang). Semua infra pendukung (adapter, `sendTelegramAlert`, `ProviderConfig.balance`, `ProviderBalanceLog`, halaman `/admin/providers`) sudah ada dari Fase 2 dan Fase 7a — plan ini murni menambah lapisan otomatisasi + alert di atasnya.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma/MySQL, Zod, Vitest.

## Global Constraints

- **Tidak ada tabel baru** — reuse `ProviderConfig` + `ProviderBalanceLog` yang sudah ada (Fase 2).
- **`minBalanceAlert` nullable** — `null` = alert nonaktif untuk provider itu. Job hanya memproses provider dengan `isActive: true` DAN `minBalanceAlert` terisi.
- **Job self-reschedule tiap 1 jam**, didaftarkan lewat `ensureRecurringJobs()` dengan guard stale-`RUNNING` yang sama seperti `reconcile-paid-orders` (`web/src/lib/jobs/runner.ts:161-178`).
- **`fetchBalance()` throw (network/API error)** → catat `healthStatus: DOWN`, `console.error`, lanjut ke provider berikutnya. **TIDAK** alert, **TIDAK** ubah `balanceAlertStatus`. Sama persis dengan tombol "Cek Saldo" manual yang sudah ada.
- **Alert HANYA saat transisi status** (edge-triggered): sehat→menipis mengirim 1 pesan, menipis→sehat mengirim 1 pesan, selama status tidak berubah TIDAK ada alert berulang.
- **TDD wajib** untuk `decideBalanceAlertTransition` (pure function) dan Zod schema baru (`balanceThresholdSchema`) — konvensi repo: semua Zod schema di file `actions/*.ts` dan semua fungsi pure `decide*`/`format*` punya test langsung. Job orchestration (handler `check-provider-balance`, wiring `ensureRecurringJobs`) **tidak** ada test otomatis — konsisten dengan `sync-prices`/`reconcile-paid-orders`/`recheck-fulfillment` yang juga tidak ada test DB-orchestration.
- **UI pakai skill `ui-ux-pro-max` + `frontend-design`** sebelum menulis kode final — wajib untuk task apa pun yang menyentuh markup/komponen frontend, sesuai keputusan Wildan sejak Fase 4.
- Format pesan Rupiah selalu `` `Rp ${Number(nilai).toLocaleString("id-ID")}` `` — konvensi yang sudah dipakai di seluruh repo (`web/src/app/actions/providers.ts:100`, dll), jangan pakai `BigInt.prototype.toLocaleString`.

---

### Task 1: Skema — `minBalanceAlert` + `balanceAlertStatus` di `ProviderConfig`

**Files:**
- Modify: `web/prisma/schema.prisma:274-286` (model `ProviderConfig`)
- Modify: `web/prisma/schema.prisma` (tambah enum baru, taruh dekat `enum HealthStatus` di baris 74-79)

**Interfaces:**
- Produces: kolom `ProviderConfig.minBalanceAlert` (`bigint | null` di Prisma Client), `ProviderConfig.balanceAlertStatus` (`"OK" | "LOW"`, default `"OK"`). Task 2-6 semua bergantung pada nama field ini persis.

- [ ] **Step 1: Tambah enum `BalanceAlertStatus` di `schema.prisma`**

Tambahkan tepat setelah `enum HealthStatus` (setelah baris 79):

```prisma
enum BalanceAlertStatus {
  OK
  LOW
}
```

- [ ] **Step 2: Tambah 2 field ke `model ProviderConfig`**

Ubah blok `model ProviderConfig` (baris 274-286) dari:

```prisma
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
```

menjadi:

```prisma
model ProviderConfig {
  id                 String               @id @default(cuid())
  key                ProviderKey          @unique
  displayName        String
  credentials        Json? // terenkripsi di layer aplikasi sebelum simpan
  isActive           Boolean              @default(false)
  priority           Int                  @default(100) // kecil = diprioritaskan saat harga seri
  balance            BigInt               @default(0)
  healthStatus       HealthStatus         @default(UNKNOWN)
  lastHealthCheckAt  DateTime?
  minBalanceAlert    BigInt? // ambang batas alert Telegram - null = alert nonaktif utk provider ini
  balanceAlertStatus BalanceAlertStatus   @default(OK) // state machine edge-triggered, lihat decideBalanceAlertTransition
  balanceLogs        ProviderBalanceLog[]
  updatedAt          DateTime             @updatedAt
}
```

- [ ] **Step 3: Jalankan migrasi**

Run (dari `web/`): `npx prisma migrate dev --name add_provider_balance_alert`
Expected: migrasi baru dibuat di `web/prisma/migrations/<timestamp>_add_provider_balance_alert/migration.sql`, berhasil diterapkan ke DB dev, Prisma Client di-regenerate otomatis.

- [ ] **Step 4: Verifikasi tipe TypeScript beres**

Run: `npx tsc --noEmit`
Expected: bersih (exit 0) — konfirmasi `node_modules/.prisma/client` sudah punya field `minBalanceAlert`/`balanceAlertStatus`.

- [ ] **Step 5: Commit**

```bash
git add web/prisma/schema.prisma web/prisma/migrations
git commit -m "feat(fase7b): tambah minBalanceAlert + balanceAlertStatus ke ProviderConfig"
```

---

### Task 2: Fungsi pure `decideBalanceAlertTransition` (TDD)

**Files:**
- Create: `web/src/lib/providers/balance-alert.ts`
- Test: `web/tests/provider-balance-alert.test.ts`

**Interfaces:**
- Consumes: tidak ada (fungsi pure, tanpa dependency eksternal)
- Produces: `decideBalanceAlertTransition(balance: bigint, threshold: bigint, currentStatus: "OK" | "LOW"): { newStatus: "OK" | "LOW"; alert: "none" | "low" | "recovered" }`. Task 5 (job handler) memanggil fungsi ini persis dengan signature ini.

- [ ] **Step 1: Tulis test yang gagal**

Buat `web/tests/provider-balance-alert.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decideBalanceAlertTransition } from "@/lib/providers/balance-alert";

describe("decideBalanceAlertTransition", () => {
  it("saldo di bawah ambang, status sebelumnya OK → transisi ke LOW, alert low", () => {
    const result = decideBalanceAlertTransition(500_000n, 1_000_000n, "OK");
    expect(result).toEqual({ newStatus: "LOW", alert: "low" });
  });

  it("saldo di atas ambang, status sebelumnya LOW → transisi ke OK, alert recovered", () => {
    const result = decideBalanceAlertTransition(1_500_000n, 1_000_000n, "LOW");
    expect(result).toEqual({ newStatus: "OK", alert: "recovered" });
  });

  it("saldo di atas ambang, status sebelumnya OK → tetap OK, tidak ada alert", () => {
    const result = decideBalanceAlertTransition(1_500_000n, 1_000_000n, "OK");
    expect(result).toEqual({ newStatus: "OK", alert: "none" });
  });

  it("saldo di bawah ambang, status sebelumnya LOW → tetap LOW, tidak ada alert (tidak berulang)", () => {
    const result = decideBalanceAlertTransition(500_000n, 1_000_000n, "LOW");
    expect(result).toEqual({ newStatus: "LOW", alert: "none" });
  });

  it("saldo tepat di ambang batas, status OK → dianggap TIDAK menipis (>= threshold), tetap OK", () => {
    const result = decideBalanceAlertTransition(1_000_000n, 1_000_000n, "OK");
    expect(result).toEqual({ newStatus: "OK", alert: "none" });
  });

  it("saldo tepat di ambang batas, status LOW → dianggap pulih (>= threshold), transisi ke OK", () => {
    const result = decideBalanceAlertTransition(1_000_000n, 1_000_000n, "LOW");
    expect(result).toEqual({ newStatus: "OK", alert: "recovered" });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd web && npx vitest run tests/provider-balance-alert.test.ts`
Expected: FAIL — `Cannot find module '@/lib/providers/balance-alert'` (file belum ada).

- [ ] **Step 3: Implementasi minimal**

Buat `web/src/lib/providers/balance-alert.ts`:

```ts
export type BalanceAlertStatus = "OK" | "LOW";

export interface BalanceAlertTransition {
  newStatus: BalanceAlertStatus;
  alert: "none" | "low" | "recovered";
}

// Edge-triggered: alert cuma dikirim saat status BERUBAH, bukan tiap kali saldo
// masih di bawah ambang (supaya tidak spam Telegram selama admin belum top-up).
export function decideBalanceAlertTransition(
  balance: bigint,
  threshold: bigint,
  currentStatus: BalanceAlertStatus,
): BalanceAlertTransition {
  const isLow = balance < threshold;

  if (isLow && currentStatus === "OK") {
    return { newStatus: "LOW", alert: "low" };
  }
  if (!isLow && currentStatus === "LOW") {
    return { newStatus: "OK", alert: "recovered" };
  }
  return { newStatus: currentStatus, alert: "none" };
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd web && npx vitest run tests/provider-balance-alert.test.ts`
Expected: PASS — 6/6 test hijau.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/providers/balance-alert.ts web/tests/provider-balance-alert.test.ts
git commit -m "feat(fase7b): decideBalanceAlertTransition (TDD)"
```

---

### Task 3: `formatBalanceAlertMessage` di `telegram.ts` (TDD)

**Files:**
- Modify: `web/src/lib/notify/telegram.ts` (tambah 1 fungsi baru, setelah `formatOrderAlertMessage` di baris 13-18)
- Test: `web/tests/notify-telegram.test.ts` (tambah 1 blok `describe` baru, tidak mengubah test yang sudah ada)

**Interfaces:**
- Consumes: tidak ada dependency baru — file `telegram.ts` sudah ada dari Fase 7a (`sendTelegramAlert`, `formatOrderAlertMessage`, `TelegramConfig`), tidak berubah.
- Produces: `formatBalanceAlertMessage(params: { displayName: string; balance: bigint; threshold: bigint; recovered: boolean }, baseUrl?: string): string`. Task 5 (job handler) memanggil fungsi ini persis dengan signature ini, lalu meneruskan hasilnya ke `sendTelegramAlert` yang sudah ada.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `web/tests/notify-telegram.test.ts`, setelah blok `describe("formatOrderAlertMessage", ...)` yang sudah ada (setelah baris 15), sebelum `function mockFetchOnce`:

```ts
describe("formatBalanceAlertMessage", () => {
  it("saldo menipis: pesan warning berisi nama provider, saldo, dan ambang batas", () => {
    const msg = formatBalanceAlertMessage(
      { displayName: "Digiflazz", balance: 500_000n, threshold: 1_000_000n, recovered: false },
      "https://dannshop.test",
    );
    expect(msg).toContain("⚠️");
    expect(msg).toContain("Digiflazz");
    expect(msg).toContain("menipis");
    expect(msg).toContain("Rp 500.000");
    expect(msg).toContain("Rp 1.000.000");
    expect(msg).toContain("https://dannshop.test/admin/providers");
  });

  it("saldo pulih: pesan sukses berisi nama provider dan saldo, TANPA menyebut ambang batas", () => {
    const msg = formatBalanceAlertMessage(
      { displayName: "Digiflazz", balance: 1_500_000n, threshold: 1_000_000n, recovered: true },
      "https://dannshop.test",
    );
    expect(msg).toContain("✅");
    expect(msg).toContain("Digiflazz");
    expect(msg).toContain("pulih");
    expect(msg).toContain("Rp 1.500.000");
    expect(msg).not.toContain("Rp 1.000.000");
    expect(msg).toContain("https://dannshop.test/admin/providers");
  });
});
```

Ubah baris import paling atas file dari:

```ts
import { formatOrderAlertMessage, sendTelegramAlert } from "@/lib/notify/telegram";
```

menjadi:

```ts
import { formatBalanceAlertMessage, formatOrderAlertMessage, sendTelegramAlert } from "@/lib/notify/telegram";
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd web && npx vitest run tests/notify-telegram.test.ts`
Expected: FAIL — `formatBalanceAlertMessage` bukan export yang dikenal (undefined).

- [ ] **Step 3: Implementasi minimal**

Tambahkan ke `web/src/lib/notify/telegram.ts`, setelah fungsi `formatOrderAlertMessage` (setelah baris 18):

```ts
export function formatBalanceAlertMessage(
  params: { displayName: string; balance: bigint; threshold: bigint; recovered: boolean },
  baseUrl: string = process.env.NEXT_PUBLIC_APP_URL ?? "",
): string {
  const balanceStr = `Rp ${Number(params.balance).toLocaleString("id-ID")}`;
  if (params.recovered) {
    return `✅ Saldo ${params.displayName} pulih: ${balanceStr}\n${baseUrl}/admin/providers`;
  }
  const thresholdStr = `Rp ${Number(params.threshold).toLocaleString("id-ID")}`;
  return `⚠️ Saldo ${params.displayName} menipis: ${balanceStr} (ambang ${thresholdStr})\n${baseUrl}/admin/providers`;
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd web && npx vitest run tests/notify-telegram.test.ts`
Expected: PASS — semua test di file ini hijau (termasuk test lama `formatOrderAlertMessage`/`sendTelegramAlert` yang tidak boleh regresi).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/notify/telegram.ts web/tests/notify-telegram.test.ts
git commit -m "feat(fase7b): formatBalanceAlertMessage (TDD)"
```

---

### Task 4: `balanceThresholdSchema` + server action `saveBalanceThreshold` (TDD utk schema)

**Files:**
- Modify: `web/src/app/actions/providers.ts` (tambah 1 export schema + 1 export async function)
- Modify: `web/tests/validation-providers.test.ts` (tambah 1 blok `describe` baru)

**Interfaces:**
- Consumes: `requireAdmin()`, `logAdmin()` (helper privat yang sudah ada di file yang sama, baris 35-45, tidak berubah).
- Produces: `balanceThresholdSchema` (Zod schema, `{ minBalanceAlert: string | null }` → `{ minBalanceAlert: bigint | null }`), `saveBalanceThreshold(formData: FormData): Promise<ActionResult>`. Task 6 (UI) memakai action ini persis dengan nama & signature ini.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `web/tests/validation-providers.test.ts`, setelah blok `describe("testTransactionSchema", ...)` yang sudah ada:

```ts
describe("balanceThresholdSchema", () => {
  it("angka valid diterima, dikonversi ke bigint", () => {
    const r = balanceThresholdSchema.parse({ minBalanceAlert: "1000000" });
    expect(r.minBalanceAlert).toBe(1_000_000n);
  });

  it("string kosong dinormalisasi jadi null (alert dinonaktifkan)", () => {
    const r = balanceThresholdSchema.parse({ minBalanceAlert: "" });
    expect(r.minBalanceAlert).toBeNull();
  });

  it("null diterima apa adanya (alert dinonaktifkan)", () => {
    const r = balanceThresholdSchema.parse({ minBalanceAlert: null });
    expect(r.minBalanceAlert).toBeNull();
  });

  it("bukan angka ditolak dengan pesan Indonesia", () => {
    const r = balanceThresholdSchema.safeParse({ minBalanceAlert: "abc" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Ambang batas harus berupa angka");
  });

  it("angka negatif ditolak", () => {
    const r = balanceThresholdSchema.safeParse({ minBalanceAlert: "-1000" });
    expect(r.success).toBe(false);
  });
});
```

Ubah baris import di `web/tests/validation-providers.test.ts` dari:

```ts
import { digiflazzCredentialsSchema, testTransactionSchema } from "@/app/actions/providers";
```

menjadi:

```ts
import { balanceThresholdSchema, digiflazzCredentialsSchema, testTransactionSchema } from "@/app/actions/providers";
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd web && npx vitest run tests/validation-providers.test.ts`
Expected: FAIL — `balanceThresholdSchema` bukan export yang dikenal.

- [ ] **Step 3: Implementasi minimal**

Tambahkan ke `web/src/app/actions/providers.ts`, setelah `testTransactionSchema` (setelah baris 25):

```ts
export const balanceThresholdSchema = z.object({
  minBalanceAlert: z
    .string()
    .nullable()
    .transform((v) => (v === null || v.trim() === "" ? null : v))
    .pipe(
      z.union([
        z.null(),
        z.coerce
          .bigint({ message: "Ambang batas harus berupa angka" })
          .nonnegative("Ambang batas tidak boleh negatif"),
      ]),
    ),
});
```

Tambahkan ke akhir file (setelah `syncProviderNow`, setelah baris 151):

```ts
export async function saveBalanceThreshold(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const key = formData.get("key") as ProviderKey;
  const parsed = balanceThresholdSchema.safeParse({
    minBalanceAlert: formData.get("minBalanceAlert"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.providerConfig.update({ where: { key }, data: { minBalanceAlert: parsed.data.minBalanceAlert } });
  await logAdmin(admin.adminId, "provider.save_balance_threshold", key, {
    minBalanceAlert: parsed.data.minBalanceAlert?.toString() ?? null,
  });
  revalidatePath("/admin/providers");
  return {
    ok:
      parsed.data.minBalanceAlert === null
        ? "Alert saldo dinonaktifkan."
        : `Ambang alert saldo disetel Rp ${Number(parsed.data.minBalanceAlert).toLocaleString("id-ID")}.`,
  };
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd web && npx vitest run tests/validation-providers.test.ts`
Expected: PASS — semua test di file ini hijau (termasuk test lama utk `digiflazzCredentialsSchema`/`testTransactionSchema`).

- [ ] **Step 5: Jalankan tsc, pastikan bersih**

Run: `cd web && npx tsc --noEmit`
Expected: bersih (exit 0).

- [ ] **Step 6: Commit**

```bash
git add web/src/app/actions/providers.ts web/tests/validation-providers.test.ts
git commit -m "feat(fase7b): balanceThresholdSchema + saveBalanceThreshold action (TDD)"
```

---

### Task 5: Job handler `check-provider-balance` + wiring `ensureRecurringJobs`

**Files:**
- Modify: `web/src/lib/jobs/runner.ts` (tambah handler baru ke object `handlers`, tambah blok bootstrap ke `ensureRecurringJobs`, tambah import)

**Interfaces:**
- Consumes: `decideBalanceAlertTransition` (Task 2, `@/lib/providers/balance-alert`), `formatBalanceAlertMessage` (Task 3, `@/lib/notify/telegram`, sudah ada `sendTelegramAlert` di import yang sama), `getAdapter` (sudah ada import di file ini, `@/lib/providers/registry`).
- Produces: job type `"check-provider-balance"` terdaftar di `handlers` dan di-bootstrap oleh `ensureRecurringJobs()`. Tidak ada task lain yang bergantung pada internal handler ini.

- [ ] **Step 1: Tambah import `decideBalanceAlertTransition` dan `formatBalanceAlertMessage`**

Ubah baris import di `web/src/lib/jobs/runner.ts` (baris 1-7) dari:

```ts
import { db } from "@/lib/db";
import { runPriceSync } from "@/lib/catalog/price-sync";
import type { ProviderKey } from "@prisma/client";
import { applyFulfillmentResult, dispatchFulfillment } from "@/lib/order/fulfillment";
import { getAdapter } from "@/lib/providers/registry";
import { buildCustomerNo } from "@/lib/order/customer-no";
import { formatOrderAlertMessage, sendTelegramAlert } from "@/lib/notify/telegram";
```

menjadi:

```ts
import { db } from "@/lib/db";
import { runPriceSync } from "@/lib/catalog/price-sync";
import type { ProviderKey } from "@prisma/client";
import { applyFulfillmentResult, dispatchFulfillment } from "@/lib/order/fulfillment";
import { getAdapter } from "@/lib/providers/registry";
import { decideBalanceAlertTransition } from "@/lib/providers/balance-alert";
import { buildCustomerNo } from "@/lib/order/customer-no";
import { formatBalanceAlertMessage, formatOrderAlertMessage, sendTelegramAlert } from "@/lib/notify/telegram";
```

- [ ] **Step 2: Tambah handler `check-provider-balance` ke object `handlers`**

Tambahkan properti baru ke object `handlers` (`web/src/lib/jobs/runner.ts:31-144`), setelah `"reconcile-paid-orders"` (setelah baris 96, sebelum `"recheck-fulfillment"`):

```ts
  "check-provider-balance": async () => {
    const providers = await db.providerConfig.findMany({
      where: { isActive: true, minBalanceAlert: { not: null } },
    });

    for (const provider of providers) {
      let balance: bigint;
      try {
        const adapter = await getAdapter(provider.key);
        balance = await adapter.fetchBalance();
      } catch (e) {
        // Sama persis dengan tombol "Cek Saldo" manual (actions/providers.ts) - gangguan
        // API sesaat itu wajar, tidak boleh alert Telegram tiap kali jaringan blip.
        console.error("check-provider-balance: fetchBalance gagal, dilewati", { provider: provider.key, error: e });
        await db.providerConfig.update({
          where: { key: provider.key },
          data: { healthStatus: "DOWN", lastHealthCheckAt: new Date() },
        });
        continue;
      }

      await db.providerConfig.update({
        where: { key: provider.key },
        data: { balance, healthStatus: "HEALTHY", lastHealthCheckAt: new Date() },
      });
      await db.providerBalanceLog.create({ data: { providerId: provider.id, balance } });

      const transition = decideBalanceAlertTransition(balance, provider.minBalanceAlert!, provider.balanceAlertStatus);
      if (transition.alert !== "none") {
        await db.providerConfig.update({
          where: { key: provider.key },
          data: { balanceAlertStatus: transition.newStatus },
        });
        await sendTelegramAlert(
          formatBalanceAlertMessage({
            displayName: provider.displayName,
            balance,
            threshold: provider.minBalanceAlert!,
            recovered: transition.alert === "recovered",
          }),
        );
      }
    }

    // Self-reschedule tiap 1 jam (pola sama seperti "sync-prices") - dijalankan
    // TANPA syarat (bukan cuma kalau semua provider sukses) supaya gangguan jaringan
    // di 1 provider tidak menghentikan cadence pengecekan provider lain seterusnya.
    await db.job.create({
      data: { type: "check-provider-balance", payload: {}, runAt: new Date(Date.now() + 60 * 60_000) },
    });

    return `checked=${providers.length}`;
  },
```

- [ ] **Step 3: Tambah bootstrap ke `ensureRecurringJobs()`**

Tambahkan blok baru ke fungsi `ensureRecurringJobs` (`web/src/lib/jobs/runner.ts:146-179`), setelah blok `reconcile-paid-orders` yang sudah ada (setelah baris 178, sebelum penutup `}` fungsi di baris 179):

```ts

  // Job RUNNING dianggap basi kalau sudah RUNNING lebih lama dari threshold ini -
  // guard yang sama persis dengan reconcile-paid-orders di atas.
  const BALANCE_CHECK_RUNNING_STALE_MINUTES = 10;
  const balanceCheckRunningFreshAfter = new Date(Date.now() - BALANCE_CHECK_RUNNING_STALE_MINUTES * 60_000);
  const existingBalanceCheck = await db.job.findFirst({
    where: {
      type: "check-provider-balance",
      OR: [
        { status: "PENDING" },
        { status: "RUNNING", updatedAt: { gt: balanceCheckRunningFreshAfter } },
      ],
    },
  });
  if (!existingBalanceCheck) {
    await db.job.create({ data: { type: "check-provider-balance", payload: {}, runAt: new Date() } });
  }
```

- [ ] **Step 4: Jalankan full test suite, pastikan tidak ada regresi**

Run: `cd web && npx vitest run`
Expected: PASS — semua test yang sudah ada (termasuk `jobs-runner.test.ts`, `jobs-order-handlers.test.ts`) tetap hijau. Tidak ada test baru di task ini (job orchestration, lihat Global Constraints).

- [ ] **Step 5: Jalankan tsc, pastikan bersih**

Run: `cd web && npx tsc --noEmit`
Expected: bersih (exit 0).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/jobs/runner.ts
git commit -m "feat(fase7b): job check-provider-balance + wiring ensureRecurringJobs"
```

---

### Task 6: UI — field ambang batas alert saldo di `/admin/providers`

**Files:**
- Modify: `web/src/app/admin/providers/provider-card.tsx` (tambah form baru + prop baru)
- Modify: `web/src/app/admin/providers/page.tsx` (teruskan prop baru + data `minBalanceAlert`/`balanceAlertStatus`)

**Interfaces:**
- Consumes: `saveBalanceThreshold` (Task 4, `@/app/actions/providers`), `ActionResult` (sudah ada, tidak berubah).
- Produces: tidak ada — task terakhir yang menyentuh kode aplikasi di plan ini.

**Sebelum menulis kode di task ini:** konsultasikan skill `ui-ux-pro-max` dan `frontend-design` untuk gaya form/label/badge yang konsisten dengan form kredensial Digiflazz yang sudah ada di file yang sama (`provider-card.tsx:139-158`) — pola card/label/input sudah mapan di file ini, jangan improvisasi styling baru.

- [ ] **Step 1: Tambah prop baru ke `ProviderCardProps` dan render form ambang batas**

Ubah interface `ProviderCardProps` (`web/src/app/admin/providers/provider-card.tsx:55-68`) dari:

```tsx
export interface ProviderCardProps {
  providerKey: string;
  displayName: string;
  isActive: boolean;
  hasCredentials: boolean;
  healthStatus: string;
  balanceDisplay: string;
  lastHealthCheckDisplay: string;
  lastSyncDisplay: string;
  toggleProviderActive: ServerAction;
  checkProviderBalance: ServerAction;
  syncProviderNow: ServerAction;
  saveDigiflazzCredentials: ServerAction;
}
```

menjadi (tambah 3 field):

```tsx
export interface ProviderCardProps {
  providerKey: string;
  displayName: string;
  isActive: boolean;
  hasCredentials: boolean;
  healthStatus: string;
  balanceDisplay: string;
  lastHealthCheckDisplay: string;
  lastSyncDisplay: string;
  minBalanceAlert: string; // "" kalau alert nonaktif, string angka murni (tanpa "Rp"/titik) kalau aktif - untuk default value <input>
  balanceAlertStatus: string; // "OK" | "LOW"
  toggleProviderActive: ServerAction;
  checkProviderBalance: ServerAction;
  syncProviderNow: ServerAction;
  saveDigiflazzCredentials: ServerAction;
  saveBalanceThreshold: ServerAction;
}
```

Ubah signature komponen (`provider-card.tsx:70-99`) untuk menerima props baru dan tambah 1 `useActionState` baru, dari:

```tsx
export function ProviderCard({
  providerKey,
  displayName,
  isActive,
  hasCredentials,
  healthStatus,
  balanceDisplay,
  lastHealthCheckDisplay,
  lastSyncDisplay,
  toggleProviderActive,
  checkProviderBalance,
  syncProviderNow,
  saveDigiflazzCredentials,
}: ProviderCardProps) {
  const [toggleState, toggleAction, togglePending] = useActionState(
    withPrevState(toggleProviderActive),
    INITIAL_STATE,
  );
  const [balanceState, balanceAction, balancePending] = useActionState(
    withPrevState(checkProviderBalance),
    INITIAL_STATE,
  );
  const [syncState, syncAction, syncPending] = useActionState(
    withPrevState(syncProviderNow),
    INITIAL_STATE,
  );
  const [credState, credAction, credPending] = useActionState(
    withPrevState(saveDigiflazzCredentials),
    INITIAL_STATE,
  );
```

menjadi:

```tsx
export function ProviderCard({
  providerKey,
  displayName,
  isActive,
  hasCredentials,
  healthStatus,
  balanceDisplay,
  lastHealthCheckDisplay,
  lastSyncDisplay,
  minBalanceAlert,
  balanceAlertStatus,
  toggleProviderActive,
  checkProviderBalance,
  syncProviderNow,
  saveDigiflazzCredentials,
  saveBalanceThreshold,
}: ProviderCardProps) {
  const [toggleState, toggleAction, togglePending] = useActionState(
    withPrevState(toggleProviderActive),
    INITIAL_STATE,
  );
  const [balanceState, balanceAction, balancePending] = useActionState(
    withPrevState(checkProviderBalance),
    INITIAL_STATE,
  );
  const [syncState, syncAction, syncPending] = useActionState(
    withPrevState(syncProviderNow),
    INITIAL_STATE,
  );
  const [credState, credAction, credPending] = useActionState(
    withPrevState(saveDigiflazzCredentials),
    INITIAL_STATE,
  );
  const [thresholdState, thresholdAction, thresholdPending] = useActionState(
    withPrevState(saveBalanceThreshold),
    INITIAL_STATE,
  );
```

Tambah 1 baris ke `healthLabel`/`healthVariant`-style lookup untuk status alert saldo — sisipkan setelah `healthVariant` (setelah baris 41, sebelum `function ActionMessage`):

```tsx
const balanceAlertLabel: Record<string, string> = {
  OK: "Sehat",
  LOW: "Menipis",
};

const balanceAlertVariant: Record<string, "success" | "warning"> = {
  OK: "success",
  LOW: "warning",
};
```

Tambah form baru ke `CardContent` (`provider-card.tsx:115-159`), setelah blok `<dl>` yang menampilkan info saldo/health (setelah baris 130, sebelum blok `{!hasCredentials && ...}`):

```tsx
        <form action={thresholdAction} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${providerKey}-threshold`}>Ambang alert saldo</Label>
            {minBalanceAlert !== "" && (
              <Badge variant={balanceAlertVariant[balanceAlertStatus] ?? "muted"}>
                {balanceAlertLabel[balanceAlertStatus] ?? balanceAlertStatus}
              </Badge>
            )}
          </div>
          <input type="hidden" name="key" value={providerKey} />
          <Input
            id={`${providerKey}-threshold`}
            name="minBalanceAlert"
            type="number"
            min={0}
            step={1000}
            defaultValue={minBalanceAlert}
            placeholder="Kosongkan untuk nonaktifkan alert"
          />
          <p className="text-xs text-muted-foreground">
            Kirim notifikasi Telegram otomatis kalau saldo turun di bawah angka ini.
          </p>
          <Button type="submit" size="sm" variant="outline" disabled={thresholdPending}>
            {thresholdPending ? "Menyimpan..." : "Simpan Ambang Batas"}
          </Button>
          <ActionMessage state={thresholdState} />
        </form>
```

- [ ] **Step 2: Teruskan data dan action dari `page.tsx`**

Ubah import di `web/src/app/admin/providers/page.tsx:1-8` dari:

```tsx
import { db } from "@/lib/db";
import {
  saveDigiflazzCredentials,
  toggleProviderActive,
  checkProviderBalance,
  syncProviderNow,
} from "@/app/actions/providers";
import { ProviderCard } from "./provider-card";
```

menjadi:

```tsx
import { db } from "@/lib/db";
import {
  saveDigiflazzCredentials,
  toggleProviderActive,
  checkProviderBalance,
  syncProviderNow,
  saveBalanceThreshold,
} from "@/app/actions/providers";
import { ProviderCard } from "./provider-card";
```

Ubah pemanggilan `<ProviderCard>` (`page.tsx:54-70`) dari:

```tsx
        {providers.map((provider, i) => (
          <ProviderCard
            key={provider.key}
            providerKey={provider.key}
            displayName={provider.displayName}
            isActive={provider.isActive}
            hasCredentials={provider.credentials != null}
            healthStatus={provider.healthStatus}
            balanceDisplay={formatRupiah(provider.balance)}
            lastHealthCheckDisplay={formatDateTime(provider.lastHealthCheckAt)}
            lastSyncDisplay={formatSync(lastSyncs[i])}
            toggleProviderActive={toggleProviderActive}
            checkProviderBalance={checkProviderBalance}
            syncProviderNow={syncProviderNow}
            saveDigiflazzCredentials={saveDigiflazzCredentials}
          />
        ))}
```

menjadi:

```tsx
        {providers.map((provider, i) => (
          <ProviderCard
            key={provider.key}
            providerKey={provider.key}
            displayName={provider.displayName}
            isActive={provider.isActive}
            hasCredentials={provider.credentials != null}
            healthStatus={provider.healthStatus}
            balanceDisplay={formatRupiah(provider.balance)}
            lastHealthCheckDisplay={formatDateTime(provider.lastHealthCheckAt)}
            lastSyncDisplay={formatSync(lastSyncs[i])}
            minBalanceAlert={provider.minBalanceAlert?.toString() ?? ""}
            balanceAlertStatus={provider.balanceAlertStatus}
            toggleProviderActive={toggleProviderActive}
            checkProviderBalance={checkProviderBalance}
            syncProviderNow={syncProviderNow}
            saveDigiflazzCredentials={saveDigiflazzCredentials}
            saveBalanceThreshold={saveBalanceThreshold}
          />
        ))}
```

- [ ] **Step 3: Jalankan tsc, pastikan bersih**

Run: `cd web && npx tsc --noEmit`
Expected: bersih (exit 0) — konfirmasi semua prop baru cocok tipenya di kedua sisi (`page.tsx` → `provider-card.tsx`).

- [ ] **Step 4: Jalankan lint**

Run: `cd web && npm run lint`
Expected: 0 error baru (warning pre-existing yang sudah ada sebelumnya boleh tetap ada, jangan tambah warning baru).

- [ ] **Step 5: Jalankan full test suite, pastikan tidak ada regresi**

Run: `cd web && npx vitest run`
Expected: PASS — semua test tetap hijau.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/admin/providers/provider-card.tsx web/src/app/admin/providers/page.tsx
git commit -m "feat(fase7b): form ambang batas alert saldo di /admin/providers"
```

---

### Task 7: Verifikasi akhir end-to-end (manual)

**Files:** tidak ada perubahan kode — task ini murni verifikasi.

**Interfaces:** tidak ada — task terakhir plan ini.

- [ ] **Step 1: Build produksi**

Run: `cd web && npm run build`
Expected: `✓ Compiled successfully`, tidak ada error TypeScript/route generation.

- [ ] **Step 2: Full automated suite**

Run: `cd web && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: semua hijau/bersih (test count harus lebih tinggi dari 104 baseline Fase 7a — minimal +6 dari Task 2, +2 dari Task 3, +5 dari Task 4).

- [ ] **Step 3: Verifikasi manual jalur "menipis"**

1. Jalankan dev server (`npm run dev`), login admin, buka `/admin/providers`.
2. Cek saldo Digiflazz asli lewat tombol "Cek Saldo" (catat angkanya).
3. Isi "Ambang alert saldo" Digiflazz dengan angka **di atas** saldo asli (mis. saldo asli + 100.000), klik "Simpan Ambang Batas".
4. Trigger job secara manual — cara paling praktis: panggil `POST /api/cron/tick` dengan header `x-cron-secret` sesuai `CRON_SECRET` di `.env` (`curl -X POST http://localhost:3000/api/cron/tick -H "x-cron-secret: $CRON_SECRET"`), ATAU tunggu job `check-provider-balance` yang di-bootstrap `ensureRecurringJobs()` due secara alami.
5. **Expected:** pesan Telegram "⚠️ Saldo Digiflazz menipis" masuk ke bot asli (`t.me/dannshop_bot`) dalam hitungan detik. Badge status di `/admin/providers` berubah jadi "Menipis".

- [ ] **Step 4: Verifikasi manual tidak ada alert berulang**

1. Panggil `/api/cron/tick` sekali lagi (atau tunggu job berikutnya due).
2. **Expected:** TIDAK ada pesan Telegram baru masuk (status masih `LOW`, tidak ada transisi) — konfirmasi behavior edge-triggered bekerja, bukan alert tiap jam selama saldo belum pulih.

- [ ] **Step 5: Verifikasi manual jalur "pulih"**

1. Turunkan "Ambang alert saldo" Digiflazz jadi di bawah saldo asli, simpan.
2. Panggil `/api/cron/tick` lagi.
3. **Expected:** pesan Telegram "✅ Saldo Digiflazz pulih" masuk. Badge berubah jadi "Sehat".

- [ ] **Step 6: Verifikasi manual jalur gagal cek (opsional, kalau memungkinkan disimulasikan)**

Kalau memungkinkan menonaktifkan kredensial Digiflazz sementara (mis. ubah API key jadi salah lewat form kredensial, ingat kembalikan setelah tes): panggil `/api/cron/tick`, **expected** `healthStatus` provider jadi `DOWN` di `/admin/providers`, TIDAK ada pesan Telegram baru terkait saldo (beda dari alert menipis/pulih). Kembalikan kredensial asli setelah verifikasi.

- [ ] **Step 7: Tulis laporan verifikasi**

Ringkas hasil Step 1-6 (termasuk kredensial mana yang dipakai, apakah Step 6 dilakukan atau di-skip dan kenapa) ke laporan singkat, sertakan di commit message final task ini.

- [ ] **Step 8: Commit (kalau ada perubahan, mis. `.env.example` kalau ada var baru — seharusnya tidak ada di plan ini)**

```bash
git status
# Kalau bersih (tidak ada perubahan kode dari task verifikasi ini), tidak perlu commit apa pun.
```
