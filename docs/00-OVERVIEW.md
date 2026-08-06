# 00 — Overview Proyek

## 1. Tentang Proyek

**DannShop** adalah platform **PPOB (Payment Point Online Bank) & digital goods store** — jual topup game (diamond, UC, dll.), pulsa, e-money, dan token listrik secara otomatis 24 jam. Model bisnisnya: pembeli checkout produk digital, bayar lewat Midtrans, sistem otomatis mengirim produknya lewat provider PPOB (Digiflazz).

**Fitur utama:**
- Storefront publik: katalog produk per kategori, halaman detail produk dengan pilihan nominal, banner promo, produk trending.
- Checkout tanpa wajib akun (guest checkout) — pembeli cukup punya email untuk menerima invoice.
- Akun member: saldo wallet (bisa diisi ulang/deposit), riwayat transaksi, harga khusus member, bayar pakai saldo.
- **Flash sale** — harga diskon per item dengan jadwal waktu otomatis.
- **Grup item** — pengelompokan nominal produk bebas (mis. "Diamond" vs "Membership" di satu game).
- Pembayaran: QRIS, Virtual Account (6 bank), dan Mandiri Bill Payment — semua diproses otomatis lewat Midtrans, tanpa konfirmasi manual admin.
- Panel admin lengkap: kelola produk/kategori/harga, kelola pesanan (termasuk retry/refund manual), kelola provider PPOB, laporan penjualan, monitoring job background, log webhook, markup harga massal, dan pengaturan situs (logo, favicon, FAQ, syarat & ketentuan, kebijakan privasi, mode maintenance, konfigurasi email — semua bisa diedit tanpa perlu deploy ulang kode).

## 2. Tech Stack Lengkap

| Kategori | Teknologi | Versi | Catatan |
|---|---|---|---|
| Framework | **Next.js** | `16.2.10` | **App Router** (bukan Pages Router). Versi ini punya beberapa perubahan dari Next.js yang umum dikenal — lihat `web/AGENTS.md` dan `docs/01-ARSITEKTUR.md` §"Next.js 16". |
| Bahasa | TypeScript | `^5` | `strict: true` di `web/tsconfig.json`. |
| UI Library | React | `19.2.4` | React Server Components dipakai secara default di App Router. |
| Database | MySQL | — | Lewat `DATABASE_URL`. Di production pakai TiDB Cloud Serverless (wire-protocol kompatibel MySQL). |
| ORM | **Prisma** | `^6.19.3` | Schema di `web/prisma/schema.prisma`. Client di-generate otomatis lewat script `postinstall`. |
| Autentikasi | **NextAuth (Auth.js) v5** | `^5.0.0-beta.31` | Strategi `Credentials` (email+password), session JWT. Lihat `docs/03-BACKEND-API.md`. |
| Styling | **Tailwind CSS** | `^4` | Konfigurasi lewat `web/src/app/globals.css` (bukan `tailwind.config.js` — Tailwind v4 pakai pendekatan CSS-first). Komponen dasar gaya **shadcn** (`web/src/components/ui/`), primitif interaktif dari **`@base-ui/react`**. |
| State management (server) | React Server Components + Server Actions | — | Sebagian besar data-fetching terjadi langsung di Server Component (`async function Page()`), bukan lewat state management client seperti Redux/Zustand. |
| State management (client, polling) | **`@tanstack/react-query`** | `^5.101.4` | Dipakai khusus untuk polling status pembayaran (invoice & deposit) tiap 3 detik. |
| Payment Gateway | **Midtrans** (Core API, bukan Snap) | — | Lihat `docs/04-INTEGRASI-PAYMENT-PPOB.md`. |
| Provider PPOB | **Digiflazz** | — | Satu-satunya provider yang sudah aktif diimplementasikan (arsitektur sudah disiapkan multi-provider, provider lain seperti OkeConnect/QiosPay/Serpul baru terdaftar sebagai enum, belum ada adapter-nya). |
| Email | **Resend** (SDK) atau **SMTP generik** (`nodemailer`) | — | Provider dipilih & dikonfigurasi lewat panel admin (`/admin/settings`), tersimpan terenkripsi di database — bukan `.env`. |
| File storage | **Vercel Blob** | `^2.6.1` | Upload gambar (banner, logo, ikon produk, logo metode pembayaran, favicon). |
| Validasi | **Zod** | `^4.4.3` | Dipakai di hampir semua server action & API route untuk validasi input. |
| Testing | **Vitest** | `^4.1.10` | `web/tests/*.test.ts` — konvensi proyek ini: hanya pure function (logic tanpa DB) yang dites unit, server action/DB-orchestration tidak. |
| Linting | **ESLint 9** (flat config) | `^9` | `web/eslint.config.mjs`, pakai `eslint-config-next`. |
| Hosting | **Vercel** | — | Region function di-pin ke `sin1` (Singapura) lewat `web/vercel.json`, supaya dekat dengan database TiDB yang juga di Singapura (mengurangi latency). |
| Cron | Hostinger cron eksternal → `POST /api/cron/tick` | — | Vercel sendiri tidak punya cron bawaan yang dipakai proyek ini; endpoint ini dipanggil dari luar tiap menit. |

