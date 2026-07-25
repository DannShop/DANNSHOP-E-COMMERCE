# Fase 3 — Order Flow + Midtrans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guest bisa beli item game (contoh: Mobile Legends 86 Diamonds) end-to-end di sandbox — pilih produk → checkout → bayar QRIS via Midtrans → webhook memicu fulfillment otomatis ke Digiflazz → SN tampil di halaman invoice yang polling status. Sekalian menerapkan design system Arah A (sudah di-approve user) ke halaman publik.

**Architecture:** Order flow murni Next.js App Router: server actions untuk mutasi (checkout), route handler untuk webhook (harus terima raw request, bukan server action), job queue MySQL yang sudah ada (Fase 2) diperluas dengan 2 job type baru (`expire-order`, `recheck-fulfillment`). Uang (Midtrans) dan barang (Digiflazz, adapter sudah ada dari Fase 2) tetap terpisah tegas, bertemu di `dispatchFulfillment()`. Semua logic keputusan uang/eksternal (pilih provider, mapping status Midtrans, verifikasi signature, generate nomor) ditulis sebagai fungsi pure dan di-TDD; orkestrasi DB+network diverifikasi manual end-to-end di sandbox (pola yang sama dipakai Fase 2 untuk `runPriceSync`/test-transaction).

**Tech Stack:** Next.js 16 App Router (TypeScript strict), Prisma 6 → MySQL, Zod 4, Vitest 4, `next-themes` (baru), `@tanstack/react-query` (baru) untuk polling status. Tidak ada SDK Midtrans resmi dipasang — panggil REST API langsung via `fetch`, mengikuti pola `DigiflazzAdapter.post()` yang sudah ada (timeout 15s, parse manual).

## Global Constraints

- Semua satuan uang `BIGINT` rupiah utuh, tanpa float (spec §1). Saat kirim ke Midtrans (`gross_amount`) HARUS `Number(bigint)` — aman karena nilai rupiah realistis jauh di bawah `2^53`.
- Kredensial (Midtrans server key) di env, TIDAK pernah dikirim ke client maupun di-log.
- Semua webhook/callback WAJIB disimpan ke `WebhookEvent` dulu sebelum diproses, idempotency via `eventKey` unik format `${source}:${ref}:${status}` (spec §11, kolom sudah ada di schema).
- Setiap transisi status yang melepas/mendebit "sesuatu yang final" (paid, completed, expired, refund_pending) harus pakai `updateMany({ where: { id, status: <status lama> }, ... })` sebagai klaim atomik — pola yang sudah dipakai `runDueJobs()` di `web/src/lib/jobs/runner.ts` — supaya webhook dobel atau job+webhook balapan tidak memproses dua kali (spec §7 edge case #1, §15 addendum poin 5b).
- TDD wajib untuk semua logic uang/eksternal: provider selection, status mapping Midtrans, signature verify, generator nomor (spec §15 addendum poin 4). Orkestrasi DB (server action, webhook route, job handler) diverifikasi manual di sandbox pada Task 13 — TIDAK perlu dipaksa unit test dengan DB mock, ikuti pola Fase 2.
- Bahasa Indonesia untuk semua string yang tampil ke user (label, error message, status) — konsisten dengan seluruh codebase.
- Route params Next.js 16 adalah `Promise` (`{ params }: { params: Promise<{ slug: string }> }`, wajib `await params`) — konvensi yang sudah dipakai di halaman admin existing.
- Token desain Arah A yang FINAL (sudah di-approve user, PROGRESS.md 2026-07-25): light bg `#F5F3FF`/primary `#4F46E5`/btn `#4338CA`/accent `#EA580C`/text `#1E1B3A`; dark bg `#0F0F23`/primary `#7C3AED`/accent `#F43F5E`/text `#F1EEFF`; radius `20px`; font display **Baloo 2** (bold) via `next/font/google` (BUKAN base64 — itu cuma workaround khusus artifact preview karena CSP-nya blokir font CDN; di app Next.js beneran `next/font/google` self-host otomatis saat build, tidak butuh base64).

---

## Task 1: Terapkan token warna & radius Arah A ke design system

**Files:**
- Modify: `web/src/app/globals.css`

**Interfaces:**
- Produces: custom properties `--radius` (1.25rem), `--background`/`--foreground`/`--primary`/`--primary-foreground`/`--secondary`/`--muted`/`--accent`/`--border`/dst di `:root` dan `.dark`, plus token semantik baru `--success`/`--success-foreground`/`--warning`/`--warning-foreground`/`--danger`/`--danger-foreground` yang dipakai Task 2 dst (badge status order pakai token ini, bukan `emerald-500`/`amber-500` hardcoded seperti `badge.tsx` saat ini).

Ini task CSS murni (tidak ada logic untuk di-TDD) — verifikasi lewat `npm run build` + cek visual manual (bukan test otomatis).

- [ ] **Step 1: Ganti isi `:root` dan `.dark` di `web/src/app/globals.css` dengan token Arah A**

Ganti blok `:root { ... }` (baris 51-84) jadi:

```css
:root {
  --background: #F5F3FF;
  --foreground: #1E1B3A;
  --card: #FFFFFF;
  --card-foreground: #1E1B3A;
  --popover: #FFFFFF;
  --popover-foreground: #1E1B3A;
  --primary: #4338CA;
  --primary-foreground: #FFFFFF;
  --secondary: #EDEAFB;
  --secondary-foreground: #1E1B3A;
  --muted: #EDEAFB;
  --muted-foreground: #6B6483;
  --accent: #EA580C;
  --accent-foreground: #FFFFFF;
  --destructive: #DC2626;
  --border: #E4E0FA;
  --input: #E4E0FA;
  --ring: #4F46E5;
  --success: #DCFCE7;
  --success-foreground: #15803D;
  --warning: #FEF3C7;
  --warning-foreground: #92400E;
  --danger: #FEE2E2;
  --danger-foreground: #B91C1C;
  --chart-1: #4F46E5;
  --chart-2: #EA580C;
  --chart-3: #7C3AED;
  --chart-4: #F43F5E;
  --chart-5: #6B6483;
  --radius: 1.25rem;
  --sidebar: #FFFFFF;
  --sidebar-foreground: #1E1B3A;
  --sidebar-primary: #4338CA;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #EDEAFB;
  --sidebar-accent-foreground: #1E1B3A;
  --sidebar-border: #E4E0FA;
  --sidebar-ring: #4F46E5;
}

.dark {
  --background: #0F0F23;
  --foreground: #F1EEFF;
  --card: #1A1A3E;
  --card-foreground: #F1EEFF;
  --popover: #1A1A3E;
  --popover-foreground: #F1EEFF;
  --primary: #7C3AED;
  --primary-foreground: #FFFFFF;
  --secondary: #27273B;
  --secondary-foreground: #F1EEFF;
  --muted: #27273B;
  --muted-foreground: #A8A0C8;
  --accent: #F43F5E;
  --accent-foreground: #FFFFFF;
  --destructive: #F87171;
  --border: #2E2B5C;
  --input: #2E2B5C;
  --ring: #7C3AED;
  --success: rgba(74, 222, 128, 0.15);
  --success-foreground: #4ADE80;
  --warning: rgba(251, 191, 36, 0.15);
  --warning-foreground: #FBBF24;
  --danger: rgba(248, 113, 113, 0.15);
  --danger-foreground: #F87171;
  --chart-1: #7C3AED;
  --chart-2: #F43F5E;
  --chart-3: #A78BFA;
  --chart-4: #EA580C;
  --chart-5: #A8A0C8;
  --sidebar: #1A1A3E;
  --sidebar-foreground: #F1EEFF;
  --sidebar-primary: #7C3AED;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #27273B;
  --sidebar-accent-foreground: #F1EEFF;
  --sidebar-border: #2E2B5C;
  --sidebar-ring: #7C3AED;
}
```

- [ ] **Step 2: Daftarkan token semantik baru + font heading di `@theme inline` block (baris 7-49)**

Tambahkan 6 baris berikut ke dalam blok `@theme inline { ... }` yang sudah ada (setelah baris `--color-card: var(--card);`):

```css
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-danger: var(--danger);
  --color-danger-foreground: var(--danger-foreground);
```

Lalu ubah baris `--font-heading: var(--font-sans);` (baris 12) jadi:

```css
  --font-heading: var(--font-baloo);
```

- [ ] **Step 3: Tambahkan font Baloo 2 di `web/src/app/layout.tsx`**

Modify `web/src/app/layout.tsx` — tambah import dan konfigurasi font baru, sandingkan dengan Geist yang sudah ada:

```tsx
import { Baloo_2, Geist, Geist_Mono } from "next/font/google";
```

Tambah setelah `geistMono`:

```tsx
const baloo2 = Baloo_2({
  variable: "--font-baloo",
  weight: ["700"],
  subsets: ["latin"],
});
```

Update `className` di elemen `<html>`:

```tsx
className={`${geistSans.variable} ${geistMono.variable} ${baloo2.variable} h-full antialiased`}
```

- [ ] **Step 4: Update varian `badge.tsx` supaya pakai token semantik baru (bukan hardcode emerald/amber)**

Modify `web/src/components/ui/badge.tsx`, ganti 3 baris varian:

```tsx
        success:
          "border-transparent bg-success text-success-foreground",
        warning:
          "border-transparent bg-warning text-warning-foreground",
        destructive:
          "border-transparent bg-danger text-danger-foreground",
```

- [ ] **Step 5: Build untuk pastikan tidak ada error, lalu commit**

Run: `cd web && npm run build`
Expected: build sukses, tidak ada error TypeScript/CSS.

```bash
git add web/src/app/globals.css web/src/app/layout.tsx web/src/components/ui/badge.tsx
git commit -m "feat(web): terapkan token warna & radius Arah A ke design system"
```

---

## Task 2: Dark/light mode toggle (next-themes)

**Files:**
- Create: `web/src/components/theme-provider.tsx`
- Create: `web/src/components/theme-toggle.tsx`
- Modify: `web/src/app/layout.tsx`
- Modify: `web/src/components/site-header.tsx`
- Modify: `web/package.json` (dependency baru)

**Interfaces:**
- Produces: `<ThemeProvider>` (wraps root layout children), `<ThemeToggle />` (client component, dipakai di `SiteHeader`).

- [ ] **Step 1: Install `next-themes`**

Run: `cd web && npm install next-themes`

- [ ] **Step 2: Buat `web/src/components/theme-provider.tsx`**

```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem {...props}>
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 3: Buat `web/src/components/theme-toggle.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Button variant="ghost" size="sm" disabled aria-hidden="true" />;
  }

  const isDark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
    >
      {isDark ? "Terang" : "Gelap"}
    </Button>
  );
}
```

- [ ] **Step 4: Pasang `ThemeProvider` di root layout**

Modify `web/src/app/layout.tsx` — bungkus `children` di dalam `<body>`:

```tsx
import { ThemeProvider } from "@/components/theme-provider";
```

```tsx
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
```

Tambahkan juga `suppressHydrationWarning` di tag `<html>` (wajib untuk `next-themes` karena class `dark` di-set oleh script client sebelum hydration):

```tsx
    <html
      lang="id"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${baloo2.variable} h-full antialiased`}
    >
```

