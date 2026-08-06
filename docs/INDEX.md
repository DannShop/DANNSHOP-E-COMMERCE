# Dokumentasi DannShop PPOB

Dokumentasi teknis lengkap untuk project **DannShop** — platform PPOB/digital goods store, dibangun dengan Next.js 16. Ditulis untuk developer solo yang butuh referensi detail, bukan cuma gambaran umum.

> **Semua path file di dokumen-dokumen ini ditulis lengkap dari root repo** (`D:\Coding VSC\DannShop-PPOB`). Aplikasi Next.js aktif ada di folder `web/` — repo root juga berisi aplikasi PHP/Laravel lama yang **tidak dipakai lagi**, abaikan folder `app/`, `bootstrap/`, `config/`, `database/`, `resources/`, `routes/`, `vendor/` di level root.

## Daftar Isi

| # | Dokumen | Isi | Baca ini kalau... |
|---|---|---|---|
| 00 | [OVERVIEW](./00-OVERVIEW.md) | Tujuan project, tech stack lengkap, struktur folder top-level | Baru pertama kali buka project ini |
| 01 | [ARSITEKTUR](./01-ARSITEKTUR.md) | Diagram alur request (mermaid), pemisahan frontend/backend, cara kerja routing Next.js App Router | Mau paham "gimana caranya klik tombol di browser bisa sampai ke database" |
| 02 | [FRONTEND-STOREFRONT](./02-FRONTEND-STOREFRONT.md) | Semua halaman & komponen storefront, tabel "mau ubah apa → edit file mana", panduan styling | Mau ubah tampilan/UI |
| 03 | [BACKEND-API](./03-BACKEND-API.md) | Semua API endpoint & Server Action, struktur database (ERD), cara kerja login/otorisasi | Mau paham/ubah logic di balik layar, atau struktur database |
| 04 | [INTEGRASI-PAYMENT-PPOB](./04-INTEGRASI-PAYMENT-PPOB.md) | Integrasi Midtrans (payment) & Digiflazz (provider PPOB), alur transaksi lengkap step-by-step | Mau paham/ubah apa pun soal pembayaran atau pengiriman produk digital |
| 05 | [CARA-TAMBAH-FITUR](./05-CARA-TAMBAH-FITUR.md) | Panduan step-by-step: tambah produk, metode bayar, halaman, endpoint, field database | Mau menambah sesuatu yang baru |
| 06 | [TROUBLESHOOTING-DEPLOY](./06-TROUBLESHOOTING-DEPLOY.md) | Cara run lokal, cara deploy, solusi masalah yang sudah pernah benar-benar terjadi | Ada error, atau mau deploy |

## Urutan Baca yang Disarankan

**Kalau benar-benar baru pertama kali pegang project ini:** 00 → 01 → 02 → 03 → 04, baru buka 05/06 kalau memang butuh.

**Kalau cuma mau ubah tampilan:** langsung ke 02, cari di tabel "mau ubah apa → edit file mana".

**Kalau ada masalah pembayaran/produk gagal kirim:** langsung ke 04.

**Kalau ada error saat development/deploy:** langsung ke 06.

## Fakta Penting yang Berlaku di SEMUA Dokumen Ini

Beberapa hal mendasar yang perlu diketahui sebelum baca dokumen mana pun, supaya tidak bingung:

1. **Aplikasi aktif ada di folder `web/`**, bukan di root repo.
2. **`web/src/proxy.ts` adalah middleware-nya** — Next.js versi ini sudah tidak memakai nama file `middleware.ts` lagi (lihat `docs/01-ARSITEKTUR.md` §1).
3. **Ada dua jenis "backend"**: Server Action (`web/src/app/actions/`, dipanggil langsung dari form) dan API Route (`web/src/app/api/`, cuma untuk webhook/polling/cron). Kebanyakan logic ada di Server Action, bukan API Route.
4. **Migrasi database TIDAK otomatis di deploy Vercel** — ini sudah pernah menyebabkan insiden nyata, WAJIB dijalankan manual tiap kali ada perubahan skema (lihat `docs/05-CARA-TAMBAH-FITUR.md` §5 dan `docs/06-TROUBLESHOOTING-DEPLOY.md` §2.3).
5. **Banyak konten yang dulunya hardcode di kode sekarang bisa diedit lewat panel admin** (`/admin/settings`) — FAQ, Syarat & Ketentuan, Kebijakan Privasi, logo, favicon, kontak CS, konfigurasi email. Kalau isi salah satu halaman itu perlu diubah, **cek dulu apakah itu bisa diedit lewat admin sebelum mengedit file kode**.
6. **Harga produk punya 3 tingkat prioritas**: harga flash sale (kalau sedang aktif) > harga member (kalau pembeli login) > harga normal — semua dihitung SATU tempat (`web/src/lib/pricing/effective-price.ts`), tidak pernah dihitung ulang berbeda-beda di banyak tempat.
7. **Provider PPOB yang sudah benar-benar berfungsi cuma Digiflazz** — 3 provider lain (`OkeConnect`, `QiosPay`, `Serpul`) baru terdaftar sebagai pilihan (enum) di database, arsitekturnya sudah siap menambahkan provider baru, tapi belum ada kode adapter-nya.

## Kalau Dokumentasi Ini Perlu Diperbarui

Codebase ini terus berkembang. Kalau ada perbedaan antara isi dokumen ini dengan kode yang sebenarnya, **percaya kode-nya, bukan dokumen ini** — lalu perbarui dokumen yang bersangkutan supaya sesuai lagi. Dokumen ini ditulis berdasarkan eksplorasi langsung ke seluruh codebase pada tanggal dokumen ini dibuat, bukan asumsi.
