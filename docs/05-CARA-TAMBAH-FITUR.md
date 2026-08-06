# 05 — Cara Menambah Fitur

Panduan step-by-step untuk skenario umum. Semua contoh diambil dari pola yang **sudah dipakai** di codebase ini — ikuti pola yang sama supaya konsisten.

> 💡 Kalau ragu file mana yang harus disentuh untuk sesuatu yang tidak ada di sini, cari dulu contoh yang MIRIP di codebase (mis. mau nambah halaman admin baru → lihat struktur `web/src/app/admin/wallet-ledger/` sebagai contoh halaman admin sederhana), lalu tiru polanya.

---

## 1. Cara Menambah Produk / Kategori Baru

**Ini TIDAK butuh coding sama sekali** — semuanya lewat panel admin:

1. Buka `/admin/categories` → tambah kategori baru (kalau produknya masuk kategori yang belum ada).
2. Buka `/admin/products` → "Tambah Produk" → isi nama, kategori, slug, `inputFields` (JSON array field yang harus diisi pembeli, mis. `[{"name":"user_id","label":"User ID"},{"name":"zone_id","label":"Zone ID"}]`), upload ikon (1:1) & banner (21:9).
3. Buka halaman edit produk yang baru dibuat → tambah nominal/item (`ProductItem`) satu-satu, ATAU pakai "Import Massal" (`/admin/products/import`) untuk menarik banyak nominal sekaligus dari cache harga Digiflazz (harus sudah sinkron harga dulu di `/admin/providers`).
4. **Wajib**: petakan tiap nominal ke SKU provider (tombol "Petakan SKU" di tiap baris item) — tanpa ini, item tidak akan pernah bisa dibeli (`isItemPurchasable` akan selalu `false`, lihat `web/src/lib/catalog/public.ts`).
5. Aktifkan produk (toggle "Aktifkan") — produk baru selalu mulai dalam keadaan nonaktif, dan tidak bisa diaktifkan kalau belum punya minimal 1 item.

**Kalau mau menambah field BARU di form produk/item** (misalnya field custom baru), itu baru butuh coding — lihat §5 (menambah field database) karena hampir pasti butuh kolom baru di tabel `Product`/`ProductItem`.

---

## 2. Cara Menambah Metode Pembayaran Baru

Ada 2 skenario berbeda:

### 2a. Menambah bank VA baru yang Midtrans SUDAH dukung dengan pola yang SAMA seperti BCA/BNI/BRI/CIMB

Kalau metode barunya pakai `payment_type: "bank_transfer"` standar (bukan Permata/Mandiri yang polanya beda — lihat `docs/04-INTEGRASI-PAYMENT-PPOB.md` §2.3):

1. **Tidak perlu ubah kode `web/src/lib/midtrans/client.ts`** — fungsi `chargeBankTransfer` sudah generik, dan `chargeByMethodCode` sudah otomatis menangani kode apa pun yang diawali `va_` (`method.slice(3)` diambil sebagai nama bank, mis. `va_bsi` → `bsi`). **KECUALI** kalau TypeScript perlu tipe union bank-nya diperluas — cek signature `chargeBankTransfer` (`bank: "bca" | "bni" | "bri" | "cimb"`), tambahkan kode bank baru ke union type itu.
2. Buka `/admin/payment-methods` → cek apakah sudah ada baris untuk metode itu. Kalau belum ada di seed data (`web/prisma/seed.ts`), perlu ditambahkan lewat migrasi (buat baris baru di tabel `PaymentMethodConfig`, `code` harus `va_<namabank>`) — lihat §5 cara bikin migrasi.
3. Isi `label`, `feeFlat`/`feePercent`, upload logo, aktifkan.

### 2b. Menambah metode pembayaran yang Midtrans dukung tapi POLA RESPONSE-nya BEDA (mis. GoPay, kartu kredit, ShopeePay)

Ini butuh kode baru, karena tiap `payment_type` Midtrans punya bentuk request/response sendiri (lihat betapa berbedanya `chargeQris` vs `chargePermataVA` vs `chargeEchannel` di `web/src/lib/midtrans/client.ts`):

