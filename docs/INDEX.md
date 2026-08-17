# Dokumentasi DannShop PPOB

Dokumentasi teknis lengkap untuk project **DannShop** — platform PPOB/digital goods store, dibangun dengan Next.js 16. Ditulis untuk developer solo yang butuh referensi detail, bukan cuma gambaran umum.

> **Semua path file di dokumen-dokumen ini ditulis lengkap dari root repo** (`D:\Coding VSC\DannShop-PPOB`). Aplikasi Next.js aktif ada di folder `web/`. Sisa aplikasi PHP/Laravel lama **sudah dihapus seluruhnya** (2026-08-18) — kalau dokumen lama masih menyebut `app/`, `routes/`, `resources/`, `artisan`, atau `composer.json` di level root, itu peninggalan yang tidak ada lagi. Root sekarang hanya berisi `web/` (aplikasi), `relay/` (relay PHP ber-IP tetap yang MASIH DIPAKAI produksi), dan `docs/`.

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
| 09 | [FITUR-SESI-2026-08-09](./09-FITUR-SESI-2026-08-09.md) | Notifikasi Telegram, invoice/email/struk, kustomisasi storefront, analytics, cek ID game, produk manual | Mau paham 7 fitur terbaru & keputusan desain di baliknya |
| 11 | [FITUR-RESELLER-RBAC-LABA](./11-FITUR-RESELLER-RBAC-LABA.md) | Program reseller (paket LIFETIME, kredit upgrade, potongan flat), RBAC karyawan & peran, pelacakan modal/laba, PWA ikon & splash | Mau paham fitur Agustus 16–18 2026 & keputusan desain di baliknya |
| — | [api-partner](../web/src/content/api-partner.md) | **Dokumen untuk pihak luar.** Spesifikasi API H2H reseller: autentikasi md5, 4 endpoint, callback, kode `rc`, contoh PHP | Ada partner yang mau integrasi — mitra membacanya sendiri di `/mitra/dokumentasi` |

## Panduan Operasional (dirender di `/admin/panduan`)

Berkasnya di `web/src/content/panduan/`. **Jangan menyalinnya ke `docs/`** — dua salinan berarti yang dibaca dari panel dan yang dibaca dari repo pasti melenceng, dan yang salah justru yang dipegang orang yang sedang mengerjakan sesuatu.

| Panduan | Isi | Berkas |
|---|---|---|
| Tambah Produk | Dua jalur menambah produk: tarik dari price list provider, atau isi manual | [`panduan/tambah-produk.md`](../web/src/content/panduan/tambah-produk.md) |
| Provider & Relay IP | Menghubungkan Digiflazz & OkeConnect, membaca penolakan mereka, menjaga relay IP tetap | [`panduan/provider-relay.md`](../web/src/content/panduan/provider-relay.md) |
| Payment Gateway | Snap vs Core API, dua jebakan Midtrans, urutan cek saat pembayaran bermasalah | [`panduan/payment-gateway.md`](../web/src/content/panduan/payment-gateway.md) |
| Program Reseller | Pendaftaran & aktivasi, mengatur paket, aturan naik paket, mengelola peserta | [`panduan/reseller.md`](../web/src/content/panduan/reseller.md) |
| Karyawan & Peran | 9 izin, kenapa refund dipisah dari kelola pesanan, kapan perubahan izin berlaku | [`panduan/karyawan-peran.md`](../web/src/content/panduan/karyawan-peran.md) |
| Modal, Laba & Analytics | Asal modal produk otomatis vs manual, rumus laba, membaca dashboard | [`panduan/laba-modal.md`](../web/src/content/panduan/laba-modal.md) |
| Tampilan & CSS Kustom | Slot HTML, CSS kustom, apa yang dibuang penyaring, memulihkan tampilan rusak | [`panduan/tampilan-css.md`](../web/src/content/panduan/tampilan-css.md) |
| Invoice, Struk & Email | Branding dokumen, 9 template email, konfirmasi pesanan manual, cetak struk | [`panduan/invoice-struk.md`](../web/src/content/panduan/invoice-struk.md) |
| API Internal & Webhook | Semua endpoint selain API Partner: webhook, cron, status publik, rate limit | [`panduan/api-internal.md`](../web/src/content/panduan/api-internal.md) |
| API Partner (H2H) | Spesifikasi API untuk mitra — **dokumen untuk pihak luar** | [`api-partner.md`](../web/src/content/api-partner.md) |

