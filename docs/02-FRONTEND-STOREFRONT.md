# 02 — Frontend / Storefront

Dokumen ini mendaftar semua halaman yang dilihat **pembeli** (bukan admin — panel admin ada di `web/src/app/admin/`, tidak dibahas detail di sini karena bukan bagian dari "storefront") beserta komponen yang membentuknya, dan tabel referensi cepat "mau ubah X, edit file mana".

> Semua path relatif dari root repo. Halaman dengan tanda **(Client)** artinya file-nya diawali `"use client";` (interaktif, jalan di browser). Tanpa tanda itu berarti Server Component (render di server, tidak bisa `useState`/`onClick` langsung).

## 1. Daftar Halaman Storefront

| URL | File `page.tsx` | Tipe | Isi |
|---|---|---|---|
| `/` | `web/src/app/(public)/page.tsx` | Server | Beranda: banner promo, produk trending, katalog per kategori (tab). |
| `/[categorySlug]/[productSlug]` | `web/src/app/(public)/[categorySlug]/[productSlug]/page.tsx` | Server | Detail produk + form checkout lengkap. |
| `/cek-transaksi` | `web/src/app/(public)/cek-transaksi/page.tsx` | Server | Cari pesanan lama (untuk pembeli tamu yang kehilangan link invoice). |
| `/faq` | `web/src/app/(public)/faq/page.tsx` | Server | FAQ (konten dari database, diedit lewat admin — lihat §4). |
| `/syarat-ketentuan` | `web/src/app/(public)/syarat-ketentuan/page.tsx` | Server | Syarat & Ketentuan (konten dari database). |
| `/kebijakan-privasi` | `web/src/app/(public)/kebijakan-privasi/page.tsx` | Server | Kebijakan Privasi (konten dari database). |
| `/kontak` | `web/src/app/(public)/kontak/page.tsx` | Server | Link WhatsApp/Telegram CS (dari database) + jam operasional (hardcode). |
| `/login` | `web/src/app/login/page.tsx` | **Client** | Form login email+password. |
| `/register` | `web/src/app/register/page.tsx` | **Client** | Form registrasi member baru. |
| `/account` | `web/src/app/account/page.tsx` | Server | Dashboard member: saldo, 5 order terakhir, 3 deposit terakhir. Redirect ke `/login` kalau belum login. |
| `/account/deposit` | `web/src/app/account/deposit/page.tsx` | Server | Form isi saldo. |
| `/account/deposit/[depositId]` | `web/src/app/account/deposit/[depositId]/page.tsx` | Server | Status pembayaran deposit (polling real-time). |
| `/account/deposits` | `web/src/app/account/deposits/page.tsx` | Server | Riwayat lengkap semua deposit. |
| `/account/orders` | `web/src/app/account/orders/page.tsx` | Server | Riwayat lengkap semua pesanan. |
| `/invoice/[token]` | `web/src/app/invoice/[token]/page.tsx` | Server (`force-dynamic`) | Halaman invoice publik (tidak wajib login) — instruksi bayar + status real-time. |
| `/maintenance` | `web/src/app/maintenance/page.tsx` | Server | Halaman "sedang maintenance" (otomatis ditampilkan lewat `proxy.ts` kalau mode maintenance aktif — lihat `docs/01-ARSITEKTUR.md`). |

**Catatan folder route group `(public)`:** halaman-halaman dengan `(public)/` di path-nya berbagi satu `layout.tsx` (`web/src/app/(public)/layout.tsx`) yang otomatis menambahkan header (`SiteHeader`), footer (`SiteFooter`), dan tombol bantuan mengambang (`FloatingSupportButton`). Halaman **di luar** `(public)/` — yaitu `account/*`, `invoice/*`, `login`, `register`, `maintenance` — **TIDAK** punya header/footer situs itu, masing-masing membangun tampilan minimalnya sendiri langsung di `page.tsx`.

## 2. Komponen per Halaman

### Beranda (`/`)
| Komponen | File |
|---|---|
| `CatalogTabs` **(Client)** | `web/src/app/(public)/catalog-tabs.tsx` — tab kategori, merender grid `ProductCard`. |
| `ProductCard` | `web/src/app/(public)/product-card.tsx` — satu kartu produk di grid katalog. |
| `BannerCarousel` **(Client)** | `web/src/components/banner-carousel.tsx` — carousel banner promo auto-geser. |
| `TrendingSection` | `web/src/components/trending-section.tsx` — strip produk trending. |

### Detail Produk & Checkout (`/[categorySlug]/[productSlug]`)
| Komponen | File |
|---|---|
| `ProductDetailClient` **(Client)** | `web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx` — **ini file paling penting untuk UI checkout**: input data akun tujuan, pilihan nominal (termasuk pengelompokan flash sale/grup), pilihan metode bayar, form kontak, tombol beli. |
| `TrustBadges` | `web/src/components/trust-badges.tsx` — badge kepercayaan ("Proses Cepat", dll.) di halaman ini. |