1. Cek dokumentasi resmi Midtrans Core API untuk `payment_type` yang dimaksud — catat bentuk request & response-nya.
2. Tambahkan fungsi baru di `web/src/lib/midtrans/client.ts`, ikuti pola fungsi `charge*` yang sudah ada (Zod schema untuk validasi response, `customExpiry(expiryMinutes)` WAJIB disertakan supaya waktu kedaluwarsa sinkron dengan job lokal).
3. Tambahkan interface hasil baru di `PaymentActions` (union type di bagian bawah `client.ts`).
4. Tambahkan cabang baru di `chargeByMethodCode` untuk kode metode barunya.
5. Update UI yang menampilkan instruksi bayar berdasar `PaymentActions.kind` — cari semua tempat yang melakukan `switch`/`if` atas `actions.kind` (setidaknya `web/src/app/invoice/[token]/invoice-status.tsx` dan `web/src/app/account/deposit/[depositId]/deposit-status.tsx`).
6. Tambahkan baris baru di `PaymentMethodConfig` (lewat migrasi, §5) dan aktifkan lewat `/admin/payment-methods`.

---

## 3. Cara Menambah Halaman Baru di Storefront

1. Tentukan URL yang diinginkan, lalu buat folder yang sesuai di `web/src/app/(public)/` (kalau halamannya perlu header/footer situs biasa) atau langsung di `web/src/app/` (kalau tidak, seperti `login`/`register`/`invoice`). Contoh: mau bikin `/promo` → buat `web/src/app/(public)/promo/page.tsx`.
2. Isi `page.tsx` — kalau cuma menampilkan data (tidak interaktif), bikin Server Component langsung (`async function PromoPage()`, boleh langsung `await` Prisma/fungsi dari `web/src/lib/`). Kalau butuh interaktivitas (form, state, event handler), pisahkan ke komponen client terpisah dan panggil dari `page.tsx` — ikuti pola yang sudah dipakai di HAMPIR SEMUA halaman lain (lihat `docs/02-FRONTEND-STOREFRONT.md` §2, pola "`page.tsx` Server → komponen Client").
3. Kalau halamannya perlu muncul di navigasi, tambahkan link-nya secara manual di `web/src/components/site-footer.tsx` (array `SUPPORT_LINKS`) dan/atau `web/src/components/category-drawer.tsx`.
4. Kalau halamannya perlu `<title>` khusus, tambahkan `export const metadata: Metadata = { title: "..." };` di `page.tsx` (lihat contoh di `web/src/app/(public)/faq/page.tsx`).

---

## 4. Cara Menambah Endpoint API Baru

**Tanya dulu: apakah ini benar-benar butuh API Route (`route.ts`), atau cukup Server Action?**

- Kalau dipanggil dari FORM di halaman aplikasi ini sendiri → **pakai Server Action** (lebih simpel, lihat §format di bawah), TIDAK perlu bikin `route.ts`.
- Kalau dipanggil dari LUAR aplikasi (webhook pihak ketiga, cron eksternal) atau butuh polling `fetch()` manual dari komponen client → baru pakai API Route.

### 4a. Menambah Server Action baru

1. Pilih file yang sesuai di `web/src/app/actions/` (atau buat file baru kalau memang kategori fitur baru), tambahkan `"use server";` di baris pertama fungsi (bukan file, kecuali filenya memang seluruhnya action).
2. Ikuti pola: validasi input dengan Zod → (kalau admin-only) panggil `requireAdmin()` lokal → proses ke database lewat `db` (`@/lib/db`) → kalau admin, panggil `logAdmin()` → `revalidatePath(...)` kalau ada halaman yang perlu di-refresh cache-nya → return `{ ok: "..." }` atau `{ error: "..." }`.
3. Panggil dari komponen: server action bisa langsung dipakai sebagai `action` prop pada `<form>`, atau lewat `useActionState` di komponen client (lihat pola `withPrevState` di banyak komponen client admin, mis. `web/src/app/admin/settings/favicon-form.tsx`).

### 4b. Menambah API Route baru

1. Buat folder+file `web/src/app/api/<path>/route.ts`.
2. Export fungsi async sesuai method HTTP: `export async function GET(request: Request) { ... }`, `POST`, dst.
3. **Kalau endpoint ini sensitif** (butuh diproteksi), tentukan cara proteksinya — contoh pola yang sudah ada:
   - **Session + role** (seperti `/api/admin/provider-price-list`): panggil `auth()`, cek `role`, re-cek fresh ke DB.
   - **Secret header** (seperti `/api/cron/tick`): cek header custom, bandingkan dengan `safeCompare` (JANGAN pakai `===` biasa untuk membandingkan secret — rentan timing attack).
   - **Signature verification** (seperti webhook Midtrans): verifikasi tanda tangan kriptografis SEBELUM menyentuh database sama sekali.