- [ ] **Step 5: Pasang `ThemeToggle` di `SiteHeader`**

Modify `web/src/components/site-header.tsx` — tambah import dan render di dalam `<nav>`, sebelum blok `{session?.user ? ... }`:

```tsx
import { ThemeToggle } from "@/components/theme-toggle";
```

```tsx
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          {session?.user ? (
```

- [ ] **Step 6: Build + verifikasi manual, lalu commit**

Run: `cd web && npm run build`
Expected: build sukses.

Verifikasi manual (`npm run dev`, buka `/`): klik toggle, pastikan class `dark` muncul/hilang di `<html>` dan warna background/teks berubah sesuai token Task 1. Cek juga tidak ada flash warna salah saat reload (berkat `suppressHydrationWarning` + `next-themes` blocking script).

```bash
git add web/package.json web/package-lock.json web/src/components/theme-provider.tsx web/src/components/theme-toggle.tsx web/src/app/layout.tsx web/src/components/site-header.tsx
git commit -m "feat(web): toggle dark/light mode pakai next-themes"
```

---

## Task 3: Query katalog publik

**Files:**
- Create: `web/src/lib/catalog/public.ts`
- Test: `web/tests/catalog-public.test.ts`

**Interfaces:**
- Produces:
  - `isItemPurchasable(providerSkus: { provider: ProviderKey; status: "ACTIVE" | "UNAVAILABLE" }[]): boolean` — pure, dipakai Task 4 & fungsi query di bawah.
  - `getActiveCategories(): Promise<{ id: string; slug: string; name: string }[]>`
  - `getProductForCheckout(categorySlug: string, productSlug: string): Promise<ProductForCheckout | null>` dengan tipe:
    ```ts
    export interface ProductForCheckout {
      id: string; slug: string; name: string; publisher: string | null; banner: string | null;
      inputFields: { name: string; label: string }[];
      items: { id: string; name: string; sellingPrice: bigint; memberPrice: bigint; purchasable: boolean }[];
    }
    ```
- Consumes: `db` dari `@/lib/db`.

`isItemPurchasable` HANYA true kalau ada minimal satu `ProviderSku` dengan `provider === "DIGIFLAZZ"` dan `status === "ACTIVE"` — Fase 3 baru punya 1 adapter (Digiflazz), jadi ini secara efektif = "ada mapping Digiflazz aktif". Konsisten dengan `registry.ts` yang cuma mendukung `DIGIFLAZZ` (provider lain sengaja belum, menyusul Fase 5).

- [ ] **Step 1: Tulis test untuk `isItemPurchasable` (akan gagal — fungsi belum ada)**

Buat `web/tests/catalog-public.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isItemPurchasable } from "@/lib/catalog/public";

describe("isItemPurchasable", () => {
  it("true kalau ada ProviderSku DIGIFLAZZ berstatus ACTIVE", () => {
    expect(isItemPurchasable([{ provider: "DIGIFLAZZ", status: "ACTIVE" }])).toBe(true);
  });

  it("false kalau DIGIFLAZZ ada tapi UNAVAILABLE", () => {
    expect(isItemPurchasable([{ provider: "DIGIFLAZZ", status: "UNAVAILABLE" }])).toBe(false);
  });

  it("false kalau tidak ada mapping DIGIFLAZZ sama sekali", () => {
    expect(isItemPurchasable([])).toBe(false);
    expect(isItemPurchasable([{ provider: "OKECONNECT", status: "ACTIVE" } as never])).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd web && npx vitest run tests/catalog-public.test.ts`
Expected: FAIL — `Cannot find module '@/lib/catalog/public'`.

- [ ] **Step 3: Buat `web/src/lib/catalog/public.ts`**

```ts
import { db } from "@/lib/db";
import type { ProviderKey, ProviderSkuStatus } from "@prisma/client";

export function isItemPurchasable(
  providerSkus: { provider: ProviderKey; status: ProviderSkuStatus }[],
): boolean {
  return providerSkus.some((s) => s.provider === "DIGIFLAZZ" && s.status === "ACTIVE");
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
  const product = await db.product.findFirst({
    where: { slug: productSlug, isActive: true, category: { slug: categorySlug } },
    include: {
      items: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: { providerSkus: { select: { provider: true, status: true } } },
      },
    },
  });
  if (!product) return null;

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
      purchasable: isItemPurchasable(item.providerSkus),
    })),
  };
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd web && npx vitest run tests/catalog-public.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/catalog/public.ts web/tests/catalog-public.test.ts
git commit -m "feat(web): query katalog publik untuk halaman detail produk"
```

---

## Task 4: Halaman detail produk (tampilan + pilihan, belum submit)

**Files:**
- Create: `web/src/app/(public)/[categorySlug]/[productSlug]/page.tsx`
- Create: `web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx`