### Cek Transaksi (`/cek-transaksi`)
| Komponen | File |
|---|---|
| `CekTransaksiForm` **(Client)** | `web/src/app/(public)/cek-transaksi/cek-transaksi-form.tsx` |

### Isi Saldo / Deposit (`/account/deposit*`)
| Komponen | File |
|---|---|
| `DepositForm` **(Client)** | `web/src/app/account/deposit/deposit-form.tsx` |
| `DepositStatus` **(Client)** | `web/src/app/account/deposit/[depositId]/deposit-status.tsx` — polling `/api/deposits/[depositId]/status` tiap 3 detik lewat `@tanstack/react-query`. |

### Invoice (`/invoice/[token]`)
| Komponen | File |
|---|---|
| `InvoiceStatus` **(Client)** | `web/src/app/invoice/[token]/invoice-status.tsx` — polling `/api/orders/[token]/status` tiap 3 detik, tampilkan instruksi bayar/status/serial number, tombol kirim ke WhatsApp. |

## 3. Komponen Global (Dipakai Lintas Halaman)

Semua ada di `web/src/components/` (bukan `components/ui/`, itu primitif dasar — lihat §5).

| Komponen | File | Dipakai di | Fungsi |
|---|---|---|---|
| `SiteHeader` | `site-header.tsx` | `(public)/layout.tsx` | Navbar atas: logo, pencarian, dark/light toggle, drawer menu. |
| `SiteFooter` | `site-footer.tsx` | `(public)/layout.tsx` | Footer: marquee logo pembayaran, peta situs, link dukungan, kontak CS. |
| `FloatingSupportButton` **(Client)** | `floating-support-button.tsx` | `(public)/layout.tsx` | Tombol bantuan mengambang kanan-bawah (WA/Telegram). |
| `CategoryDrawer` **(Client)** | `category-drawer.tsx` | `site-header.tsx` | Drawer slide-in: daftar kategori, cek transaksi, akun/admin/login/keluar, kontak CS. |
| `SearchOverlay` **(Client)** | `search-overlay.tsx` | `site-header.tsx` | Kotak pencarian yang melebar, query ke `/api/search`. |
| `ThemeToggle` **(Client)** | `theme-toggle.tsx` | `site-header.tsx` | Tombol ganti mode terang/gelap (pakai `next-themes`). |
| `PaymentMethodMarquee` **(Client)** | `payment-method-marquee.tsx` | `site-footer.tsx` | Strip logo metode pembayaran yang berjalan otomatis, ada efek "magnet" saat kursor mendekat. |
| `ThemeProvider` | `theme-provider.tsx` | `app/layout.tsx` (root) | Bungkus `next-themes`. |
| `QueryProvider` | `query-provider.tsx` | `app/layout.tsx` (root) | Sediakan `@tanstack/react-query` client untuk seluruh app (dipakai fitur polling). |

## 4. Tabel Cepat: "Mau Ubah Apa → Edit File Mana"

| Yang mau diubah | Edit file ini | Catatan |
|---|---|---|
| Tampilan kartu produk di katalog | `web/src/app/(public)/product-card.tsx` | |
| Layout/urutan/isi form checkout | `web/src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx` | Logic harga (flash sale/member) jangan diubah di sini — itu dihitung di server, lihat `docs/04`. |
| Navbar/header (logo, urutan ikon) | `web/src/components/site-header.tsx` | Logo & favicon sendiri diatur lewat `/admin/settings`, bukan hardcode di sini. |
| Footer (link, kolom) | `web/src/components/site-footer.tsx` | |
| Drawer menu mobile | `web/src/components/category-drawer.tsx` | |
| Tombol bantuan mengambang | `web/src/components/floating-support-button.tsx` | |
| Banner carousel beranda | `web/src/components/banner-carousel.tsx` | Isi bannernya sendiri (gambar, link) diatur lewat `/admin/banners`, BUKAN di file ini. |
| Strip produk trending | `web/src/components/trending-section.tsx` | Produk mana yang tampil diatur lewat `/admin/settings` (manual/otomatis). |
| Halaman FAQ | **BUKAN file kode** — `/admin/settings` bagian FAQ | Kalau mau ubah struktur/tampilan (bukan isi teks): `web/src/app/(public)/faq/page.tsx` |
| Isi Syarat & Ketentuan / Kebijakan Privasi | **BUKAN file kode** — `/admin/settings` | Format teksnya "lite markdown" (`## judul`, `- bullet`) — lihat `web/src/lib/content/lite-markdown.tsx` untuk aturan lengkapnya. Kalau mau ubah TAMPILAN (bukan isi teks): `web/src/app/(public)/syarat-ketentuan/page.tsx` / `kebijakan-privasi/page.tsx`. |
| Nomor WA/username Telegram CS / jam operasional | **BUKAN file kode** — `/admin/settings` bagian Kontak CS | Halaman `/kontak` + drawer + footer + tombol mengambang otomatis ikut berubah, semua baca dari sumber yang sama (`getSiteSettings()`). |
| Logo & favicon situs | **BUKAN file kode** — `/admin/settings` | |
| Warna tema (primary, accent, dll.) | `web/src/app/globals.css` | Lihat §5. |
| Radius sudut (border-radius) global | `web/src/app/globals.css`, variabel `--radius` | |
| Font | `web/src/app/layout.tsx` (import `Geist`/`Geist_Mono`/`Baloo_2` dari `next/font/google`) | |
| Halaman login/register | `web/src/app/login/page.tsx` / `web/src/app/register/page.tsx` | Form-nya langsung ditulis di `page.tsx` (bukan dipecah ke komponen client terpisah). |
| Halaman invoice (tampilan status bayar) | `web/src/app/invoice/[token]/invoice-status.tsx` | |
| Halaman isi saldo | `web/src/app/account/deposit/deposit-form.tsx` (form) / `deposit-status.tsx` (halaman status) | |
| Komponen dasar (tombol, input, dll.) | `web/src/components/ui/*.tsx` | Lihat §5 — hati-hati, dipakai di HAMPIR SEMUA halaman termasuk admin. |