## 3. Struktur Folder Top-Level

> ⚠️ **Penting:** Repo ini adalah **monorepo campuran**. Root folder JUGA berisi aplikasi PHP/Laravel LAMA yang sudah tidak dipakai (folder `app/`, `bootstrap/`, `config/`, `database/`, `resources/`, `routes/`, `vendor/`, dll di root repo) — **jangan pernah sentuh folder-folder ini**. Aplikasi Next.js yang aktif dan sedang dikembangkan **seluruhnya ada di dalam folder `web/`**.

```
DannShop-PPOB/
├── docs/                    ← Dokumentasi (folder ini!) + docs/superpowers/ (spec & plan historis fitur)
├── web/                     ← APLIKASI NEXT.JS AKTIF — semua kerja ada di sini
│   ├── src/
│   │   ├── app/             ← App Router: setiap folder = 1 route
│   │   ├── components/      ← Komponen React yang dipakai lintas halaman
│   │   ├── lib/              ← Logic non-UI: DB client, integrasi Midtrans/Digiflazz, dst.
│   │   └── types/            ← Deklarasi tipe TypeScript tambahan (mis. augmentasi NextAuth)
│   ├── prisma/
│   │   ├── schema.prisma    ← Definisi SEMUA tabel database
│   │   ├── migrations/      ← Riwayat migrasi (jangan diedit manual — lihat docs/05)
│   │   └── seed.ts          ← Data awal (kategori, metode pembayaran) untuk DB baru
│   ├── tests/                ← Unit test (Vitest)
│   ├── public/                ← Aset statis (favicon default, dll.)
│   ├── package.json
│   ├── next.config.ts        ← Header keamanan (CSP, dll.)
│   ├── vercel.json           ← Konfigurasi region deploy
│   ├── AGENTS.md              ← Catatan penting: versi Next.js ini punya API/konvensi yang beda dari yang umum dikenal
│   └── .env.example           ← Daftar SEMUA environment variable yang dibutuhkan
├── (app/, bootstrap/, config/, database/, resources/, routes/, vendor/, dll.) ← APLIKASI LAMA, ABAIKAN
└── .superpowers/               ← Ledger internal workflow pengembangan (bukan bagian aplikasi)
```

### Isi folder `web/src/app/` (App Router)

| Sub-folder | Isi |
|---|---|
| `(public)/` | Halaman storefront publik (beranda, detail produk, FAQ, kontak, dll.) — tanda kurung berarti folder ini **tidak muncul di URL**, murni pengelompokan. Detail lengkap: `docs/02-FRONTEND-STOREFRONT.md`. |
| `account/` | Halaman khusus member yang sudah login (dashboard, riwayat order/deposit, isi saldo). |
| `admin/` | Seluruh panel admin. |
| `api/` | API Route Handler (bukan Server Action) — dipakai untuk webhook, polling status, cron, search. Detail: `docs/03-BACKEND-API.md`. |
| `actions/` | Kumpulan **Server Action** (fungsi yang dipanggil langsung dari form/komponen, bukan lewat HTTP) — ini "backend" utama aplikasi ini, bukan `api/`. Detail: `docs/03-BACKEND-API.md`. |
| `invoice/`, `login/`, `register/`, `maintenance/` | Halaman publik yang berdiri sendiri di luar folder `(public)` (tidak memakai header/footer situs biasa). |
| `layout.tsx` | Root layout — membungkus SEMUA route di atas, termasuk admin. |