**Interfaces:**
- Consumes: `getProductForCheckout` (Task 3), `Product`/`ProductItem` shape via `ProductForCheckout`.
- Produces: komponen `ProductDetailClient` dengan props `{ product: ProductForCheckout }` — menyimpan state `selectedItemId` + form input target dinamis dari `inputFields`. Form-nya di sini BELUM terhubung ke server action (itu Task 10) — tapi struktur `<form>` + `name` field HARUS sudah final (`productItemId`, `target.<fieldName>`, `buyerEmail`) supaya Task 10 tinggal nyambungin `action`.

- [ ] **Step 1: Buat halaman Server Component**

`web/src/app/(public)/[categorySlug]/[productSlug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
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

  return <ProductDetailClient product={product} />;
}
```

- [ ] **Step 2: Buat komponen client dengan form (belum terhubung action)**

`web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductForCheckout } from "@/lib/catalog/public";

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

export function ProductDetailClient({ product }: { product: ProductForCheckout }) {
  const purchasableItems = product.items.filter((i) => i.purchasable);
  const [selectedItemId, setSelectedItemId] = useState(purchasableItems[0]?.id ?? "");

  if (purchasableItems.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border bg-card p-6 text-center text-muted-foreground">
        {product.name} sedang tidak tersedia untuk dibeli saat ini.
      </div>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <h1 className="font-heading text-2xl font-bold text-balance">{product.name}</h1>
        {product.publisher && <p className="mt-1 text-sm text-muted-foreground">{product.publisher}</p>}
      </div>

      <form className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-5">
        <input type="hidden" name="productItemId" value={selectedItemId} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="item-select">Pilih Nominal</Label>
          <select
            id="item-select"
            className="rounded-md border bg-background px-3 py-2 text-sm"
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

        {product.inputFields.map((field) => (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={`target-${field.name}`}>{field.label}</Label>
            <Input id={`target-${field.name}`} name={`target.${field.name}`} required />
          </div>
        ))}

        <div className="flex flex-col gap-2">
          <Label htmlFor="buyerEmail">Email (untuk invoice)</Label>
          <Input id="buyerEmail" name="buyerEmail" type="email" required />
        </div>

        <Button type="submit" className="font-heading">
          Beli Sekarang
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Build + verifikasi manual**

Run: `cd web && npm run build`
Expected: build sukses. Buka `/games/mobile-legends` (slug dari seed Fase 1) di `npm run dev`, pastikan form tampil dengan field User ID + Zone ID.

- [ ] **Step 4: Commit**

```bash
git add "web/src/app/(public)/[categorySlug]/[productSlug]"
git commit -m "feat(web): halaman detail produk publik (tampilan + pilihan item)"
```

---

## Task 5: Pure helpers order (nomor order, ref-id, customer-no, pilih provider)

**Files:**
- Create: `web/src/lib/order/order-number.ts`
- Create: `web/src/lib/order/customer-no.ts`
- Create: `web/src/lib/order/select-provider.ts`
- Test: `web/tests/order-helpers.test.ts`

**Interfaces:**
- Produces:
  - `generateOrderNumber(now: Date, random: () => number): string` → format `INV-YYYYMMDD-XXXX` (XXXX = 4 digit dari random).
  - `generateRefId(prefix: string, now: Date, random: () => number): string` → format `${prefix}-YYYYMMDDHHmmss-XXXXXX` (6 karakter alfanumerik uppercase dari random), dipakai untuk `OrderFulfillment.ourRefId`.
  - `buildCustomerNo(inputFields: { name: string }[], target: Record<string, string>): string` → gabungkan value target sesuai urutan `inputFields`, tanpa separator (contoh spec §5.2: userid `123456789` + zoneid `1234` → `1234567891234`).
  - `selectFulfillmentSku(item: { sellingPrice: bigint }, skus: { provider: ProviderKey; providerSkuCode: string; costPrice: bigint; status: ProviderSkuStatus }[]): SelectSkuResult` dengan:
    ```ts
    export type SelectSkuResult =
      | { ok: true; sku: { provider: ProviderKey; providerSkuCode: string; costPrice: bigint } }
      | { ok: false; reason: "no_provider" | "price_increased" };
    ```
    Fase 3 cuma punya adapter Digiflazz (routing multi-provider = Fase 6) — fungsi ini cari SKU `DIGIFLAZZ` yang `status: "ACTIVE"`; kalau tidak ada → `no_provider`; kalau `costPrice > sellingPrice` (harga modal naik setelah checkout) → `price_increased` (guard rail spec §5.5 poin 5, WAJIB sejak fase 1 per §7 edge case #3).

- [ ] **Step 1: Tulis semua test (akan gagal — modul belum ada)**

Buat `web/tests/order-helpers.test.ts`:

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

  it("pilih SKU DIGIFLAZZ yang ACTIVE", () => {
    const result = selectFulfillmentSku(item, [
      { provider: "DIGIFLAZZ", providerSkuCode: "ML86", costPrice: 19750n, status: "ACTIVE" },
    ]);
    expect(result).toEqual({
      ok: true,
      sku: { provider: "DIGIFLAZZ", providerSkuCode: "ML86", costPrice: 19750n },
    });
  });

  it("tidak ada SKU DIGIFLAZZ ACTIVE → no_provider", () => {
    expect(selectFulfillmentSku(item, [])).toEqual({ ok: false, reason: "no_provider" });
    expect(
      selectFulfillmentSku(item, [
        { provider: "DIGIFLAZZ", providerSkuCode: "ML86", costPrice: 19750n, status: "UNAVAILABLE" },
      ]),
    ).toEqual({ ok: false, reason: "no_provider" });
  });

  it("costPrice > sellingPrice (harga modal naik) → price_increased", () => {
    const result = selectFulfillmentSku(item, [
      { provider: "DIGIFLAZZ", providerSkuCode: "ML86", costPrice: 25000n, status: "ACTIVE" },
    ]);
    expect(result).toEqual({ ok: false, reason: "price_increased" });
  });

  it("provider selain DIGIFLAZZ diabaikan (belum ada adapter di Fase 3)", () => {
    const result = selectFulfillmentSku(item, [
      { provider: "OKECONNECT", providerSkuCode: "X", costPrice: 15000n, status: "ACTIVE" },
    ]);
    expect(result).toEqual({ ok: false, reason: "no_provider" });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd web && npx vitest run tests/order-helpers.test.ts`
Expected: FAIL — modul-modul belum ada.

- [ ] **Step 3: Implementasi `web/src/lib/order/order-number.ts`**

```ts
export function generateOrderNumber(now: Date, random: () => number = Math.random): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const suffix = Math.floor(random() * 10000)
    .toString()
    .padStart(4, "0");
  return `INV-${y}${m}${d}-${suffix}`;
}

export function generateRefId(prefix: string, now: Date, random: () => number = Math.random): string {
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

- [ ] **Step 4: Implementasi `web/src/lib/order/customer-no.ts`**

```ts
export function buildCustomerNo(inputFields: { name: string }[], target: Record<string, string>): string {
  return inputFields.map((f) => target[f.name] ?? "").join("");
}
```

- [ ] **Step 5: Implementasi `web/src/lib/order/select-provider.ts`**

```ts
import type { ProviderKey, ProviderSkuStatus } from "@prisma/client";

export type SelectSkuResult =
  | { ok: true; sku: { provider: ProviderKey; providerSkuCode: string; costPrice: bigint } }
  | { ok: false; reason: "no_provider" | "price_increased" };

