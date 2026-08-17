# 00 — Overview Proyek

## 1. Tentang Proyek

**DannShop** adalah platform **PPOB (Payment Point Online Bank) & digital goods store** — jual topup game (diamond, UC, dll.), pulsa, e-money, dan token listrik secara otomatis 24 jam. Model bisnisnya: pembeli checkout produk digital, bayar lewat Midtrans, sistem otomatis mengirim produknya lewat provider PPOB (Digiflazz).

**Fitur utama:**

*Jualan & pembeli*
- Storefront publik: katalog per kategori, detail produk dengan pilihan nominal, banner promo, produk trending, pencarian
- **Checkout tanpa wajib akun** (guest checkout) — cukup email untuk menerima invoice
- Akun member: saldo wallet (bisa diisi ulang), riwayat transaksi, bayar pakai saldo
- **Flash sale** per item dengan jadwal otomatis · **grup item** (mis. "Diamond" vs "Membership" di satu game) · **stok** per item (ditahan sejak checkout)
- **Kode promo/voucher** dengan batas pemakaian per nomor tujuan
- Pembayaran QRIS, Virtual Account, e-wallet — otomatis lewat Midtrans, tanpa konfirmasi manual
- **Produk manual** untuk barang yang dikirim admin sendiri, lengkap dengan tombol konfirmasi WhatsApp/Telegram di invoice

*Program & kemitraan*
- **Program reseller**: paket sekali-bayar-seumur-hidup yang memberi potongan harga (persen untuk semua produk, atau flat rupiah khusus produk manual)
- **API Partner H2H** (`/api/v1/*`): mitra memesan dari sistemnya sendiri, dibayar dari saldo prabayar
- **Portal mitra** (`/mitra`): katalog, saldo, riwayat, kredensial, log callback

*Panel admin*
- Kelola produk/kategori/harga (termasuk import massal dari price list provider & markup massal), pesanan (retry/refund manual), provider PPOB
- **Dashboard & analytics**: omzet, **laba bersih & margin**, order, pembeli aktif, reseller, mitra, grafik harian, trafik & corong konversi
- **Karyawan & peran (RBAC)**: rekrut karyawan dengan izin per bagian; aksi yang menyentuh uang dipisah dari aksi harian
- **Keamanan**: 2FA wajib untuk semua yang masuk panel, login dua langkah, kunci akun setelah 5 kali gagal
- **Aplikasi mobile (PWA)**: dua app terpasang dari satu situs (Toko & Admin), ikon & layar pembuka diatur dari panel
- Nyaris semua isi situs bisa diedit tanpa deploy: logo, favicon, FAQ, syarat & ketentuan, kebijakan privasi, kontak, konfigurasi email, notifikasi Telegram, tema & CSS kustom, slot HTML, branding invoice & 9 template email

## 2. Tech Stack Lengkap

