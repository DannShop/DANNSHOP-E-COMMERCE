#!/bin/bash

# =============================================================================
# DannShop — Setup Script
# Jalankan sekali setelah `laravel new dannshop` dan copy semua file dari
# dannshop-dapur-final.zip ke dalam project Laravel.
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
# =============================================================================

set -e  # exit immediately kalau ada command yang gagal

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "======================================================"
echo "  DannShop — Backend Setup"
echo "======================================================"
echo ""

# ------------------------------------------------------------------------------
# 1. Cek .env ada
# ------------------------------------------------------------------------------
log_info "Mengecek .env..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    log_warn ".env dibuat dari .env.example — pastikan isi DB_DATABASE, DB_USERNAME, DB_PASSWORD sebelum lanjut!"
    echo ""
    read -p "Sudah isi .env? (y/n): " confirm
    if [ "$confirm" != "y" ]; then
        log_error "Setup dibatalkan. Isi .env dulu lalu jalankan ulang."
        exit 1
    fi
else
    log_success ".env sudah ada."
fi

# ------------------------------------------------------------------------------
# 2. Install Composer dependencies
# ------------------------------------------------------------------------------
log_info "Menjalankan composer install..."
composer install --optimize-autoloader --no-interaction
log_success "Composer dependencies terpasang."

# ------------------------------------------------------------------------------
# 3. Install Laravel Sanctum
# ------------------------------------------------------------------------------
log_info "Menginstall Laravel Sanctum..."
composer require laravel/sanctum --no-interaction
log_success "Sanctum terpasang."

# ------------------------------------------------------------------------------
# 4. Generate APP_KEY kalau belum ada
# ------------------------------------------------------------------------------
APP_KEY_VALUE=$(grep "^APP_KEY=" .env | cut -d'=' -f2)
if [ -z "$APP_KEY_VALUE" ] || [ "$APP_KEY_VALUE" = "" ]; then
    log_info "Generating APP_KEY..."
    php artisan key:generate
    log_success "APP_KEY digenerate."
else
    log_success "APP_KEY sudah ada."
fi

# ------------------------------------------------------------------------------
# 5. Publish Sanctum config
# ------------------------------------------------------------------------------
log_info "Publishing Sanctum config..."
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider" --no-interaction
log_success "Sanctum config dipublish."

# ------------------------------------------------------------------------------
# 5b. Cek middleware alias sudah terdaftar (WAJIB manual, tidak bisa
#     diotomasi dari sini karena harus edit bootstrap/app.php)
# ------------------------------------------------------------------------------
if grep -q "EnsureUserIsSeller" bootstrap/app.php 2>/dev/null && grep -q "EnsureUserIsAdmin" bootstrap/app.php 2>/dev/null; then
    log_success "Middleware alias 'seller' dan 'admin' sudah terdaftar di bootstrap/app.php."
else
    log_warn "Middleware alias 'seller' dan 'admin' BELUM terdaftar di bootstrap/app.php!"
    echo ""
    echo "  Tanpa ini, SEMUA route /api/seller/* dan /api/admin/* akan error."
    echo "  Tambahkan manual ke bootstrap/app.php, di dalam ->withMiddleware():"
    echo ""
    echo '      $middleware->alias(['
    echo "          'seller' => \\App\\Http\\Middleware\\EnsureUserIsSeller::class,"
    echo "          'admin' => \\App\\Http\\Middleware\\EnsureUserIsAdmin::class,"
    echo '      ]);'
    echo ""
    read -p "Sudah ditambahkan? (y/n): " mw_confirm
    if [ "$mw_confirm" != "y" ]; then
        log_error "Setup dihentikan. Tambahkan middleware alias dulu, lalu jalankan ulang ./setup.sh"
        exit 1
    fi
fi

# ------------------------------------------------------------------------------
# 6. Jalankan migrations
# ------------------------------------------------------------------------------
log_info "Menjalankan migrations (29 tabel + Sanctum)..."
php artisan migrate --force
log_success "Migrations selesai."

# ------------------------------------------------------------------------------
# 7. Jalankan seeders
# ------------------------------------------------------------------------------
log_info "Menjalankan seeders (commission rules, payment providers, categories)..."
php artisan db:seed --force
log_success "Seeders selesai."

