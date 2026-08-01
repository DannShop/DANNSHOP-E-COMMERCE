# Storefront Redesign Iterasi 1 — Spec Desain

Status: Disetujui Wildan (2026-08-01)

## 1. Latar Belakang

Setelah beranda katalog (tab kategori + grid produk) dibangun, user menunjukkan 11 screenshot referensi visual dari kompetitor (KonterOnlineID) sebagai arah storefront jangka panjang — dibahas "pelan-pelan" per bagian, bukan sekali jalan. Analisis lengkap (dengan `ui-ux-pro-max`) ada di histori percakapan; ringkasan pola yang diadopsi: form checkout bertahap bernomor, grid nominal (bukan dropdown), daftar metode pembayaran bergaya list-row, trust badge, drawer kategori dari hamburger, search fungsional, footer kontak, dan tombol support mengambang.

**Keputusan warna (penting, mengikat seluruh spec ini):** struktur/pola UI dari referensi diikuti, TAPI warna TETAP palet Arah A yang sudah disetujui & dipakai di seluruh app sejak Fase 3 (primary indigo `#4F46E5`, accent oranye `#EA580C`, radius besar, font Baloo 2/`--font-heading`) — bukan cyan-navy seperti referensi. Referensi cuma sumber pola struktural, bukan sumber warna.

## 2. Scope Iterasi 1 (semua disetujui digarap sekaligus)

1. Halaman detail produk → form bertahap bernomor.
2. Trust badge di halaman produk.
3. Search fungsional di header.
4. Drawer kategori dari hamburger.
5. Footer diperluas + tombol support mengambang.
6. Dark-mode toggle jadi ikon (bukan teks) — permintaan tambahan, digabung karena sama-sama polish header.

## 3. Eksplisit DI LUAR SCOPE (ditemukan saat analisis, diflag ke user, disetujui di-skip)

- **Step "Kode Promo"** — butuh sistem kode diskon (validasi + potong harga) yang belum ada sama sekali di skema/checkout. Menyentuh logic uang, bukan sekadar UI — tidak dikerjakan di iterasi ini.
- **Link kebijakan di footer** (Kebijakan Privasi/Syarat/Refund Policy/FAQ) — halaman-halaman itu belum ada, jadi tidak ditambahkan linknya (hindari link mati).
- **"Cek Transaksi" di drawer** — kita belum punya fitur cek-status-transaksi tanpa login; tidak ditambahkan.
- Semua elemen yang SUDAH diputuskan out-of-scope dari brainstorming beranda sebelumnya (hero carousel, flash sale/countdown, trending, toast pembelian live) — masih di luar scope, tidak berubah.

## 4. Kontak placeholder (env var baru)

`NEXT_PUBLIC_WHATSAPP_CS` dan `NEXT_PUBLIC_TELEGRAM_CS` — dipakai bersama oleh drawer kategori DAN tombol support mengambang (satu sumber, jangan duplikasi). Isi placeholder di `.env.example` sekarang, nilai asli diisi user belakangan tanpa perlu ubah kode. Bot Telegram `dannshop_bot` yang sudah ada (alert admin) **tidak dipakai** untuk ini — beda keperluan (itu outbound-only ke admin, bukan channel customer masuk).

## 5. Arsitektur per bagian

### 5.1 Halaman produk — form bertahap

File: `src/app/(public)/[categorySlug]/[productSlug]/product-detail-client.tsx` (restructure total tampilan, logic `useActionState`/`createCheckoutOrder` **tidak diubah** — murni presentational).

Struktur baru (top ke bawah):
1. Header produk (nama + publisher, seperti sekarang).
2. `<TrustBadges />` (komponen baru, lihat §5.2).
3. Step 1 "Masukkan Data Akun" — badge angka `1` (kotak solid `bg-primary text-primary-foreground`), field dinamis dari `product.inputFields` (tidak berubah dari sekarang).
4. Step 2 "Pilih Nominal" — badge `2`. Ganti `<select>` jadi grid kartu (`grid gap-3 sm:grid-cols-2`, pola sama dengan grid produk beranda). Tiap kartu: nama item, harga (`formatRupiah`), badge kecil "Instan" (semua item kita auto-fulfillment via Digiflazz — klaim jujur, bukan aspal). Kartu terpilih dapat `ring-2 ring-primary`. Klik kartu = `setSelectedItemId` (state yang sudah ada, cuma sumbernya diganti dari `<select>` ke `onClick` kartu).
5. Step 3 "Pilih Pembayaran" — badge `3`. Radio QRIS/Saldo yang sudah ada dibungkus pola list-row (ikon kiri + label+deskripsi + radio kanan) — pola visual disiapkan buat nampung opsi pembayaran baru di masa depan, TAPI cuma 2 opsi yang benar-benar berfungsi sekarang (tidak menambah metode bayar palsu).
6. Step 4 "Detail Kontak" — badge `4`. Field email (sudah ada). **Copy diganti jujur**: bukan "Bukti transaksi akan dikirim ke email" (APLIKASI INI TIDAK PERNAH KIRIM EMAIL — dikonfirmasi tidak ada fitur kirim email sama sekali di codebase) → jadi "Email dipakai untuk akses invoice transaksi kamu" atau kalimat senada yang akurat.
7. Tombol submit "Beli Sekarang" (sudah ada, tidak berubah).

State `purchasableItems.length === 0` (produk tidak tersedia) tetap sama seperti sekarang — tidak berubah.

### 5.2 `<TrustBadges />` — komponen baru