4. Kembalikan response dengan `NextResponse.json(...)`.
5. Kalau endpoint publik yang bisa disalahgunakan (dipanggil berulang-ulang), tambahkan aturan rate-limit baru di `web/src/proxy.ts` (array `RATE_LIMITS`) DAN tambahkan path-nya ke `matcher` di bagian bawah file itu kalau belum tercakup.

---

## 5. Cara Menambah Field Baru di Database (Migration)

Ini bagian **paling penting untuk dipahami benar** — proyek ini pernah mengalami insiden production down secara senyap gara-gara langkah ini terlewat (lihat `docs/06-TROUBLESHOOTING-DEPLOY.md` §4).

### Langkah-langkah

1. **Edit `web/prisma/schema.prisma`** — tambahkan field/model baru. Kalau field-nya opsional (boleh kosong), pakai tanda `?` (mis. `catatan String?`) — kalau tidak, migrasi bisa gagal di tabel yang sudah ada isinya (Prisma tidak tahu harus isi apa untuk baris lama).
2. **Jalankan migrasi ke database LOKAL:**
   ```
   cd web
   npx prisma migrate dev --name nama_singkat_perubahan
   ```
   Ini otomatis: (a) membuat file SQL migrasi baru di `web/prisma/migrations/`, (b) menerapkannya ke database lokal, (c) meng-generate ulang Prisma Client (supaya TypeScript tahu field/model barunya).
3. **Pakai field/model barunya di kode** — sekarang `db.namaModel.namaField` sudah dikenali TypeScript.
4. **Sebelum/segera setelah push ke production**, jalankan migrasi yang SAMA ke database production:
   ```
   cd web
   npx dotenv -e .env.production -- npx prisma migrate deploy
   ```
   **JANGAN LEWATKAN LANGKAH INI.** Proyek ini di-deploy ke Vercel, dan **Vercel TIDAK PERNAH otomatis menjalankan migrasi database** — `npx next build` di pipeline Vercel cuma membangun kode, tidak menyentuh skema database sama sekali. Kalau langkah ini terlewat dan kode baru butuh kolom/tabel yang belum ada di production, build Vercel akan **gagal secara senyap** — Vercel akan terus menyajikan build LAMA tanpa error yang terlihat siapa pun, sampai ada yang secara khusus mengecek log build Vercel. Detail lengkap kejadian nyata ini ada di `docs/06-TROUBLESHOOTING-DEPLOY.md`.

### Kalau perlu mengisi data awal (seed) untuk kolom/tabel baru

- **Data yang harus ADA di semua environment** (mis. kategori default, metode pembayaran default) → tulis sebagai SQL `INSERT ... ON DUPLICATE KEY UPDATE` (idempoten) di dalam file migrasi itu sendiri, JANGAN taruh di `web/prisma/seed.ts` saja — `seed.ts` cuma jalan kalau dipanggil manual, gampang lupa dijalankan ke production, sementara migrasi SELALU harus dijalankan (lihat poin 4 di atas).
- **Data uji coba/dev-only** → boleh cukup di `web/prisma/seed.ts`.

---

## Cheat Sheet — Cara Tambah Fitur

| Skenario | Ringkasan langkah |
|---|---|
| Produk/kategori baru | Lewat panel admin, tanpa coding — `/admin/categories` lalu `/admin/products` |
| Metode pembayaran (bank VA baru, pola sudah ada) | Cukup tambah baris `PaymentMethodConfig` (migrasi) + aktifkan di `/admin/payment-methods` |
| Metode pembayaran (pola baru, mis. GoPay/kartu) | Kode baru di `web/src/lib/midtrans/client.ts` + update UI instruksi bayar |
| Halaman storefront baru | Folder baru di `web/src/app/(public)/`, ikuti pola Server+Client component |
| Server Action baru | Tambah fungsi `"use server"` di `web/src/app/actions/*.ts` |
| API Route baru | `web/src/app/api/<path>/route.ts`, tentukan cara proteksinya |
| Field/tabel database baru | Edit `schema.prisma` → `prisma migrate dev` (lokal) → **`prisma migrate deploy` ke production, JANGAN LUPA** |
| Provider PPOB baru (selain Digiflazz) | Buat class baru implement `TopupProviderAdapter` (`web/src/lib/providers/types.ts`), daftarkan di `switch` pada `web/src/lib/providers/registry.ts` `getAdapter()` |