| Kategori | Teknologi | Versi | Catatan |
|---|---|---|---|
| Framework | **Next.js** | `^16.3.1` | **App Router** (bukan Pages Router). Versi ini punya beberapa perubahan dari Next.js yang umum dikenal — lihat `web/AGENTS.md` dan `docs/01-ARSITEKTUR.md` §"Next.js 16". |
| Bahasa | TypeScript | `^5` | `strict: true` di `web/tsconfig.json`. |
| UI Library | React | `19.2.4` | React Server Components dipakai secara default di App Router. |
| Database | MySQL | — | Lewat `DATABASE_URL`. Di production pakai TiDB Cloud Serverless (wire-protocol kompatibel MySQL). |
| ORM | **Prisma** | `^6.19.3` | Schema di `web/prisma/schema.prisma`. Client di-generate otomatis lewat script `postinstall`. |
| Autentikasi | **NextAuth (Auth.js) v5** | `^5.0.0-beta.31` | Strategi `Credentials` (email+password), session JWT. Lihat `docs/03-BACKEND-API.md`. |
| Styling | **Tailwind CSS** | `^4` | Konfigurasi lewat `web/src/app/globals.css` (bukan `tailwind.config.js` — Tailwind v4 pakai pendekatan CSS-first). Komponen dasar gaya **shadcn** (`web/src/components/ui/`), primitif interaktif dari **`@base-ui/react`**. |
| State management (server) | React Server Components + Server Actions | — | Sebagian besar data-fetching terjadi langsung di Server Component (`async function Page()`), bukan lewat state management client seperti Redux/Zustand. |
| State management (client, polling) | **`@tanstack/react-query`** | `^5.101.4` | Dipakai khusus untuk polling status pembayaran (invoice & deposit) tiap 3 detik. |
| Payment Gateway | **Midtrans** | — | **DUA mode, dipilih admin lewat panel**: Snap (pembeli dibawa ke halaman Midtrans) atau Core API (pembeli tidak pernah meninggalkan situs). Keduanya lewat satu titik `lib/payment/create-payment.ts`. Lihat `docs/04` & `docs/07`. |
| Provider PPOB | **Digiflazz** & **OkeConnect** | — | **Dua-duanya sudah aktif** (adapter di `lib/providers/`). `QiosPay`/`Serpul` masih sebatas nilai enum tanpa adapter. ⚠️ Karena itu logika katalog/fulfillment **tidak boleh menyebut nama provider secara harfiah** — hardcode `"DIGIFLAZZ"` sudah dua kali menyebabkan bug senyap. |
| Email | **Resend** (SDK) atau **SMTP generik** (`nodemailer`) | — | Provider dipilih & dikonfigurasi lewat panel admin (`/admin/settings`), tersimpan terenkripsi di database — bukan `.env`. |
| File storage | **Vercel Blob** | `^2.6.1` | Upload gambar (banner, logo, ikon produk, logo metode pembayaran, favicon). |
| Grafik | **Recharts** | `^3.10.1` | Grafik dashboard & analytics. Paletnya divalidasi untuk buta warna & kontras di mode terang DAN gelap. |
| Validasi | **Zod** | `^4.4.3` | Dipakai di hampir semua server action & API route untuk validasi input. |
| Testing | **Vitest** | `^4.1.10` | **Dua project** (`vitest.config.ts`): `unit` (Node, `tests/*.test.ts`) untuk pure function, dan `components` (jsdom, `tests/components/*.test.tsx`) untuk render komponen. ⚠️ Di laptop RAM kecil, jalankan `npm run test:unit` dan `npm run test:components` TERPISAH — sekaligus bisa gagal menghidupkan worker. |
| Linting | **ESLint 9** (flat config) | `^9` | `web/eslint.config.mjs`, pakai `eslint-config-next`. |
| Hosting | **Vercel** | — | Region function di-pin ke `sin1` (Singapura) lewat `web/vercel.json`, supaya dekat dengan database TiDB yang juga di Singapura (mengurangi latency). |
| Cron | **cPanel Rumahweb** (eksternal) → `POST /api/cron/tick` | — | Proyek ini TIDAK memakai cron Vercel. Dipanggil dari luar **tiap menit**. Kalau mati, dashboard admin menampilkan peringatan merah — lihat `docs/06`. |

## 3. Struktur Folder Top-Level

Sisa aplikasi PHP/Laravel lama **sudah dihapus seluruhnya** (2026-08-18). Root repo sekarang cuma berisi tiga folder:

```
DannShop-PPOB/
├── web/      ← APLIKASI NEXT.JS — seluruh kerja ada di sini
├── relay/    ← digiflazz-relay.php — relay ber-IP tetap, JALAN DI cPANEL RUMAHWEB (bukan di Vercel)
└── docs/     ← Dokumentasi (folder ini)
```

> **`relay/` itu PHP tapi BUKAN sisa Laravel.** Ia satu berkas yang di-upload manual ke hosting cPanel, tugasnya meneruskan panggilan ke Digiflazz/OkeConnect dari IP yang tetap — karena IP keluar Vercel berganti-ganti dan provider mewajibkan whitelist IP. Jangan dihapus. Penjelasan lengkap: `docs/08-IP-TETAP-DIGIFLAZZ.md`.

### Isi `web/`