export function selectFulfillmentSku(
  item: { sellingPrice: bigint },
  skus: { provider: ProviderKey; providerSkuCode: string; costPrice: bigint; status: ProviderSkuStatus }[],
): SelectSkuResult {
  const digiflazz = skus.find((s) => s.provider === "DIGIFLAZZ" && s.status === "ACTIVE");
  if (!digiflazz) return { ok: false, reason: "no_provider" };
  if (digiflazz.costPrice > item.sellingPrice) return { ok: false, reason: "price_increased" };
  return {
    ok: true,
    sku: { provider: digiflazz.provider, providerSkuCode: digiflazz.providerSkuCode, costPrice: digiflazz.costPrice },
  };
}
```

- [ ] **Step 6: Jalankan test, pastikan lulus**

Run: `cd web && npx vitest run tests/order-helpers.test.ts`
Expected: PASS (semua test).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/order/order-number.ts web/src/lib/order/customer-no.ts web/src/lib/order/select-provider.ts web/tests/order-helpers.test.ts
git commit -m "feat(web): pure helpers order (nomor order, ref-id, customer-no, pilih provider)"
```

---

## Task 6: Midtrans client (charge QRIS, signature, status mapping)

**Files:**
- Create: `web/src/lib/midtrans/signature.ts`
- Create: `web/src/lib/midtrans/status-mapping.ts`
- Create: `web/src/lib/midtrans/client.ts`
- Modify: `web/.env.example`
- Test: `web/tests/midtrans-signature.test.ts`, `web/tests/midtrans-status-mapping.test.ts`, `web/tests/midtrans-client.test.ts`

**Interfaces:**
- Produces:
  - `computeMidtransSignature(orderId: string, statusCode: string, grossAmount: string, serverKey: string): string` (sha512 hex).
  - `verifyMidtransSignature(notif: { order_id: string; status_code: string; gross_amount: string; signature_key: string }, serverKey: string): boolean`.
  - `mapMidtransStatus(transactionStatus: string, fraudStatus?: string): "paid" | "pending" | "failed" | "expired"`.
  - `chargeQris(input: { orderId: string; grossAmount: number }, creds?: MidtransCreds): Promise<MidtransChargeResult>`.
  - `getTransactionStatus(orderId: string, creds?: MidtransCreds): Promise<MidtransStatusResult>`.
  - Tipe:
    ```ts
    export interface MidtransCreds { serverKey: string; isProduction: boolean }
    export interface MidtransChargeResult {
      transactionId: string; orderId: string; transactionStatus: string;
      qrString: string | null; expiryTime: string | null; raw: unknown;
    }
    export interface MidtransStatusResult {
      transactionId: string; orderId: string; transactionStatus: string;
      fraudStatus: string | null; grossAmount: string; statusCode: string; raw: unknown;
    }
    ```

- [ ] **Step 1: Tulis test signature (akan gagal)**

Buat `web/tests/midtrans-signature.test.ts`:

```ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeMidtransSignature, verifyMidtransSignature } from "@/lib/midtrans/signature";

describe("computeMidtransSignature", () => {
  it("sha512(order_id + status_code + gross_amount + serverKey)", () => {
    const expected = createHash("sha512").update("INV-1" + "200" + "22000.00" + "SB-key").digest("hex");
    expect(computeMidtransSignature("INV-1", "200", "22000.00", "SB-key")).toBe(expected);
  });
});

describe("verifyMidtransSignature", () => {
  const serverKey = "SB-key";
  const raw = { order_id: "INV-1", status_code: "200", gross_amount: "22000.00" };
  const validSig = computeMidtransSignature(raw.order_id, raw.status_code, raw.gross_amount, serverKey);

  it("signature cocok → true", () => {
    expect(verifyMidtransSignature({ ...raw, signature_key: validSig }, serverKey)).toBe(true);
  });

  it("signature tidak cocok → false", () => {
    expect(verifyMidtransSignature({ ...raw, signature_key: "salah" }, serverKey)).toBe(false);
  });
});
```

- [ ] **Step 2: Tulis test status mapping (akan gagal)**

Buat `web/tests/midtrans-status-mapping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapMidtransStatus } from "@/lib/midtrans/status-mapping";

describe("mapMidtransStatus", () => {
  it("settlement → paid", () => expect(mapMidtransStatus("settlement")).toBe("paid"));
  it("capture + fraud accept → paid", () => expect(mapMidtransStatus("capture", "accept")).toBe("paid"));
  it("capture + fraud challenge/deny → failed", () => expect(mapMidtransStatus("capture", "challenge")).toBe("failed"));
  it("pending → pending", () => expect(mapMidtransStatus("pending")).toBe("pending"));
  it("expire → expired", () => expect(mapMidtransStatus("expire")).toBe("expired"));
  it("cancel → failed", () => expect(mapMidtransStatus("cancel")).toBe("failed"));
  it("deny → failed", () => expect(mapMidtransStatus("deny")).toBe("failed"));
});
```

- [ ] **Step 3: Tulis test client (mock fetch, pola sama seperti `digiflazz-adapter.test.ts`) — akan gagal**

Buat `web/tests/midtrans-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { chargeQris, getTransactionStatus } from "@/lib/midtrans/client";

const creds = { serverKey: "SB-server-key", isProduction: false };

function mockFetchOnce(json: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("chargeQris", () => {
  it("POST ke sandbox /v2/charge dengan Basic Auth + payment_type qris", async () => {
    const fn = mockFetchOnce({
      status_code: "201", transaction_id: "trx-1", order_id: "INV-1",
      transaction_status: "pending", qr_string: "00020101...",
      actions: [{ name: "generate-qr-code", url: "https://x/qr" }],
      expiry_time: "2026-07-26 10:15:00",
    });

    const result = await chargeQris({ orderId: "INV-1", grossAmount: 22000 }, creds);

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://api.sandbox.midtrans.com/v2/charge");
    const req = init as RequestInit;
    expect((req.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("SB-server-key:").toString("base64")}`,
    );
    const body = JSON.parse(req.body as string);
    expect(body.payment_type).toBe("qris");
    expect(body.transaction_details).toEqual({ order_id: "INV-1", gross_amount: 22000 });

    expect(result.transactionId).toBe("trx-1");
    expect(result.qrString).toBe("00020101...");
    expect(result.transactionStatus).toBe("pending");
  });

  it("pakai base URL production kalau isProduction true", async () => {
    const fn = mockFetchOnce({
      status_code: "201", transaction_id: "t", order_id: "INV-1",
      transaction_status: "pending", qr_string: null, actions: [], expiry_time: null,
    });
    await chargeQris({ orderId: "INV-1", grossAmount: 1000 }, { serverKey: "prod-key", isProduction: true });
    expect(fn.mock.calls[0][0]).toBe("https://api.midtrans.com/v2/charge");
  });
});

describe("getTransactionStatus", () => {
  it("GET /v2/{orderId}/status", async () => {
    const fn = mockFetchOnce({
      status_code: "200", transaction_id: "trx-1", order_id: "INV-1",
      transaction_status: "settlement", fraud_status: "accept", gross_amount: "22000.00",
    });
    const result = await getTransactionStatus("INV-1", creds);
    expect(fn.mock.calls[0][0]).toBe("https://api.sandbox.midtrans.com/v2/INV-1/status");
    expect(result.transactionStatus).toBe("settlement");
    expect(result.fraudStatus).toBe("accept");
    expect(result.grossAmount).toBe("22000.00");
  });
});
```

- [ ] **Step 4: Jalankan ketiga test file, pastikan gagal**

Run: `cd web && npx vitest run tests/midtrans-signature.test.ts tests/midtrans-status-mapping.test.ts tests/midtrans-client.test.ts`
Expected: FAIL — modul-modul belum ada.

- [ ] **Step 5: Implementasi `web/src/lib/midtrans/signature.ts`**

```ts
import { createHash } from "node:crypto";

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
  return expected === notif.signature_key;
}
```

- [ ] **Step 6: Implementasi `web/src/lib/midtrans/status-mapping.ts`**

```ts
export function mapMidtransStatus(
  transactionStatus: string,
  fraudStatus?: string | null,
): "paid" | "pending" | "failed" | "expired" {
  if (transactionStatus === "settlement") return "paid";
  if (transactionStatus === "capture") return fraudStatus === "accept" ? "paid" : "failed";
  if (transactionStatus === "pending") return "pending";
  if (transactionStatus === "expire") return "expired";
  return "failed"; // cancel, deny, dan status lain yang tidak dikenal
}
```

- [ ] **Step 7: Implementasi `web/src/lib/midtrans/client.ts`**

```ts
import { z } from "zod";

