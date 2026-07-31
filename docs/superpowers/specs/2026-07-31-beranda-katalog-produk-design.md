# Beranda Katalog Produk — Spec Desain

Status: Disetujui Wildan (2026-07-31)

## 1. Latar Belakang

`src/app/(public)/page.tsx` (halaman `/`) masih berupa placeholder statis peninggalan Fase 1 — judul + 3 kartu kategori hardcode (`Games`, `Pulsa & Data`, `E-Money`) yang semuanya cuma bertuliskan "Segera hadir", sama sekali tidak terhubung ke database. Ini luput diganti saat Fase 2 (katalog) dan Fase 3 (order flow) dibangun — kedua fase itu membangun halaman detail produk (`(public)/[categorySlug]/[productSlug]/page.tsx`) dan alur checkout lengkap, tapi tidak pernah membangun pintu masuk (entry point) dari beranda ke produk.

Ditemukan saat verifikasi deploy Vercel (2026-07-31): admin sudah mengaktifkan produk (`Product.isActive = true`) untuk kategori Games (Mobile Legends, Free Fire), tapi beranda tetap menampilkan "Segera hadir" karena memang tidak pernah membaca data produk sama sekali. Header (`site-header.tsx`) juga tidak punya link navigasi ke kategori/produk apa pun — satu-satunya cara sampai ke halaman detail produk adalah tahu persis URL-nya.

Ditemukan juga: `getActiveCategories()` di `src/lib/catalog/public.ts` sudah dibuat (kemungkinan disiapkan untuk kebutuhan persis ini) tapi tidak pernah dipanggil dari mana pun di codebase — dead code.

## 2. Referensi Visual & Keputusan Scope

User menunjukkan referensi kompetitor (KonterOnlineID) dengan homepage kaya fitur: hero banner carousel, flash sale + countdown timer, section trending, tab kategori horizontal, grid kartu produk pakai artwork game, dan toast notifikasi pembelian live. User eksplisit ingin menuju ke arah itu **secara bertahap** ("pelan-pelan"), bukan sekali jalan.

**Scope iterasi ini (disetujui):** HANYA tab kategori horizontal + grid kartu produk di bawahnya. Elemen lain dari referensi (hero carousel, flash sale/countdown, trending, toast pembelian live) **sengaja di luar scope** — masing-masing butuh infrastruktur data yang belum ada sama sekali (banner promo yang bisa diatur admin, algoritma/tracking "trending", feed pembelian real-time) dan didesain jadi iterasi terpisah nanti, bukan bagian dari perubahan ini.

**Keputusan lain yang mengikat desain ini:**
- Kategori tanpa produk aktif (saat ini: Pulsa & Data, E-Money, PLN, Voucher) tetap muncul sebagai tab, ditandai "Segera hadir" saat dipilih — bukan disembunyikan.
- Interaksi kategori pakai pola tab (klik kategori → grid di bawah tab berganti isi), bukan semua kategori ditumpuk sebagai section terpisah di satu halaman panjang.
- Kartu produk **belum pakai gambar/artwork** (field `Product.banner` di skema sudah ada tapi seluruh produk seed saat ini `banner: null`) — kartu pakai warna/gradient dari design token yang sudah ada (`--primary`/`--accent`), fokus ke teks nama produk + publisher + harga. Begitu field `banner` diisi admin di masa depan, tinggal dipakai — tidak perlu perubahan struktur data di iterasi ini.

## 3. Arsitektur

### 3.1 Data layer — `src/lib/catalog/public.ts`

Tambah fungsi baru:

```ts
export interface CatalogCategory {
  id: string;
  slug: string;
  name: string;
  products: CatalogProduct[];
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  publisher: string | null;
  startingPrice: bigint; // harga ProductItem.sellingPrice termurah yang isActive
}

export async function getCatalogHomeData(): Promise<CatalogCategory[]>
```

`getCatalogHomeData()` query SEMUA kategori (`db.category.findMany`, `orderBy: sortOrder asc`), masing-masing include produk dengan filter `isActive: true` DAN `items: { some: { isActive: true } }` (produk aktif tapi tanpa item aktif sama sekali dikecualikan — lihat §4), beserta `items` yang `isActive: true` untuk hitung `startingPrice` = `Math.min` dari `sellingPrice` antar item aktif itu. Kategori tanpa produk yang lolos filter tetap muncul di hasil dengan `products: []`. Satu query (pakai `include` bertingkat Prisma dengan `where` di level include), tidak N+1.

**Hapus `getActiveCategories()`** (fungsi lama, tidak terpakai di mana pun — grep dikonfirmasi 2026-07-31, digantikan penuh oleh `getCatalogHomeData()` yang punya semantik lebih sesuai kebutuhan ini: menampilkan SEMUA kategori, bukan cuma yang berisi produk).