```
web/
├── src/
│   ├── app/          ← App Router: setiap folder = 1 route/URL
│   ├── components/   ← Komponen React lintas halaman
│   ├── content/      ← Markdown panduan yang DIRENDER di /admin/panduan & /mitra/dokumentasi
│   ├── lib/          ← Logic non-UI: DB, integrasi, aturan bisnis
│   └── types/        ← Augmentasi tipe (mis. NextAuth)
├── prisma/
│   ├── schema.prisma ← Definisi SEMUA tabel (41 model, 18 enum)
│   ├── migrations/   ← Riwayat migrasi — lihat docs/05 sebelum menyentuhnya
│   └── seed.ts       ← Data awal untuk database kosong
├── tests/            ← Vitest: tests/*.test.ts (unit) & tests/components/*.test.tsx (render)
├── public/           ← Aset statis (ikon PWA, logo metode bayar, service worker)
├── next.config.ts    ← Header keamanan (CSP) + outputFileTracingIncludes
├── vercel.json       ← { regions: ["sin1"] } — fungsi jalan di Singapura, dekat database
├── AGENTS.md         ← ⚠️ Next.js versi ini beda dari yang umum dikenal
└── .env.example      ← Daftar LENGKAP environment variable + penjelasannya
```

### Empat "permukaan" aplikasi

Ini yang paling penting dipahami sebelum membaca kode: aplikasi ini **satu Next.js tapi melayani empat jenis pengguna**, masing-masing punya layout & aturan aksesnya sendiri.

| Permukaan | URL | Siapa | Gerbangnya |
|---|---|---|---|
| **Storefront** | `/` | Siapa saja, termasuk tamu | — |
| **Panel user** | `/account/*` | Pembeli yang login | Harus login |
| **Panel admin** | `/admin/*` | Pemilik toko & karyawan | Login + role ADMIN/STAFF + **2FA wajib** + izin per halaman |
| **Portal mitra** | `/mitra/*` | Mitra H2H (reseller API) | Login + punya `PartnerAccount` |

### Isi `web/src/app/`

| Folder | Isi |
|---|---|
| `(public)/` | Storefront. Tanda kurung = **tidak muncul di URL**, murni pengelompokan agar semua halaman ini berbagi satu layout (header + footer toko). Berisi beranda, `[categorySlug]/[productSlug]` (detail produk), FAQ, kontak, cek transaksi, daftar reseller |
| `account/` | Panel user: beranda akun, isi saldo, riwayat order & deposit, pengaturan, **reseller**, **mitra** |
| `admin/` | Panel admin — 28 halaman |
| `mitra/` | Portal mitra H2H: katalog, saldo, transaksi, kredensial, callback, dokumentasi |
| `api/` | Route Handler (webhook, polling status, cron, search) — **bukan** tempat logic utama |
| `actions/` | **Server Action** — INI backend utamanya (30 berkas). Lihat `docs/03` |
| `invoice/[token]/` | Halaman invoice publik. Token = kredensialnya, bukan sesi |
| `reseller/aktivasi/` | Halaman aktivasi reseller. Publik — dibuka dari link email |
| `login/`, `register/`, `forgot-password/`, `reset-password/`, `konfirmasi-email/` | Halaman identitas akun |
| `pwa/splash/` | Route yang MENGGAMBAR gambar layar pembuka iOS on-demand (bukan halaman) |
| `maintenance/`, `offline/` | Halaman khusus keadaan |
| `layout.tsx` | Root layout — membungkus SEMUA di atas, termasuk admin |

### Isi `web/src/lib/` — di sinilah aturan bisnisnya hidup

Kalau kamu mencari "kenapa harganya sekian" atau "kenapa order ini ditolak", jawabannya hampir selalu di sini, bukan di komponen React.