File baru: `src/components/trust-badges.tsx`. 3 item statis (icon Lucide + label): `Zap` "Proses Cepat", `MessageCircle` "Layanan Chat", `ShieldCheck` "Pembayaran Aman". Row horizontal, ikon dari `lucide-react` (bukan emoji — sesuai rule `no-emoji-icons`). Dipakai di halaman produk (§5.1); reusable kalau nanti mau dipasang di tempat lain.

### 5.3 Search fungsional

**Data layer** — fungsi baru `searchProducts(query: string)` di `src/lib/catalog/public.ts`: query `db.product.findMany` dengan filter `isActive: true`, `items: { some: { isActive: true } }` (SAMA seperti filter `getCatalogHomeData`, konsisten — produk tanpa item aktif tidak boleh muncul di pencarian juga), `name: { contains: query }` (case-insensitive, MySQL default collation), include `category.slug`, limit 20 hasil, return `{ id, slug, categorySlug, name, publisher }[]`.

**Route baru**: `src/app/api/search/route.ts` — `GET`, query param `q`, panggil `searchProducts`, return JSON. Publik (tidak butuh auth, cuma baca produk aktif — sama seperti halaman detail produk sendiri yang publik).

**UI** — `src/components/search-overlay.tsx` (client component baru): ikon cari baru di `site-header.tsx` (Lucide `Search`), klik → buka overlay/dialog (pakai pola modal yang sudah ada di project kalau ada, atau `fixed inset-0` sederhana) berisi input pencarian (autofocus) + hasil live (debounced 350ms, pola identik dengan `sku-picker.tsx` yang sudah terbukti). Tiap hasil = `<Link href="/{categorySlug}/{slug}">`, klik menutup overlay dan navigasi ke halaman detail.

### 5.4 Drawer kategori

`src/components/category-drawer.tsx` (client component baru), dipicu ikon hamburger di `site-header.tsx` (ganti dari — cek dulu apakah hamburger sudah ada; kalau belum, ini ikon baru `Menu` dari Lucide). Panel slide-out dari kanan (atau overlay penuh di mobile), isi:
- Semua 5 kategori dari `getCatalogHomeData()` (fungsi yang sama dipakai ulang, bukan bikin fungsi baru). `SiteHeader` sudah berupa server component (`async function SiteHeader()`, sudah manggil `auth()` di dalamnya) — cukup tambah panggilan `getCatalogHomeData()` di situ juga, diteruskan sebagai prop ke `<CategoryDrawer categories={...} />` (client component). Tidak perlu route/fetch terpisah.
- Link WhatsApp (`NEXT_PUBLIC_WHATSAPP_CS`, format `https://wa.me/<nomor>`) dan Telegram (`NEXT_PUBLIC_TELEGRAM_CS`, format `https://t.me/<username>`) — 2 baris bantuan di bawah daftar kategori.

### 5.5 Footer + tombol support mengambang

`src/components/site-footer.tsx` (perluas yang sudah ada, bukan ganti total): tambah baris kontak (email/WA/Telegram, pakai env var yang sama §4, ikon Lucide) di atas baris copyright yang sudah ada. TIDAK ada link kebijakan (§3).

`src/components/floating-support-button.tsx` (komponen baru): posisi `fixed bottom-4 right-4` (perhatikan `z-index` di atas konten tapi di bawah modal/dialog kalau ada — pakai skala z-index yang konsisten kalau project sudah punya konvensi, kalau belum mulai dari nilai aman seperti `z-40`), tombol bulat ikon `Headset`/`MessageCircle` (Lucide), klik → buka popover kecil 2 pilihan (WhatsApp/Telegram, link sama seperti §5.4). Dipasang di `(public)/layout.tsx` supaya muncul di semua halaman publik (bukan cuma beranda).

### 5.6 Dark-mode toggle jadi ikon

`src/components/theme-toggle.tsx`: ganti teks `"Terang"/"Gelap"` jadi ikon Lucide `Sun` (mode gelap aktif, klik untuk ke terang) / `Moon` (mode terang aktif, klik untuk ke gelap) — **`aria-label` yang sudah ada WAJIB dipertahankan** (rule `aria-labels`/`no-precision-required` — tombol icon-only harus tetap accessible, jangan cuma hapus teks tanpa label pengganti). `size="icon"` (varian yang sudah ada di `button.tsx`, dipakai konsisten dengan tombol ikon lain di header baru ini — search, hamburger, support).

## 6. Konsistensi visual antar-komponen baru

Semua tombol ikon-baru di header (search, hamburger/drawer trigger, theme-toggle) pakai varian `Button` yang SAMA (`variant="ghost" size="icon"`, atau pola serupa yang sudah ada) — bukan style ad-hoc per tombol, biar header terasa satu sistem, bukan tempelan.

## 7. Testing

Semua bagian ini presentational/UI (kecuali `searchProducts` yang query Prisma langsung, sama seperti `getCatalogHomeData`/`getProductForCheckout` — data-fetch, bukan pure function, konsisten konvensi repo TIDAK dapat test otomatis). Verifikasi manual: build bersih, smoke test browser tiap bagian (search ketik-hasil-klik, drawer buka-pilih kategori, step form isi-submit sampai ke invoice seperti alur checkout yang sudah teruji, footer+tombol support tampil di semua halaman publik, toggle dark/light tetap berfungsi identik cuma tampilannya ikon).

## 8. Di luar scope (eksplisit, iterasi mendatang)

Sama seperti §3 ditambah: hero carousel, flash sale/countdown, trending, toast pembelian live, gambar/banner produk asli (masih placeholder gradient), payment gateway kedua (masih diskusi terpisah, diparkir).