> **Kenapa `api-partner.md` tinggal di `web/src/content/`, bukan di `docs/`:** file itu **dirender langsung** oleh halaman `/mitra/dokumentasi`, dengan `username` dan URL milik mitra yang sedang login sudah tersubstitusi ke contoh kodenya. Menyimpan salinan kedua di `docs/` berarti dua versi yang pasti melenceng, dan mitra akan membaca yang salah. Satu file, satu sumber kebenaran.

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
5. **Banyak konten yang dulunya hardcode di kode sekarang bisa diedit lewat panel admin** — FAQ, Syarat & Ketentuan, Kebijakan Privasi, logo, favicon, kontak CS, konfigurasi email, dan notifikasi Telegram di `/admin/settings`; identitas dokumen & template email di `/admin/invoice`; tema, CSS kustom, dan slot HTML storefront di `/admin/appearance` (lihat dokumen 09). Kalau isi salah satu halaman itu perlu diubah, **cek dulu apakah itu bisa diedit lewat admin sebelum mengedit file kode**.
6. **Harga produk dihitung SATU tempat** (`web/src/lib/pricing/effective-price.ts`), tidak pernah dihitung ulang berbeda-beda. Urutan prioritasnya: **flash sale** (kalau sedang aktif) > **potongan paket reseller** > harga normal. Dua hal yang gampang salah diingat: (a) **login saja TIDAK memberi diskon apa pun** — harus punya paket reseller berbayar yang aktif; (b) potongan paket ada dua bentuk — persen (semua produk) dan **flat rupiah (HANYA produk manual, menggantikan persen di situ)**. Semua potongan dijepit `ProductItem.memberPrice` sebagai lantai harga, jadi diskon sebesar apa pun tidak bisa menjual rugi. `memberPrice` dilabeli "Batas bawah harga" di panel — namanya di DB peninggalan masa "harga member otomatis" yang sudah tidak ada.
7. **`/api/v1/*` adalah satu-satunya API yang boleh diakses pihak luar** — jalur H2H untuk partner reseller, diautentikasi dengan `username` + signature md5, dibayar dari saldo prabayar akun partner. Seluruh endpoint lain di `web/src/app/api/` bersifat internal (webhook, polling, cron). Kalau menambah endpoint publik baru, tempatnya di bawah `/api/v1/` dan dokumennya di `web/src/content/api-partner.md` (dirender di `/mitra/dokumentasi`) — dokumen itu dikirim ke pihak luar, jadi jangan menaruh detail internal di sana.
8. **Provider PPOB yang berfungsi ada DUA: Digiflazz dan OkeConnect** (per 2026-08-15; adapter OkeConnect ada di `web/src/lib/providers/okeconnect.ts`, riset lengkapnya di `docs/providers/okeconnect.md`). `QiosPay` dan `Serpul` masih sebatas pilihan di enum tanpa adapter. Konsekuensi yang gampang terlewat: **logika katalog/fulfillment tidak boleh menyebut nama provider secara harfiah**. Hardcode `"DIGIFLAZZ"` peninggalan masa satu-provider sudah dua kali menyebabkan bug senyap (item OkeConnect dianggap tidak bisa dibeli, dan dilewati markup massal) — kalau menambah gerbang ketersediaan baru, samakan dengan `web/src/lib/order/select-provider.ts`.

9. **Panduan operasional yang tampil di panel admin ada di `web/src/content/panduan/`**, bukan di `docs/`. Berkas di `docs/` berada di luar root Next.js sehingga tidak ikut terbawa ke bundle serverless — halamannya akan mulus di lokal lalu 500 di produksi. `docs/` tetap rumah catatan riset, audit, dan spesifikasi yang memang dibaca dari repo. Panduan yang sudah ada dirender di `/admin/panduan`.

10. **Program membership berlangganan SUDAH DIGANTI program reseller** (2026-08-17). `/membership` dihapus; pendaftarannya di `/daftar-reseller` (publik) dan `/account/reseller` (dari dalam akun). Paket **sekali bayar, berlaku selamanya** — `MembershipTier.durationDays` jadi kolom usang yang selalu ditulis `0` dan tidak dibaca kode mana pun. Sumber kebenaran diskon pindah dari `UserMembership` ke `ResellerAccount`; `getMembershipContext()` tetap jadi satu-satunya pembacanya (16 pemanggil), jadi bentuk keluarannya sengaja tidak berubah.

11. **Panel admin punya RBAC** (2026-08-17). Ada role `STAFF` + tabel `StaffRole` berisi kumpulan izin buatan admin. Gerbangnya SATU: `web/src/lib/auth/admin-gate.ts` — sebelumnya `requireAdmin` punya 16 salinan yang sudah mulai menyimpang. Peta route→izin ada di `web/src/lib/rbac/access.ts` dan dipakai bersama oleh middleware DAN penyaring menu sidebar. **Halaman admin baru yang lupa didaftarkan di situ akan jatuh ke aturan `/admin` (butuh `finance.view`)** — bawaannya menutup, bukan membuka.

12. **Laba dihitung dari `Order.costPrice`**, snapshot modal per pesanan. Produk manual mengisinya saat checkout dari `ProductItem.costPrice` (kolom yang diisi admin, boleh kosong); produk otomatis mengisinya **saat fulfillment berhasil** dari modal provider yang benar-benar memproses — bukan saat checkout, karena failover bisa memindahkannya ke provider lain dengan modal berbeda. **`costPrice` null berarti "tidak tahu", bukan nol** — pesanannya dikeluarkan dari perhitungan laba dan jumlahnya dilaporkan, karena menganggapnya nol membuat laba terbaca 100%.

## Kalau Dokumentasi Ini Perlu Diperbarui

Codebase ini terus berkembang. Kalau ada perbedaan antara isi dokumen ini dengan kode yang sebenarnya, **percaya kode-nya, bukan dokumen ini** — lalu perbarui dokumen yang bersangkutan supaya sesuai lagi. Dokumen ini ditulis berdasarkan eksplorasi langsung ke seluruh codebase pada tanggal dokumen ini dibuat, bukan asumsi.