export interface MidtransCreds {
  serverKey: string;
  isProduction: boolean;
}

function baseUrl(creds: MidtransCreds): string {
  return creds.isProduction ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
}

function authHeader(creds: MidtransCreds): string {
  return `Basic ${Buffer.from(`${creds.serverKey}:`).toString("base64")}`;
}

async function request(url: string, creds: MidtransCreds, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      Authorization: authHeader(creds),
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Midtrans ${url}: response bukan JSON (status ${res.status}): ${text.slice(0, 200)}`);
  }
}

const chargeSchema = z.object({
  status_code: z.string(),
  transaction_id: z.string(),
  order_id: z.string(),
  transaction_status: z.string(),
  qr_string: z.string().nullable().optional(),
  actions: z.array(z.unknown()).optional(),
  expiry_time: z.string().nullable().optional(),
});

export interface MidtransChargeResult {
  transactionId: string;
  orderId: string;
  transactionStatus: string;
  qrString: string | null;
  expiryTime: string | null;
  raw: unknown;
}

export async function chargeQris(
  input: { orderId: string; grossAmount: number },
  creds: MidtransCreds = {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  },
): Promise<MidtransChargeResult> {
  const raw = await request(`${baseUrl(creds)}/v2/charge`, creds, {
    method: "POST",
    body: JSON.stringify({
      payment_type: "qris",
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
    }),
  });
  const parsed = chargeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Midtrans charge: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
  }
  const d = parsed.data;
  return {
    transactionId: d.transaction_id,
    orderId: d.order_id,
    transactionStatus: d.transaction_status,
    qrString: d.qr_string ?? null,
    expiryTime: d.expiry_time ?? null,
    raw,
  };
}

const statusSchema = z.object({
  status_code: z.string(),
  transaction_id: z.string(),
  order_id: z.string(),
  transaction_status: z.string(),
  fraud_status: z.string().nullable().optional(),
  gross_amount: z.string(),
});

export interface MidtransStatusResult {
  transactionId: string;
  orderId: string;
  transactionStatus: string;
  fraudStatus: string | null;
  grossAmount: string;
  statusCode: string;
  raw: unknown;
}

export async function getTransactionStatus(
  orderId: string,
  creds: MidtransCreds = {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  },
): Promise<MidtransStatusResult> {
  const raw = await request(`${baseUrl(creds)}/v2/${orderId}/status`, creds, { method: "GET" });
  const parsed = statusSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Midtrans status: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
  }
  const d = parsed.data;
  return {
    transactionId: d.transaction_id,
    orderId: d.order_id,
    transactionStatus: d.transaction_status,
    fraudStatus: d.fraud_status ?? null,
    grossAmount: d.gross_amount,
    statusCode: d.status_code,
    raw,
  };
}
```

- [ ] **Step 8: Jalankan ketiga test file, pastikan lulus**

Run: `cd web && npx vitest run tests/midtrans-signature.test.ts tests/midtrans-status-mapping.test.ts tests/midtrans-client.test.ts`
Expected: PASS (semua test).

- [ ] **Step 9: Tambah environment variable Midtrans ke `.env.example`**

Modify `web/.env.example`, tambah baris:

```
MIDTRANS_SERVER_KEY="isi-server-key-sandbox-dari-dashboard-midtrans"
MIDTRANS_IS_PRODUCTION="false"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

- [ ] **Step 10: Commit**

```bash
git add web/src/lib/midtrans web/tests/midtrans-*.test.ts web/.env.example
git commit -m "feat(web): Midtrans client (charge QRIS, cek status, verifikasi signature)"
```

---

## Task 7: Fulfillment core (dispatch ke Digiflazz + apply hasil)

**Files:**
- Create: `web/src/lib/order/fulfillment.ts`

**Interfaces:**
- Consumes: `getAdapter` dari `@/lib/providers/registry` (Fase 2), `selectFulfillmentSku` (Task 5), `buildCustomerNo` (Task 5), `generateRefId` (Task 5), `db` dari `@/lib/db`.
- Produces:
  - `dispatchFulfillment(orderId: string): Promise<void>` — idempotent (no-op kalau `order.status !== "PAID"`).
  - `applyFulfillmentResult(fulfillmentId: string, result: ProviderTrxResult): Promise<void>` — idempotent (no-op kalau fulfillment sudah `SUCCESS`/`FAILED`), dipakai baik oleh `dispatchFulfillment` maupun job `recheck-fulfillment` (Task 8).

Ini task orkestrasi DB — TIDAK di-unit-test dengan DB mock (ikut pola Fase 2: `runPriceSync` juga tidak di-unit-test, cuma `diffPriceList`-nya). Diverifikasi manual di Task 13.

- [ ] **Step 1: Implementasi `web/src/lib/order/fulfillment.ts`**

```ts
import { db } from "@/lib/db";
import { getAdapter } from "@/lib/providers/registry";
import type { ProviderTrxResult } from "@/lib/providers/types";
import { buildCustomerNo } from "@/lib/order/customer-no";
import { generateRefId } from "@/lib/order/order-number";
import { selectFulfillmentSku } from "@/lib/order/select-provider";

export async function dispatchFulfillment(orderId: string): Promise<void> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "PAID") return; // sudah diproses / bukan giliran fulfillment

  const item = await db.productItem.findUniqueOrThrow({
    where: { id: order.productItemId! },
    include: { providerSkus: true, product: true },
  });

  await db.order.update({ where: { id: order.id }, data: { status: "PROCESSING" } });
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
  const adapter = await getAdapter(decision.sku.provider);
  const result = await adapter.createTransaction({
    skuCode: decision.sku.providerSkuCode,
    target,
    refId: ourRefId,
  });
  await applyFulfillmentResult(fulfillment.id, result);

  if (result.status === "pending") {
    await db.job.create({
      data: {
        type: "recheck-fulfillment",
        payload: { fulfillmentId: fulfillment.id, attempt: 1 },
        runAt: new Date(Date.now() + 60_000),
      },
    });
  }
}