`getProductForCheckout()` dan `isItemPurchasable()` (dipakai halaman detail produk) **tidak disentuh sama sekali** — di luar scope, sudah benar untuk kebutuhannya sendiri.

### 3.2 Halaman — `src/app/(public)/page.tsx`

Ganti total isinya jadi async server component:

```tsx
export default async function HomePage() {
  const categories = await getCatalogHomeData();
  return <CatalogTabs categories={categories} />;
}
```

### 3.3 Komponen client baru — `src/app/(public)/catalog-tabs.tsx`

`"use client"` — terima `categories: CatalogCategory[]` sebagai prop, kelola state kategori yang sedang dipilih (`useState`, default: kategori pertama yang `products.length > 0`, fallback kategori pertama kalau semua kosong).

- Baris tab: `overflow-x-auto` horizontal scroll (mobile-first, sesuai referensi), tiap tab pakai `Button`/`Badge` variant yang sudah ada di `components/ui/`, state aktif ditandai warna `--primary`.
- Di bawah tab: kalau kategori terpilih `products.length === 0` → tampilkan pesan "Segera hadir, nantikan produk kategori ini." (styled, bukan sekadar teks polos). Kalau ada produk → grid `grid gap-3 sm:grid-cols-2 lg:grid-cols-4` (persis pola yang sudah dipakai `admin/products/product-items-manager.tsx:248`, 1 kolom di mobile tanpa prefix).

### 3.4 Komponen baru — `src/app/(public)/product-card.tsx`

Terima satu `CatalogProduct` + `categorySlug` induknya. Render `<Link href={`/${categorySlug}/${product.slug}`}>` membungkus `Card` (dari `components/ui/card.tsx`):
- Header kartu: blok warna gradient (`bg-gradient-to-br from-primary to-accent` atau sejenis, pakai token yang ada) dengan nama produk di dalamnya (font `--font-heading`), tinggi tetap (mis. `h-24`) — placeholder visual sampai ada `banner` asli.
- Body kartu: nama publisher (`text-muted-foreground text-sm`, tampil kalau ada), "Mulai dari Rp {startingPrice.toLocaleString("id-ID")}".
- Hover/focus state konsisten dengan kartu lain yang sudah ada di codebase (shadow/border transition, bukan pola baru).

## 4. Error handling & edge cases

- Kategori tanpa kategori sama sekali di DB (skenario mustahil karena seed selalu isi 5 kategori, tapi kalau `categories.length === 0`) → beranda tampilkan pesan generik "Katalog belum tersedia" alih-alih crash/blank.
- `startingPrice` dihitung dari `Math.min` array `sellingPrice` (BigInt) — kalau produk aktif tapi seluruh item-nya `isActive: false` (kasus tepi: admin non-aktifkan semua item tapi lupa non-aktifkan produknya), produk itu **dikecualikan dari hasil query** (bukan ditampilkan dengan harga 0) — query Prisma-nya pakai `products: { some: { isActive: true, items: { some: { isActive: true } } } }` sebagai filter, konsisten dengan asumsi "produk yang ditampilkan pasti punya minimal 1 item yang bisa dibeli".

## 5. Testing

Halaman ini murni presentational (React Server/Client Component + 1 fungsi query Prisma langsung, bukan pure-function transform) — konsisten konvensi TDD repo yang sudah berjalan sepanjang proyek ini (lihat Global Constraints di plan-plan fase sebelumnya): hanya pure function baru/berubah yang dapat test otomatis, orchestration/data-fetch/UI code tidak. `getCatalogHomeData()` cocok kategori "data-fetch", bukan pure function (query Prisma langsung), jadi tanpa test otomatis — sama seperti `getActiveCategories`/`getProductForCheckout` yang sudah ada sebelumnya.

Verifikasi dilakukan manual: build lokal (`npm run build`) harus bersih, lalu smoke test di browser (dev lokal DAN production Vercel setelah deploy) — buka `/`, pastikan tab kategori muncul benar (termasuk kategori kosong berlabel "Segera hadir"), klik tab lain gonta-ganti grid, klik kartu produk sampai ke halaman detail yang sudah ada dan tetap berfungsi (tidak diubah).

## 6. Di luar scope (eksplisit, untuk iterasi mendatang)

- Hero banner carousel promosi.
- Flash sale + countdown timer.
- Section "Trending"/produk populer (butuh definisi "populer" — belum ada tracking apa pun).
- Toast notifikasi pembelian real-time.
- Upload/isi `Product.banner` untuk produk yang sudah ada (di luar scope teknis — itu tugas admin mengisi data, bukan pekerjaan kode).
- Pencarian produk (search bar).