| Folder | Isi | Berkas paling penting |
|---|---|---|
| `pricing/` | **Satu-satunya penentu harga final** | `effective-price.ts` |
| `membership/` | Konteks paket reseller yang dipakai seluruh sistem harga | `tier.ts` (`getMembershipContext`) |
| `reseller/` | Pendaftaran, aktivasi, aturan naik paket | `upgrade.ts`, `registration.ts`, `purchase.ts` |
| `order/` | Fulfillment, pemilihan provider, snapshot modal | `fulfillment.ts`, `select-provider.ts`, `cost-snapshot.ts` |
| `payment/` | Fee, kode unik, penerapan pembayaran | `settlement.ts`, `fee.ts`, `create-payment.ts` |
| `voucher/` | Aturan & penilaian kode promo | `discount.ts`, `evaluate.ts` |
| `rbac/` | Katalog izin + peta route→izin | `permissions.ts`, `access.ts` |
| `auth/` | Keputusan login, 2FA, **gerbang admin tunggal** | `credentials.ts`, `admin-gate.ts` |
| `catalog/` | Query katalog, stok, import massal, sync harga | `public.ts`, `stock.ts` |
| `providers/` | Adapter Digiflazz & OkeConnect + registry | `okeconnect.ts`, `registry.ts` |
| `partner/` | API H2H: autentikasi signature, order, price list, callback | `auth.ts`, `order.ts` |
| `reports/` | Agregasi laporan, dashboard, & analytics | `overview.ts`, `sales.ts` |
| `analytics/` | Pelacakan kunjungan & query-nya | `track.ts`, `query.ts` |
| `notify/` | Email (9 template) & Telegram | `email.ts`, `email-templates.ts` |
| `invoice/` | Branding dokumen, struk, pesanan manual | `branding.ts`, `receipt-text.ts` |
| `storefront/` | Tampilan & tema, slot HTML, **penyaring HTML/CSS** | `appearance.ts`, `sanitize-html.ts` |
| `pwa/` | Manifest, ikon, layar pembuka aplikasi mobile | `config.ts`, `splash.ts` |
| `jobs/` | Job runner + semua handler background | `runner.ts` |
| `account/` | Ganti email/password/nama, status akun | `change-email.ts`, `user-status.ts` |
| `wallet/` | Keputusan terkait saldo | `decisions.ts` |
| `validation/` | Skema Zod semua form | `catalog.ts`, `auth.ts` |
| `admin/`, `content/`, `panduan/`, `midtrans/` | Pendukung panel, renderer teks, registry panduan, klien Midtrans | |

**Berkas lepas di `lib/`:** `db.ts` (Prisma singleton) · `auth.ts`/`auth.config.ts` (NextAuth) · `crypto.ts` (AES-256-GCM + banding timing-safe) · `rate-limit.ts` (batas laju + kunci login) · `site-settings.ts` · `format.ts` · `base-url.ts` · `password.ts` · `blob-upload.ts` · `image-processing.ts` · `random-token.ts` · `utils.ts`

### File konfigurasi penting di `web/`

| File | Fungsi |
|---|---|
| `prisma/schema.prisma` | Sumber kebenaran struktur database — ERD di `docs/03` |
| `next.config.ts` | Header keamanan (CSP) **dan** `outputFileTracingIncludes` — yang terakhir wajib supaya markdown di `src/content/` ikut terbawa ke serverless |
| `vercel.json` | Region deploy. Keberadaannya juga menandakan Root Directory Vercel = `web` |
| `tsconfig.json` | Alias `@/*` → `web/src/*` (jadi `@/lib/db` = `web/src/lib/db.ts`) |
| `vitest.config.ts` | Dua project: `unit` (Node) & `components` (jsdom) |
| `eslint.config.mjs` | Aturan lint, termasuk pemeriksa kemurnian React Compiler |
| `.env.example` | **Daftar lengkap environment variable** + penjelasannya |
| `AGENTS.md` | Peringatan bahwa Next.js versi ini punya API/konvensi berbeda |

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
| Cara kerja fitur yang lahir 2026-08-16..18 (reseller, RBAC, laba, PWA) | `docs/11-FITUR-RESELLER-RBAC-LABA.md` |
| **Cara mengoperasikan** panel (bukan cara koding-nya) | `/admin/panduan` di aplikasi — 10 panduan, berkasnya di `web/src/content/panduan/` |

### Kalau baru pertama kali & awam Next.js

Urutan yang paling cepat membuatmu produktif:

1. **`docs/01` §1–2** — pahami dulu bahwa Next.js versi ini beda dari tutorial di internet, lalu baca satu diagram alur request. Ini menghemat berjam-jam kebingungan.
2. **`docs/00` §3** (dokumen ini, di atas) — hafalkan cuma satu hal: **aturan bisnis ada di `web/src/lib/`, tampilan di `web/src/app/`**. Kalau mencari "kenapa angkanya sekian", buka `lib/`.
3. **`docs/03` §1** — pahami perbedaan Server Action vs API Route. Sebagian besar "backend" di sini adalah Server Action, dan itu yang paling sering disalahpahami.
4. Sisanya baca **saat butuh**, jangan diurut. Dokumen ini ditulis untuk dibuka saat mengerjakan sesuatu, bukan dibaca habis sekali duduk.