export async function applyFulfillmentResult(fulfillmentId: string, result: ProviderTrxResult): Promise<void> {
  const fulfillment = await db.orderFulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
  if (fulfillment.status === "SUCCESS" || fulfillment.status === "FAILED") return; // sudah final, idempotent

  const status = result.status === "success" ? "SUCCESS" : result.status === "failed" ? "FAILED" : "PROCESSING";
  await db.orderFulfillment.update({
    where: { id: fulfillmentId },
    data: { status, sn: result.sn, message: result.message, rawCallback: result.raw as object },
  });

  if (status === "SUCCESS") {
    await db.order.update({
      where: { id: fulfillment.orderId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await db.orderStatusHistory.create({
      data: { orderId: fulfillment.orderId, toStatus: "COMPLETED", note: `SN: ${result.sn ?? "-"}` },
    });
  } else if (status === "FAILED") {
    // Fase 3 cuma 1 provider (Digiflazz) — tidak ada fallback provider lain (itu Fase 6).
    // Guest checkout → refund_pending (antrean manual admin), sesuai spec §7.
    await db.order.update({ where: { id: fulfillment.orderId }, data: { status: "REFUND_PENDING" } });
    await db.orderStatusHistory.create({
      data: { orderId: fulfillment.orderId, toStatus: "REFUND_PENDING", note: result.message },
    });
  }
}
```

- [ ] **Step 2: Build untuk pastikan tipe cocok**

Run: `cd web && npx tsc --noEmit`
Expected: bersih, tidak ada error TypeScript.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/order/fulfillment.ts
git commit -m "feat(web): dispatch fulfillment ke Digiflazz + apply hasil (idempotent)"
```

---

## Task 8: Job handler baru — `expire-order` & `recheck-fulfillment`

**Files:**
- Modify: `web/src/lib/jobs/runner.ts`
- Test: `web/tests/jobs-order-handlers.test.ts`

**Interfaces:**
- Consumes: `applyFulfillmentResult` (Task 7), `getAdapter` (Fase 2), `db`.
- Produces: 2 entri baru di object `handlers` — `"expire-order"` dan `"recheck-fulfillment"` — mengikuti signature `JobHandler = (payload: unknown) => Promise<string | void>` yang sudah ada.

Handler ini menyentuh DB — test yang ditulis di sini HANYA menguji bagian yang bisa diisolasi murni (pola matching status per attempt), bukan full DB roundtrip (ikut batasan Global Constraints). Untuk logic penuhnya, verifikasi manual di Task 13.

- [ ] **Step 1: Tulis test untuk keputusan lanjut/berhenti recheck (fungsi pure kecil yang diekstrak dari handler)**

Buat `web/tests/jobs-order-handlers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shouldEscalateRecheck } from "@/lib/jobs/runner";

describe("shouldEscalateRecheck", () => {
  it("attempt < 30 dan masih pending → belum eskalasi", () => {
    expect(shouldEscalateRecheck(29, "pending")).toBe(false);
  });
  it("attempt >= 30 dan masih pending → eskalasi", () => {
    expect(shouldEscalateRecheck(30, "pending")).toBe(true);
  });
  it("status sudah final (success/failed) → tidak pernah eskalasi (sudah selesai)", () => {
    expect(shouldEscalateRecheck(50, "success")).toBe(false);
    expect(shouldEscalateRecheck(50, "failed")).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd web && npx vitest run tests/jobs-order-handlers.test.ts`
Expected: FAIL — `shouldEscalateRecheck` belum di-export dari `runner.ts`.

- [ ] **Step 3: Tambah `shouldEscalateRecheck` + 2 handler baru di `web/src/lib/jobs/runner.ts`**

Tambahkan import di bagian atas file (setelah import yang sudah ada):

```ts
import { applyFulfillmentResult } from "@/lib/order/fulfillment";
import { getAdapter } from "@/lib/providers/registry";
import { buildCustomerNo } from "@/lib/order/customer-no";
```

Tambahkan fungsi pure baru (letakkan dekat `computeBackoff`/`decideAfterFailure` yang sudah ada):

```ts
export function shouldEscalateRecheck(attempt: number, status: "success" | "pending" | "failed"): boolean {
  if (status !== "pending") return false;
  return attempt >= 30;
}
```

Tambahkan 2 entri baru ke object `handlers` (di dalam blok yang sudah berisi `"sync-prices"`):

```ts
  "expire-order": async (payload) => {
    const { orderId } = payload as { orderId: string };
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== "PENDING_PAYMENT") return "no-op: status sudah berubah";
    if (order.expiredAt && order.expiredAt > new Date()) return "no-op: belum jatuh tempo";

    const claimed = await db.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { status: "EXPIRED" },
    });
    if (claimed.count === 0) return "no-op: sudah diklaim proses lain";

    await db.orderPayment.updateMany({ where: { orderId: order.id }, data: { status: "EXPIRED" } });
    await db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "EXPIRED", note: "Auto-expire cron" },
    });
    return "expired";
  },

  "recheck-fulfillment": async (payload) => {
    const { fulfillmentId, attempt } = payload as { fulfillmentId: string; attempt: number };
    const fulfillment = await db.orderFulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
    if (fulfillment.status !== "SENT" && fulfillment.status !== "PROCESSING") {
      return "no-op: fulfillment sudah final";
    }

    const order = await db.order.findUniqueOrThrow({ where: { id: fulfillment.orderId } });
    const item = await db.productItem.findUniqueOrThrow({
      where: { id: order.productItemId! },
      include: { product: true },
    });
    const target = buildCustomerNo(
      item.product.inputFields as { name: string }[],
      order.target as Record<string, string>,
    );

    const adapter = await getAdapter(fulfillment.provider);
    const result = await adapter.checkStatus({
      skuCode: fulfillment.providerSkuCode,
      target,
      refId: fulfillment.ourRefId,
    });
    await applyFulfillmentResult(fulfillment.id, result);

    if (shouldEscalateRecheck(attempt, result.status)) {
      await db.order.update({ where: { id: order.id }, data: { status: "NEEDS_REVIEW" } });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, toStatus: "NEEDS_REVIEW", note: "Eskalasi: 30x recheck tanpa hasil final" },
      });
      return "escalated";
    }
    if (result.status === "pending") {
      await db.job.create({
        data: {
          type: "recheck-fulfillment",
          payload: { fulfillmentId, attempt: attempt + 1 },
          runAt: new Date(Date.now() + 60_000),
        },
      });
      return `still-pending attempt=${attempt}`;
    }
    return "resolved";
  },
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd web && npx vitest run tests/jobs-order-handlers.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Jalankan seluruh test suite untuk pastikan tidak ada regresi**

Run: `cd web && npx vitest run`
Expected: semua test PASS, termasuk `jobs-runner.test.ts` yang sudah ada.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/jobs/runner.ts web/tests/jobs-order-handlers.test.ts
git commit -m "feat(web): job handler expire-order & recheck-fulfillment"
```

---

## Task 9: Validasi checkout + server action `createCheckoutOrder`

**Files:**
- Create: `web/src/lib/validation/checkout.ts`
- Create: `web/src/app/actions/checkout.ts`
- Test: `web/tests/validation-checkout.test.ts`

**Interfaces:**
- Produces:
  - `checkoutSchema` (Zod) — validasi `productItemId`, `buyerEmail`, `target` (record string→string non-kosong).
  - `extractTargetFromFormData(formData: FormData): Record<string, string>` — ambil semua field `target.<nama>` dari FormData.
  - `createCheckoutOrder(formData: FormData): Promise<{ ok?: string; error?: string; orderNumber?: string }>` (server action, `"use server"`).
- Consumes: `getProductForCheckout`-style query (tapi checkout butuh raw item+providerSkus, jadi query ulang langsung di action, BUKAN reuse `ProductForCheckout` yang sudah membuang info provider detail), `selectFulfillmentSku` (Task 5), `generateOrderNumber` (Task 5), `chargeQris` (Task 6), `db`.

- [ ] **Step 1: Tulis test untuk `extractTargetFromFormData` (akan gagal)**

Buat `web/tests/validation-checkout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractTargetFromFormData, checkoutSchema } from "@/lib/validation/checkout";

describe("extractTargetFromFormData", () => {
  it("ambil semua field target.* dari FormData, buang prefix", () => {
    const fd = new FormData();
    fd.set("productItemId", "item-1");
    fd.set("target.user_id", "123456789");
    fd.set("target.zone_id", "1234");
    fd.set("buyerEmail", "a@b.com");

    expect(extractTargetFromFormData(fd)).toEqual({ user_id: "123456789", zone_id: "1234" });
  });
});

describe("checkoutSchema", () => {
  it("valid kalau productItemId ada, email valid, target minimal 1 field", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target: { user_id: "123456789" },
    });
    expect(result.success).toBe(true);
  });

  it("gagal kalau email tidak valid", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "bukan-email",
      target: { user_id: "123" },
    });
    expect(result.success).toBe(false);
  });

  it("gagal kalau ada field target kosong", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target: { user_id: "" },
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd web && npx vitest run tests/validation-checkout.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi `web/src/lib/validation/checkout.ts`**

```ts
import { z } from "zod";

export const checkoutSchema = z.object({
  productItemId: z.string().min(1, "Item wajib dipilih"),
  buyerEmail: z.string().email("Email tidak valid"),
  target: z.record(z.string(), z.string().min(1, "Wajib diisi")),
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

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd web && npx vitest run tests/validation-checkout.test.ts`
Expected: PASS (semua test).

- [ ] **Step 5: Implementasi server action `web/src/app/actions/checkout.ts`**

```ts
"use server";

import { db } from "@/lib/db";
import { checkoutSchema, extractTargetFromFormData } from "@/lib/validation/checkout";
import { generateOrderNumber } from "@/lib/order/order-number";
import { selectFulfillmentSku } from "@/lib/order/select-provider";
import { chargeQris } from "@/lib/midtrans/client";

const EXPIRY_MINUTES = 15;

export interface CheckoutResult {
  ok?: string;
  error?: string;
  orderNumber?: string;
}

export async function createCheckoutOrder(formData: FormData): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse({
    productItemId: formData.get("productItemId"),
    buyerEmail: formData.get("buyerEmail"),
    target: extractTargetFromFormData(formData),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const item = await db.productItem.findUnique({
    where: { id: parsed.data.productItemId, isActive: true },
    include: { product: true, providerSkus: true },
  });
  if (!item || !item.product.isActive) return { error: "Produk tidak ditemukan atau tidak aktif." };

  const decision = selectFulfillmentSku({ sellingPrice: item.sellingPrice }, item.providerSkus);
  if (!decision.ok) return { error: "Item ini sedang tidak tersedia untuk dibeli, coba lagi nanti." };

  const now = new Date();
  const orderNumber = generateOrderNumber(now);
  const expiredAt = new Date(now.getTime() + EXPIRY_MINUTES * 60_000);

  const order = await db.order.create({
    data: {
      orderNumber,
      status: "PENDING_PAYMENT",
      productItemId: item.id,
      productName: item.product.name,
      itemName: item.name,
      target: parsed.data.target,
      buyerEmail: parsed.data.buyerEmail,
      paidVia: "MIDTRANS",
      sellingPrice: item.sellingPrice,
      total: item.sellingPrice,
      expiredAt,
      payment: { create: { method: "qris", status: "PENDING", expiredAt } },
    },
  });
  await db.orderStatusHistory.create({
    data: { orderId: order.id, toStatus: "PENDING_PAYMENT", note: "Checkout guest" },
  });

  try {
    const charge = await chargeQris({ orderId: order.orderNumber, grossAmount: Number(item.sellingPrice) });
    await db.orderPayment.update({
      where: { orderId: order.id },
      data: {
        paymentRef: charge.transactionId,
        actions: { qrString: charge.qrString },
        rawResponse: charge.raw as object,
      },
    });
  } catch (e) {
    await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    await db.orderPayment.update({ where: { orderId: order.id }, data: { status: "FAILED" } });
    await db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "FAILED", note: "Charge Midtrans gagal" },
    });
    return { error: e instanceof Error ? e.message : "Gagal membuat pembayaran, coba lagi." };
  }

  await db.job.create({
    data: { type: "expire-order", payload: { orderId: order.id }, runAt: expiredAt },
  });

  return { ok: "Order dibuat.", orderNumber: order.orderNumber };
}
```

- [ ] **Step 6: Build untuk pastikan tipe cocok**

Run: `cd web && npx tsc --noEmit`
Expected: bersih.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/validation/checkout.ts web/src/app/actions/checkout.ts web/tests/validation-checkout.test.ts
git commit -m "feat(web): validasi checkout + server action createCheckoutOrder"
```

---

## Task 10: Sambungkan form checkout ke server action + redirect invoice

**Files:**
- Modify: `web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx`

**Interfaces:**
- Consumes: `createCheckoutOrder` (Task 9).

- [ ] **Step 1: Ubah `product-detail-client.tsx` — pakai `useActionState` (pola sama seperti `test-transaction-form.tsx` Fase 2) + redirect ke invoice saat sukses**

Modify `web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx` — tambah import dan ubah bagian form:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCheckoutOrder, type CheckoutResult } from "@/app/actions/checkout";
import type { ProductForCheckout } from "@/lib/catalog/public";

const INITIAL_STATE: CheckoutResult = {};

function withPrevState(action: typeof createCheckoutOrder) {
  return (_prev: CheckoutResult, formData: FormData) => action(formData);
}
```

Di dalam komponen `ProductDetailClient`, tambah setelah `useState(purchasableItems[0]?.id ?? "")`:

```tsx
  const router = useRouter();
  const [state, formAction, pending] = useActionState(withPrevState(createCheckoutOrder), INITIAL_STATE);

  useEffect(() => {
    if (state.orderNumber) router.push(`/invoice/${state.orderNumber}`);
  }, [state.orderNumber, router]);
```

Ubah tag `<form ...>` jadi pakai `action={formAction}`, dan tambahkan tampilan error + disable saat pending di bawah tombol submit:

```tsx
      <form action={formAction} className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-5">
```

```tsx
        {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
        <Button type="submit" disabled={pending} className="font-heading">
          {pending ? "Memproses..." : "Beli Sekarang"}
        </Button>
```

- [ ] **Step 2: Build + verifikasi manual**

Run: `cd web && npm run build`
Expected: build sukses.

Verifikasi manual (`npm run dev`): buka halaman produk, isi form, submit — pastikan redirect ke `/invoice/INV-...` (halaman invoice belum ada sampai Task 12, jadi untuk sekarang cukup pastikan redirect terjadi / 404 sementara wajar).

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx"
git commit -m "feat(web): sambungkan form checkout ke server action, redirect ke invoice"
```

---

## Task 11: Webhook Midtrans

**Files:**
- Create: `web/src/app/api/webhooks/midtrans/route.ts`

**Interfaces:**
- Consumes: `verifyMidtransSignature`, `getTransactionStatus`, `mapMidtransStatus` (Task 6), `dispatchFulfillment` (Task 7), `db`.

Orkestrasi DB+network — verifikasi manual di Task 13 (sandbox Midtrans beneran bisa kirim notifikasi ke webhook via ngrok/tunnel, atau simulasi `curl` manual dengan signature valid).

- [ ] **Step 1: Implementasi `web/src/app/api/webhooks/midtrans/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
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

export async function POST(request: Request) {
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
  const alreadyProcessed = await db.webhookEvent.findUnique({ where: { eventKey } });
  if (alreadyProcessed) return NextResponse.json({ ok: true, deduped: true });

  await db.webhookEvent.create({
    data: {
      source: "midtrans",
      externalRef: notif.order_id,
      eventKey,
      rawBody,
      headers: Object.fromEntries(request.headers),
    },
  });

  const markProcessed = (result: string) =>
    db.webhookEvent.update({ where: { eventKey }, data: { processedAt: new Date(), processResult: result } });

  if (!verifyMidtransSignature(notif, process.env.MIDTRANS_SERVER_KEY ?? "")) {
    await markProcessed("signature_invalid");
    return NextResponse.json({ error: "Signature tidak valid" }, { status: 403 });
  }

  const order = await db.order.findUnique({ where: { orderNumber: notif.order_id } });
  if (!order) {
    await markProcessed("order_not_found");
    return NextResponse.json({ ok: true });
  }

  // Best practice Midtrans: konfirmasi ulang via GET status, jangan percaya body notifikasi mentah (spec §6)
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

  await markProcessed(mapped);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Build untuk pastikan tipe cocok**

Run: `cd web && npx tsc --noEmit`
Expected: bersih.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/webhooks/midtrans/route.ts
git commit -m "feat(web): webhook Midtrans (verifikasi signature, idempotent, trigger fulfillment)"
```

---

## Task 12: Halaman invoice + polling status (TanStack Query)

**Files:**
- Create: `web/src/app/api/orders/[orderNumber]/status/route.ts`
- Create: `web/src/components/query-provider.tsx`
- Create: `web/src/app/invoice/[orderNumber]/page.tsx`
- Create: `web/src/app/invoice/[orderNumber]/invoice-status.tsx`
- Modify: `web/src/app/layout.tsx`
- Modify: `web/package.json` (dependency baru)

**Interfaces:**
- Produces: GET `/api/orders/[orderNumber]/status` → JSON `{ orderNumber, status, productName, itemName, total, qrString, expiredAt, sn }`.

- [ ] **Step 1: Install `@tanstack/react-query`**

Run: `cd web && npm install @tanstack/react-query`

- [ ] **Step 2: Buat API route status**

`web/src/app/api/orders/[orderNumber]/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: {
      payment: true,
      fulfillments: { orderBy: { attemptNo: "desc" }, take: 1 },
    },
  });
  if (!order) return NextResponse.json({ error: "Order tidak ditemukan" }, { status: 404 });

  const latestFulfillment = order.fulfillments[0];
  const actions = order.payment?.actions as { qrString?: string } | null;

  return NextResponse.json({
    orderNumber: order.orderNumber,
    status: order.status,
    productName: order.productName,
    itemName: order.itemName,
    total: order.total.toString(),
    qrString: actions?.qrString ?? null,
    expiredAt: order.expiredAt,
    sn: latestFulfillment?.status === "SUCCESS" ? latestFulfillment.sn : null,
  });
}
```

- [ ] **Step 3: Buat `QueryProvider` dan pasang di root layout**

`web/src/components/query-provider.tsx`:

```tsx
"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Modify `web/src/app/layout.tsx` — bungkus di dalam `ThemeProvider`:

```tsx
import { QueryProvider } from "@/components/query-provider";
```

```tsx
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
```

- [ ] **Step 4: Buat komponen client polling**

`web/src/app/invoice/[orderNumber]/invoice-status.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

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

export function InvoiceStatus({
  orderNumber,
  initial,
}: {
  orderNumber: string;
  initial: OrderStatusResponse;
}) {
  const { data } = useQuery<OrderStatusResponse>({
    queryKey: ["order-status", orderNumber],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderNumber}/status`);
      if (!res.ok) throw new Error("Gagal memuat status order");
      return res.json();
    },
    initialData: initial,
    refetchInterval: (query) => (FINAL_STATUSES.includes(query.state.data?.status ?? "") ? false : 3000),
  });

  const order = data ?? initial;

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm text-muted-foreground">{order.orderNumber}</span>
        <Badge variant={STATUS_VARIANT[order.status] ?? "muted"}>{STATUS_LABEL[order.status] ?? order.status}</Badge>
      </div>
      <p className="font-heading text-lg font-bold text-balance">
        {order.productName} · {order.itemName}
      </p>
      <p className="font-heading text-2xl font-bold">
        {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
          Number(order.total),
        )}
      </p>

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
        <div className="rounded-md border bg-success p-4 text-success-foreground">
          <p className="text-sm font-medium">Serial Number / Voucher:</p>
          <p className="font-mono text-lg font-bold">{order.sn}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Buat halaman Server Component**

`web/src/app/invoice/[orderNumber]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { InvoiceStatus } from "./invoice-status";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: { payment: true, fulfillments: { orderBy: { attemptNo: "desc" }, take: 1 } },
  });
  if (!order) notFound();

  const actions = order.payment?.actions as { qrString?: string } | null;
  const latestFulfillment = order.fulfillments[0];

  return (
    <div className="mx-auto max-w-md">
      <InvoiceStatus
        orderNumber={order.orderNumber}
        initial={{
          orderNumber: order.orderNumber,
          status: order.status,
          productName: order.productName,
          itemName: order.itemName,
          total: order.total.toString(),
          qrString: actions?.qrString ?? null,
          expiredAt: order.expiredAt?.toISOString() ?? null,
          sn: latestFulfillment?.status === "SUCCESS" ? latestFulfillment.sn : null,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 6: Build + verifikasi manual**

Run: `cd web && npm run build`
Expected: build sukses.

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/package-lock.json web/src/app/api/orders web/src/components/query-provider.tsx web/src/app/invoice web/src/app/layout.tsx
git commit -m "feat(web): halaman invoice dengan polling status (TanStack Query)"
```

---

## Task 13: Verifikasi akhir end-to-end (DoD Fase 3)

**Files:** tidak ada file baru — task verifikasi manual, pola sama seperti Task 14 Fase 2.

- [ ] **Step 1: Jalankan seluruh automated check**

Run: `cd web && npx vitest run`
Expected: semua test PASS (termasuk semua test baru Task 3, 5, 6, 8, 9).

Run: `cd web && npx tsc --noEmit`
Expected: bersih.

Run: `cd web && npm run lint`
Expected: bersih.

Run: `cd web && npm run build`
Expected: build sukses, semua route baru ter-generate (`/[categorySlug]/[productSlug]`, `/invoice/[orderNumber]`, `/api/webhooks/midtrans`, `/api/orders/[orderNumber]/status`).

- [ ] **Step 2: Isi kredensial sandbox Midtrans**

Tambah ke `web/.env` (bukan `.env.example`): `MIDTRANS_SERVER_KEY` (server key SANDBOX dari dashboard Midtrans — dari spec §13 poin 4, aktifkan webhook URL setelah deploy pertama; untuk verifikasi lokal pakai `ngrok`/tunnel supaya Midtrans bisa mencapai `/api/webhooks/midtrans` di localhost).

- [ ] **Step 3: DoD end-to-end manual via Playwright MCP + dev server lokal**

1. `npm run dev`, buka `/games/mobile-legends` (atau slug produk seed lain).
2. Isi User ID + Zone ID + email, submit → pastikan redirect ke `/invoice/INV-...` dan QR code QRIS tampil.
3. Bayar QRIS di sandbox Midtrans (simulator sandbox atau `curl` manual ke endpoint simulasi Midtrans untuk settlement) → pastikan webhook diterima, `WebhookEvent` tercatat, `Order.status` → `PAID` → `PROCESSING`.
4. Cek `OrderFulfillment` tercatat dengan `ourRefId` unik, `provider: DIGIFLAZZ`.
5. Kalau sandbox Digiflazz balas sukses (atau `testing: true` kalau ada mekanisme testing) → `Order.status` → `COMPLETED`, SN tampil di halaman invoice tanpa reload (polling 3 detik bekerja).
6. Kalau Digiflazz balas pending → pastikan job `recheck-fulfillment` muncul di tabel `Job` dengan `runAt` +60 detik, dan `POST /api/cron/tick` (header `X-Cron-Secret` benar) memprosesnya.
7. Uji jalur gagal: buat order baru, JANGAN bayar, cek job `expire-order` ter-schedule di `runAt` = waktu expired; percepat dengan memanggil `/api/cron/tick` setelah waktunya lewat (atau edit `runAt` manual di DB untuk uji cepat) → `Order.status` → `EXPIRED`.
8. Uji webhook dobel: kirim ulang notifikasi Midtrans yang sama persis → pastikan `WebhookEvent` kedua di-dedupe (`{ok:true, deduped:true}`), TIDAK dispatch fulfillment kedua kali.

- [ ] **Step 4: Update `PROGRESS.md`**

Tulis ringkasan hasil verifikasi (task mana yang lulus, temuan apa jika ada) ke `PROGRESS.md` bagian status Fase 3 — pola sama seperti checkpoint Fase 1/2 sebelumnya. Dev server yang dipakai untuk verifikasi dihentikan setelah selesai.

- [ ] **Step 5: Commit dokumentasi**

```bash
git add PROGRESS.md
git commit -m "docs: checkpoint Fase 3 — verifikasi end-to-end order + Midtrans selesai"
```

---

## Self-Review Notes (ditulis penulis plan, bukan bagian eksekusi)

- **Cakupan spec**: §5 (adapter interface, routing sederhana 1-provider), §6 (Midtrans charge+webhook+idempotency), §7 (order flow, 5 dari 6 edge case wajib — kecuali "pembayaran nyasar" yang butuh laporan admin, sengaja di luar scope Fase 3 karena butuh UI admin baru; dicatat di sini sebagai gap sadar, bukan lupa), §9 poin 2-3 (detail produk, invoice), §10 (2 job type baru), §15 (design system Arah A diterapkan di Task 1-2) — semua tercakup. §8 (cek nickname) SENGAJA di luar scope (bukan bagian DoD Fase 3, spec sendiri menoleransi game tanpa sumber cek nickname).
- **Konsistensi tipe**: `SelectSkuResult` (Task 5) dipakai identik di Task 7 & 9. `ProviderTrxResult` (dari Fase 2, tidak diubah) dipakai identik di Task 7 & 8. `CheckoutResult` (Task 9) dipakai identik di Task 10.
- **Placeholder scan**: tidak ada `TODO`/`nanti`/"mirip task N" — tiap step tugas berisi kode utuh yang bisa langsung ditempel.
