# Setup Tambahan yang Wajib Dilakukan di Laravel Project Lokal

File-file di sesi ini menambahkan middleware custom (`seller`, `admin`) dan
menggunakan Laravel Sanctum untuk token auth. Laravel 12 tidak lagi punya
`app/Http/Kernel.php` — middleware alias didaftarkan di `bootstrap/app.php`.

## 1. Install Sanctum (kalau belum)

```bash
composer require laravel/sanctum
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
php artisan migrate
```

## 2. Daftarkan Middleware Alias

Edit `bootstrap/app.php`, tambahkan di bagian `->withMiddleware()`:

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->alias([
        'seller' => \App\Http\Middleware\EnsureUserIsSeller::class,
        'admin' => \App\Http\Middleware\EnsureUserIsAdmin::class,
    ]);
})
```

## 3. Pastikan `routes/api.php` Ter-load

Laravel 12 default install (`laravel new`) sudah otomatis include
`routes/api.php` jika dipilih saat instalasi. Kalau belum ada di
`bootstrap/app.php`, tambahkan:

```php
->withRouting(
    web: __DIR__.'/../routes/web.php',
    api: __DIR__.'/../routes/api.php',
    commands: __DIR__.'/../routes/console.php',
    health: '/up',
)
```

## 4. Jalankan Seeder

**Wajib**, sistem tidak akan berfungsi tanpa ini — checkout akan gagal
total tanpa commission rule aktif:

```bash
php artisan db:seed
```

Ini akan mengisi:
- **CommissionRuleSeeder** — rate komisi global 5% (PLACEHOLDER, lihat
  catatan di file seeder — konfirmasi angka final sebelum live, ubah
  lewat `CommissionService::setRate()`, JANGAN edit row di database
  langsung).
- **PaymentProviderSeeder** — 4 row provider (Midtrans/Xendit/Duitku/
  iPaymu), semua `is_active=false`, tanpa kredensial. Aktifkan satu
  lewat endpoint `POST /api/admin/payment-providers/activate` setelah
  punya akun admin (lihat langkah 5).
- **CategorySeeder** — kategori dasar untuk form Tambah Produk.

## 5. Seed Admin Pertama (Kamu Sendiri)

Karena `is_admin` baru ditambahkan, belum ada seeder otomatis untuk ini.
Jalankan manual via Tinker setelah migrate, untuk akun pertamamu:

```bash
php artisan tinker
```

```php
$user = \App\Domain\User\Models\User::where('email', 'emailmu@example.com')->first();
$user->is_admin = true;
$user->save();
```

(Atau register dulu lewat `/api/register`, baru jalankan langkah di atas.)

## 6. Cek `config/sanctum.php` — Stateful Domains

Karena frontend akan jadi domain/origin yang mungkin beda dari backend
(sesuai keputusan arsitektur split kita), pastikan **tidak** mengandalkan
`EnsureFrontendRequestsAreStateful` Sanctum (itu untuk SPA same-domain
dengan cookie) — kita pakai **personal access token murni** (Bearer
token), jadi tidak perlu konfigurasi `stateful` domains sama sekali.
Cukup pastikan `Authorization: Bearer <token>` dikirim di setiap request
dari frontend, sesuai contoh di `DannShop-Gemini-Instructions.md`.

## 7. Contoh: Mengaktifkan Midtrans (Provider Prioritas)

Setelah login sebagai admin dan mendapat token, aktifkan Midtrans
dengan request berikut (server_key dari dashboard sandbox/production
Midtrans-mu):

```bash
curl -X POST https://domainmu.com/api/admin/payment-providers/activate \
  -H "Authorization: Bearer TOKEN_ADMIN_KAMU" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_key": "midtrans",
    "supports_dynamic_qris": true,
    "credentials": {
      "server_key": "SB-Mid-server-xxxxxxxxxxxxxxxxxxxxx",
      "is_production": false
    }
  }'
```

Catatan: `MidtransGateway` hanya membaca `server_key` dan
`is_production` dari kolom credentials — tidak perlu client_key untuk
flow Core API yang dipakai di sini (client_key relevan untuk Snap.js
di sisi frontend, bukan untuk request server-to-server ini). Set
`is_production: false` untuk testing di sandbox dulu.