### Isi folder `web/src/lib/`

| Sub-folder/file | Isi |
|---|---|
| `catalog/` | Query data katalog produk untuk storefront, bulk-import, price-sync. |
| `content/` | Renderer teks "lite markdown" untuk halaman Syarat & Ketentuan/Kebijakan Privasi. |
| `jobs/` | Job runner + semua handler job background (`runner.ts`). |
| `midtrans/` | Klien API Midtrans, verifikasi signature webhook, status mapping. |
| `notify/` | Pengiriman email & alert Telegram. |
| `order/` | Logic fulfillment order, pemilihan SKU provider, nomor order. |
| `payment/` | Kalkulasi fee & kode unik pembayaran. |
| `pricing/` | Fungsi `effectivePrice` — satu-satunya sumber kebenaran harga (flash sale/member/normal). |
| `providers/` | Adapter provider PPOB (Digiflazz) + registry pemilihan adapter. |
| `reports/` | Query agregasi untuk laporan penjualan & dashboard admin. |
| `validation/` | Skema Zod untuk validasi form. |
| `wallet/` | Logic keputusan terkait saldo (mis. tujuan refund). |
| `auth.ts`, `auth.config.ts` | Konfigurasi NextAuth. |
| `db.ts` | Prisma Client singleton. |
| `crypto.ts` | Enkripsi/dekripsi kredensial (AES-256-GCM) + perbandingan timing-safe. |
| `site-settings.ts` | Baca semua pengaturan situs (logo, FAQ, kontak, dll.) dari database. |

### File konfigurasi penting di root `web/`

| File | Fungsi |
|---|---|
| `web/prisma/schema.prisma` | Sumber kebenaran struktur database — lihat `docs/03-BACKEND-API.md` §2 untuk ERD lengkap. |
| `web/next.config.ts` | Header keamanan HTTP (Content-Security-Policy, X-Frame-Options, dll.). |
| `web/vercel.json` | `{ "regions": ["sin1"] }` — memastikan fungsi Next.js jalan di region Singapura, dekat database. |
| `web/tsconfig.json` | Alias import `@/*` → `web/src/*` (jadi `@/lib/db` = `web/src/lib/db.ts`). |
| `web/eslint.config.mjs` | Aturan lint (termasuk React Compiler purity check — lihat `docs/06-TROUBLESHOOTING-DEPLOY.md`). |
| `web/.env.example` | **Daftar lengkap semua environment variable yang dibutuhkan**, dengan penjelasan tiap variabel. |
| `web/AGENTS.md` | Peringatan bahwa versi Next.js ini (16) punya API/konvensi berbeda dari yang biasa dikenal — lihat `docs/01-ARSITEKTUR.md`. |

## 4. File Dokumentasi Lainnya

Dokumen ini adalah bagian dari satu set dokumentasi. Lihat `docs/INDEX.md` untuk daftar lengkap dan alur baca yang disarankan.

---

## Cheat Sheet — Overview

| Saya mau tahu... | Baca dokumen ini |
|---|---|
| Alur request dari klik user sampai balik ke layar | `docs/01-ARSITEKTUR.md` |
| Halaman apa saja yang ada & mau ubah tampilan | `docs/02-FRONTEND-STOREFRONT.md` |
| Endpoint/action apa saja yang ada & struktur database | `docs/03-BACKEND-API.md` |
| Cara kerja pembayaran & pengiriman produk digital | `docs/04-INTEGRASI-PAYMENT-PPOB.md` |
| Cara menambah fitur baru (produk, metode bayar, halaman, dll.) | `docs/05-CARA-TAMBAH-FITUR.md` |
| Cara jalankan di lokal, deploy, & solusi masalah umum | `docs/06-TROUBLESHOOTING-DEPLOY.md` |