## 5. Styling

**Teknologi:** Tailwind CSS v4. Berbeda dari Tailwind v3, **tidak ada file `tailwind.config.js`** — konfigurasi (warna, radius, dll.) ditulis langsung sebagai CSS custom property di `web/src/app/globals.css`, dengan sintaks `@theme inline { ... }`.

### 5.1 Cara ubah warna tema global

Buka `web/src/app/globals.css`. Ada 3 bagian penting:

```css
@theme inline {
  /* Mapping nama utility Tailwind (mis. bg-primary) ke CSS variable */
  --color-primary: var(--primary);
  --color-accent: var(--accent);
  /* ...dst */
}

:root {
  /* Nilai warna MODE TERANG */
  --primary: #4338CA;
  --accent: #EA580C;
  /* ...dst */
}

.dark {
  /* Nilai warna MODE GELAP (override otomatis saat class "dark" aktif di <html>) */
  --primary: #7C3AED;
  --accent: #F43F5E;
  /* ...dst */
}
```

Untuk mengubah warna utama situs, edit nilai hex di blok `:root` (mode terang) dan `.dark` (mode gelap) — **bukan** di `@theme inline` (itu cuma pemetaan nama, jarang perlu disentuh). Dipakai di komponen lewat class Tailwind biasa: `bg-primary`, `text-primary`, `ring-primary`, dst — Tailwind v4 otomatis membaca dari `--color-primary` yang sudah dipetakan.

### 5.2 Komponen dasar (`web/src/components/ui/`)

Gaya **shadcn** (`components.json`, style `"base-nova"`), primitif interaktif (Checkbox, RadioGroup, Select, dll.) dari library **`@base-ui/react`**. Isi folder ini: `badge.tsx`, `button.tsx`, `card.tsx`, `checkbox.tsx`, `input.tsx`, `label.tsx`, `radio-group.tsx`, `select.tsx`, `table.tsx`, `textarea.tsx`.

> ⚠️ **Hati-hati mengedit file di `components/ui/`** — ini dipakai di storefront DAN panel admin sekaligus. Perubahan di sini akan terlihat di mana-mana.

Contoh nyata varian styling lewat `class-variance-authority` (cva), dari `web/src/components/ui/button.tsx`:
```tsx
const buttonVariants = cva("...", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground hover:bg-primary/80",
      outline: "border-border bg-background hover:bg-muted ...",
      ghost: "hover:bg-muted hover:text-foreground ...",
      destructive: "bg-destructive/10 text-destructive ...",
    },
    size: { default: "h-8 ...", sm: "h-7 ...", lg: "h-9 ...", icon: "size-8" },
  },
});
```
Untuk menambah varian tombol baru, tambahkan entri baru di objek `variant`/`size` ini.

### 5.3 Dark mode

Diatur `next-themes` (`web/src/components/theme-provider.tsx`), toggle di `web/src/components/theme-toggle.tsx`. Class `dark` ditambahkan/dihapus dari `<html>`, otomatis membuat semua variabel di blok `.dark` pada `globals.css` (§5.1) aktif menggantikan `:root`.

---

## Cheat Sheet — Frontend/Storefront

| Saya mau ubah... | Edit file ini |
|---|---|
| Kartu produk | `web/src/app/(public)/product-card.tsx` |
| Form checkout | `.../[productSlug]/product-detail-client.tsx` |
| Navbar | `web/src/components/site-header.tsx` |
| Footer | `web/src/components/site-footer.tsx` |
| Warna tema | `web/src/app/globals.css` (blok `:root` & `.dark`) |
| Konten FAQ/TOS/Privasi/Kontak | Panel admin `/admin/settings` — **bukan file kode** |
| Tombol/input dasar | `web/src/components/ui/*.tsx` (hati-hati, dipakai di mana-mana) |
| Font | `web/src/app/layout.tsx` |
