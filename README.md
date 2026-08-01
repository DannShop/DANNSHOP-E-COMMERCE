# DannShop — Paket Lengkap (Backend + Frontend)

Ini adalah paket final: backend Laravel API + frontend (HTML/CSS/JS murni)
untuk platform DannShop.

## Struktur

```
app/                    ← Backend: Domain (business logic) + Http (Controller, Resource, Middleware)
routes/                 ← api.php (semua endpoint), console.php (scheduled commands)
database/
  migrations/           ← 29 tabel
  seeders/               ← Data awal (commission rate, payment providers, kategori)
frontend/
  public/               ← Storefront, checkout, payment status (buyer-facing, tanpa login)
  seller/                ← Dashboard seller (butuh login token)
  admin/                 ← Panel admin (withdrawal queue, payment provider config)
setup.sh                ← Script setup otomatis
SETUP-NOTES.md          ← Detail manual setup (middleware, Sanctum, contoh curl)
```

## Cara Pakai

### 1. Buat project Laravel baru

```bash
composer create-project laravel/laravel dannshop
cd dannshop
```

### 2. Copy semua isi paket ini ke dalam project

Salin folder `app/`, `routes/`, `database/`, `frontend/`, file `setup.sh`,
dan `SETUP-NOTES.md` ke root project Laravel (replace file default yang
bentrok, seperti `routes/api.php` dan `routes/console.php`).

### 3. Isi `.env`

```env
DB_DATABASE=nama_database_kamu
DB_USERNAME=...
DB_PASSWORD=...
```

### 4. Tambahkan middleware alias (WAJIB, manual)

Edit `bootstrap/app.php`, di dalam `->withMiddleware()`:

```php
$middleware->alias([
    'seller' => \App\Http\Middleware\EnsureUserIsSeller::class,
    'admin' => \App\Http\Middleware\EnsureUserIsAdmin::class,
]);
```

`setup.sh` akan mengecek ini dan mengingatkan kalau belum ditambahkan.

### 5. Jalankan setup

```bash
chmod +x setup.sh
./setup.sh
```

Script ini akan otomatis: install Composer + Sanctum, generate APP_KEY,
jalankan migration + seeder, buat storage symlink, set permission, dan
membuatkan akun admin pertama secara interaktif.

### 6. Jalankan server lokal

```bash
php artisan serve
```

### 7. Buka frontend

Karena frontend adalah file HTML statis, buka langsung lewat browser
atau lewat static server sederhana. Untuk testing cepat tanpa server
routing kompleks:

```
frontend/seller/login.html
frontend/admin/login.html
frontend/public/storefront.html?store=slug-tokomu
```

### 8. Aktifkan Midtrans

Login sebagai admin di `frontend/admin/login.html`, buka
`payment-providers.html`, klik "Aktifkan" pada Midtrans, isi Server Key
dari dashboard sandbox Midtrans-mu.

## Alur Testing Lengkap

1. Daftar seller baru (`POST /api/register` atau bikin form register.html sendiri)
2. Buat toko pertama (`frontend/seller/onboarding.html`)
3. Tambah produk (`frontend/seller/products.html`)
4. Publikasikan produk
5. Buka storefront publik (`frontend/public/storefront.html?store=slugmu`)
6. Klik produk → checkout → isi email/HP → dapat QRIS
7. Bayar via sandbox Midtrans
8. Cek status pembayaran otomatis update (`payment-status.html`)
9. Login seller → cek saldo bertambah di `wallet.html`
10. Ajukan withdrawal → login admin → approve → complete

## Dokumen Referensi

- `DannShop-Architecture-v1.md` — Vision, arsitektur sistem
- `DannShop-Design-System-v1.md` — Design tokens (sudah diimplementasikan di CSS)
- `DannShop-Flows-v1.md` — 10 business flow detail
- `DannShop-Database-Architecture-v2.md` — Skema database final
- `DannShop-Payment-Gateway-Research-v1.1.md` — Riset Midtrans/Xendit/Duitku/iPaymu
- `DannShop-Deploy-Rumahweb-Guide.md` — Panduan deploy production
- `DannShop-Gemini-Instructions.md` — Instruksi jika ada bagian frontend yang mau didesain ulang oleh Gemini

## Catatan Penting

- **Xendit, Duitku, iPaymu**: struktur kode sudah benar, tapi beberapa
  endpoint URL masih perlu dikonfirmasi dari dashboard masing-masing
  (ditandai `TODO` jelas di kode). Midtrans sudah lengkap dan siap pakai
  karena sudah terverifikasi terhadap dokumentasi resmi dan kamu sudah
  punya akun.
- **Rate komisi 5%** di seeder adalah placeholder — konfirmasi angka
  final sebelum go-live.
- **GoPay tidak termasuk** — sudah diputuskan untuk di-drop karena tidak
  ada API resmi untuk akun GoPay Merchant biasa.