# ------------------------------------------------------------------------------
# 8. Buat storage symlink
# ------------------------------------------------------------------------------
log_info "Membuat storage symlink..."
php artisan storage:link
log_success "Storage symlink dibuat."

# ------------------------------------------------------------------------------
# 9. Set permissions
# ------------------------------------------------------------------------------
log_info "Setting permissions storage/ dan bootstrap/cache/..."
chmod -R 775 storage bootstrap/cache
log_success "Permissions diset."

# ------------------------------------------------------------------------------
# 10. Clear & cache config
# ------------------------------------------------------------------------------
log_info "Clearing dan caching config..."
php artisan config:clear
php artisan cache:clear
log_success "Config cleared."

# ------------------------------------------------------------------------------
# 11. Buat akun admin pertama
# ------------------------------------------------------------------------------
echo ""
echo "======================================================"
echo "  Buat Akun Admin Pertama"
echo "======================================================"
echo ""
read -p "Email admin (kamu): " admin_email

if [ -z "$admin_email" ]; then
    log_warn "Email kosong — skip pembuatan akun admin. Lakukan manual via tinker nanti."
else
    log_info "Membuat akun admin untuk ${admin_email}..."
    php artisan tinker --execute="
        \$user = App\Domain\User\Models\User::firstOrCreate(
            ['email' => '${admin_email}'],
            [
                'name' => 'Admin',
                'password' => bcrypt('changeme123'),
                'role_hint' => 'admin',
                'is_admin' => true,
            ]
        );
        \$user->is_admin = true;
        \$user->save();
        echo 'Admin created: ' . \$user->email;
    "
    log_success "Akun admin dibuat dengan password sementara: changeme123"
    log_warn "SEGERA ganti password setelah pertama kali login!"
fi

# ------------------------------------------------------------------------------
# 12. Cek folder frontend/
# ------------------------------------------------------------------------------
echo ""
if [ -d "frontend" ]; then
    log_success "Folder frontend/ ditemukan (public/, seller/, admin/)."
else
    log_warn "Folder frontend/ tidak ditemukan di root project."
    echo "  Pastikan folder 'dannshop-frontend' (dari paket terpisah) sudah"
    echo "  disalin ke root project dan diberi nama 'frontend/', dengan struktur:"
    echo "    frontend/public/   (storefront, checkout, payment status)"
    echo "    frontend/seller/   (dashboard, wallet, produk, pesanan, pengaturan)"
    echo "    frontend/admin/    (withdrawal queue, payment provider)"
fi

# ------------------------------------------------------------------------------
# Done
# ------------------------------------------------------------------------------
echo ""
echo "======================================================"
echo -e "  ${GREEN}Setup selesai!${NC}"
echo "======================================================"
echo ""
echo "Langkah selanjutnya:"
echo ""
echo "  1. Jalankan server lokal:"
echo "     php artisan serve"
echo ""
echo "  2. Buka frontend di browser (contoh, sesuaikan path):"
echo "     frontend/seller/login.html   (daftar dulu lewat POST /api/register,"
echo "                                   atau buat akun manual via tinker)"
echo "     frontend/admin/login.html    (pakai akun admin yang baru dibuat di atas)"
echo ""
echo "  3. Setelah login sebagai admin, aktifkan Midtrans:"
echo "     Buka frontend/admin/payment-providers.html → klik 'Aktifkan' pada Midtrans"
echo "     → isi Server Key dari dashboard sandbox Midtrans-mu"
echo "     (atau lewat curl, lihat contoh di SETUP-NOTES.md langkah 7)"
echo ""
echo "  4. Test alur lengkap:"
echo "     Daftar seller → buat toko (onboarding.html) → tambah produk →"
echo "     publikasikan → buka storefront.html?store=slugmu → checkout →"
echo "     scan QRIS sandbox → cek status di payment-status.html"
echo ""
echo "  5. Untuk deploy production (Rumahweb), lihat:"
echo "     DannShop-Deploy-Rumahweb-Guide.md"
echo ""
echo "  6. Untuk cron job (WAJIB, agar order expiry, reconciliation,"
echo "     ledger integrity check, dll berjalan), lihat:"
echo "     DannShop-Deploy-Rumahweb-Guide.md bagian 'Setup 2 Cron Job'"
echo "     atau untuk lokal, jalankan manual sesekali:"
echo "     php artisan schedule:run"
echo ""
