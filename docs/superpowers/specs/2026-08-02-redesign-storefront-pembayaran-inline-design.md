# Redesign Storefront + Pembayaran Inline + Pengiriman Invoice — Spec Desain

Status: Disetujui Wildan (2026-08-02)

## 1. Latar Belakang

Storefront DannShop saat ini masih minimal: header cuma logo teks + ikon, tidak ada banner promo, tidak ada section trending, kategori cuma 5 dengan penamaan generik, footer cuma 1 baris copyright, dan tidak ada halaman statis (FAQ/S&K/Privasi/Kontak). Halaman checkout memakai **Midtrans Snap popup** (hasil migrasi 2026-08-01) — customer tidak bisa melihat pilihan metode pembayaran beserta biayanya sebelum popup terbuka, dan tampilan akhirnya adalah widget Midtrans, bukan UI kita.

User memberikan `https://konteronline.id/` sebagai referensi struktur & fitur, plus 3 screenshot + 1 video rekaman layar. Target: samakan **struktur, layout, dan fitur** — bukan identitas visual (warna/font/logo tetap milik DannShop, palette indigo/violet "Arah A"). Menyalin identitas visual situs orang lain tidak dilakukan dan ini keputusan sadar, bukan kelalaian.

**Konteks waktu:** ada deadline user tanggal **2026-08-05**. Spec ini ditulis dengan urutan pengerjaan yang sengaja mendahulukan bagian berisiko uang, supaya bagian visual yang aman bisa dikebut belakangan tanpa menekan bagian pembayaran.

## 2. Keputusan yang Mengikat (hasil brainstorming)

| Topik | Keputusan |
|---|---|
| Arsitektur pembayaran | **Core API inline penuh** — pilih metode di halaman kita, QR/nomor VA tampil inline di invoice, tanpa popup Snap sama sekali |
| Metode yang didukung | **QRIS + Virtual Account** (BCA, BNI, BRI, Mandiri, Permata, CIMB). Kartu kredit & e-wallet deeplink **tidak** dikerjakan |
| Scope pembayaran | **Checkout order DAN deposit saldo** dua-duanya pindah ke inline; Snap dibuang total |
| Pemilihan metode | Tampil untuk **guest maupun member** (sekarang guest tidak dapat pilihan sama sekali) |
| Pengiriman invoice | **Email otomatis via Resend** (user punya domain + akses DNS). WhatsApp otomatis tidak dikerjakan |
| Akses invoice hilang | Halaman **`/cek-transaksi`** (email + nomor invoice) + tombol **share ke WhatsApp** di invoice |
| Kode unik | **Random Rp1–999 menambah total** (bukan diskon) |
| Konfigurasi fee | **Tabel DB + halaman admin**, bukan hardcode |
| Kategori | Rename + tambah sesuai referensi, **plus admin CRUD kategori** |
| Trending | **Dua mode, bisa di-switch dari admin**: manual (centang per produk) atau otomatis (7 hari terakhir) |
| Banner carousel | **Model DB + admin CRUD**, gambar via Vercel Blob yang sudah ada |
| Logo brand | **Di-upload dari admin**, mendukung gambar **dan video** (user bilang logo referensi ada animasinya) |

## 3. Bagian B — Pembayaran Inline Core API

Dikerjakan **paling dulu**: menyentuh uang langsung, butuh verifikasi E2E sandbox, dan paling berisiko kalau dikejar di jam-jam akhir menjelang deadline.

### 3.1 Model baru: `PaymentMethodConfig`

```prisma
model PaymentMethodConfig {
  id          String   @id @default(cuid())
  code        String   @unique // "qris" | "va_bca" | "va_bni" | "va_bri" | "va_mandiri" | "va_permata" | "va_cimb"
  label       String   // "QRIS", "BCA Virtual Account", dst
  logoUrl     String?  // logo metode untuk daftar pilihan + marquee (upload Blob)
  feeFlat     BigInt   @default(0)  // rupiah
  feePercent  Int      @default(0)  // basis point (100 = 1.00%) — integer, hindari float pada uang
  isActive    Boolean  @default(true)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

`feePercent` disimpan sebagai **basis point integer**, bukan float. Uang tidak pernah dihitung dengan floating point di repo ini (semua `BigInt`), dan `feePercent` ikut aturan itu.

Di-seed dengan 7 baris di atas. Admin mengaturnya lewat halaman `/admin/payment-methods` (form sederhana: label, fee flat, fee persen, aktif/nonaktif, urutan). Metode yang `isActive: false` hilang dari pilihan checkout **dan** dari marquee di Bagian A.

Upload `logoUrl` memakai server action Blob yang sudah ada (`uploadProductBanner`) — logo metode pembayaran adalah gambar biasa, jadi tidak perlu menunggu generalisasi upload di §5.2 yang baru dibutuhkan untuk logo brand bervideo.

**"Saldo" bukan baris di tabel ini.** Bayar-pakai-saldo tidak lewat Midtrans dan sudah punya jalurnya sendiri (`createBalanceOrder`); ia tetap opsi hardcoded yang hanya muncul untuk member yang saldonya cukup, ditampilkan berdampingan dengan metode dari tabel ini dengan biaya Rp 0.

### 3.2 Perhitungan biaya — pure function, wajib bertes

File baru `web/src/lib/payment/fee.ts`:

```ts
export function calculateFee(baseAmount: bigint, feeFlat: bigint, feePercentBp: number): bigint
export function generateUniqueCode(): number  // crypto.randomInt(1, 1000) → 1..999
export function calculateTotal(baseAmount: bigint, fee: bigint, uniqueCode: number): bigint
```

Ini mengikuti konvensi TDD repo: logika keputusan/perhitungan murni diekstrak ke file sendiri dengan unit test, sementara kode orkestrasi DB (server action, webhook, job handler) tidak punya test otomatis. Test file: `web/tests/payment-fee.test.ts`.

`generateUniqueCode` memakai `crypto.randomInt`, bukan `Math.random()` — konsisten dengan perbaikan M-9 di Fase 7d.

**Kode unik digenerate di server**, di dalam server action saat order dibuat. Tidak pernah dikirim dari browser dan tidak pernah dipercaya dari input klien — kalau tidak, customer bisa memanipulasi total yang ditagih.

### 3.3 Perubahan schema `Order`

```prisma
// tambahan pada model Order
fee           BigInt  @default(0)
uniqueCode    Int     @default(0)
paymentMethod String? // kode dari PaymentMethodConfig, mis. "va_bca"
```

**`Order.total` tetap berarti "jumlah yang ditagih ke customer"**, sekarang isinya `sellingPrice + fee + uniqueCode`. Ini penting dan disengaja:

- **Webhook amount-check (M-3, `route.ts:38`) tidak perlu diubah** — ia membandingkan `grossAmount` dari Midtrans dengan `order.total`, dan keduanya sama-sama jumlah yang ditagih.
- **Auto-refund ke wallet (`fulfillment.ts:219,399`) tidak perlu diubah** — ia mengembalikan `order.total`. Artinya kalau fulfillment gagal, customer menerima kembali **seluruh** yang ia bayar (termasuk fee & kode unik) sebagai saldo. Kita menanggung fee Midtrans-nya. Ini keputusan sadar: lebih mudah dipertanggungjawabkan ke customer ("bayar X, balik X") dan menghindari perubahan pada jalur refund yang sudah diverifikasi E2E di Fase 4.

`sellingPrice` tetap harga item murni (tidak berubah artinya).

### 3.4 Perubahan schema `Deposit` — titik paling rawan di spec ini

```prisma
// tambahan pada model Deposit
fee           BigInt  @default(0)
uniqueCode    Int     @default(0)
totalPaid     BigInt  @default(0) // amount + fee + uniqueCode — INI yang ditagih & diverifikasi webhook
paymentMethod String?
```

**`Deposit.amount` TIDAK boleh diubah artinya.** Ia adalah nominal yang dikreditkan ke wallet, dan `handleDepositWebhook` memakainya di dua tempat berbeda dengan makna berbeda:

- baris 106 — verifikasi nominal settlement → **harus diganti** membandingkan dengan `deposit.totalPaid`
- baris 129/135 — jumlah yang dikreditkan ke wallet & ledger → **harus tetap** `full.amount`

Kalau fee & kode unik dimasukkan ke `deposit.amount` (cara naif), customer akan dikreditkan fee + kode unik yang sebenarnya masuk ke Midtrans/kita — kebocoran uang nyata di setiap deposit. Karena itu dipisah jadi `amount` (dikredit) vs `totalPaid` (ditagih), dan implementer **wajib** mengubah baris 106 saat menambah field ini.

### 3.5 Pembayaran pakai saldo: tanpa fee, tanpa kode unik

Bayar pakai saldo tidak lewat Midtrans, jadi tidak ada biaya gateway dan tidak ada yang perlu dicocokkan. Aturannya: `fee = 0`, `uniqueCode = 0`, `total = sellingPrice`. Jalur `createBalanceOrder` di `checkout.ts` praktis tidak berubah selain mengisi kedua field baru dengan nol.

### 3.6 `web/src/lib/midtrans/client.ts` — fungsi baru

```ts
export async function chargeBankTransfer(
  input: { orderId: string; grossAmount: number; bank: "bca" | "bni" | "bri" | "permata" | "cimb" },
  creds?: MidtransCreds,
): Promise<MidtransChargeResult & { vaNumber: string | null; bank: string }>

export async function chargeEchannel( // Mandiri — endpoint & bentuk response BEDA dari bank_transfer
  input: { orderId: string; grossAmount: number; itemName: string },
  creds?: MidtransCreds,
): Promise<MidtransChargeResult & { billerCode: string | null; billKey: string | null }>
```

Mandiri di Midtrans memakai `payment_type: "echannel"` dengan pasangan `biller_code` + `bill_key`, **bukan** satu nomor VA seperti bank lain. Ini perbedaan nyata di API Midtrans, bukan detail kosmetik — UI instruksi bayar Mandiri juga menampilkan dua kolom, bukan satu. Bentuk persis request/response wajib dicek ke dokumentasi resmi Midtrans saat implementasi, jangan diasumsikan dari ingatan.

`chargeQris` yang sudah ada **dipakai ulang apa adanya** untuk metode QRIS — sudah teruji sejak Fase 3 dan lolos E2E sandbox berkali-kali.

`createSnapTransaction` **dihapus** dari file ini (tidak ada pemanggil tersisa setelah migrasi ini).

### 3.7 Penyimpanan hasil charge

`OrderPayment.method` diisi kode metode (`"qris"`, `"va_bca"`, …). `OrderPayment.actions` menampung hasil charge sesuai metode:

- QRIS → `{ qrString }`
- VA bank → `{ vaNumber, bank }`
- Mandiri → `{ billerCode, billKey }`

Deposit memakai `Deposit.rawResponse` untuk hal yang sama (model `Deposit` tidak punya kolom `actions`, seperti dicatat sejak spec Fase 4).

### 3.8 UI checkout & deposit

Step "Pilih Pembayaran" menampilkan seluruh metode aktif dari `PaymentMethodConfig`, masing-masing dengan logo, label, dan **biayanya terlihat langsung** (mis. "+ Rp 4.000"). Total di panel bawah ter-update seketika saat metode diganti. Opsi "Saldo" (lihat §3.1) muncul di daftar yang sama untuk member dengan saldo cukup.

**Step ini sekarang tampil untuk guest juga.** Kode saat ini membungkus seluruh step pemilihan pembayaran dengan `{session && (…)}` di `product-detail-client.tsx` — guest tidak pernah melihat pilihan apa pun dan selalu diarahkan ke satu metode. Pembungkus itu dihapus; yang tetap khusus member hanya baris opsi "Saldo". Urutan step jadi tetap 4 untuk semua orang (sebelumnya guest 3, member 4), sehingga penomoran `StepHeader` tidak lagi bercabang.

Kode unik **tidak** ditampilkan saat memilih metode (belum digenerate — baru dibuat server saat order dibuat). Ia muncul di rincian invoice setelah order jadi.

Invoice menampilkan rincian utuh, tidak cuma total gelondongan:

```
Harga item        Rp 22.000
Biaya BCA VA      Rp  4.000
Kode unik         Rp    237
─────────────────────────────
Total             Rp 26.237
```

### 3.9 Tampilan invoice per metode

- **QRIS** — QR di-generate sendiri di server dari `qr_string` memakai paket `qrcode` (hasil kerja M-2 Fase 7d, tidak memanggil pihak ketiga). Fitur ini "menganggur" sejak migrasi Snap; sekarang jadi relevan lagi.
- **VA bank** — nomor VA ukuran besar + tombol salin + instruksi bayar per bank dalam accordion (ATM / m-banking / internet banking).
- **Mandiri** — dua kolom: Kode Perusahaan (`biller_code`) & Kode Bayar (`bill_key`), masing-masing dengan tombol salin.

Semua metode menampilkan countdown kedaluwarsa. Polling status invoice yang sudah ada (interval 3 detik, rate limit 120/menit sejak Fase 7c) dipakai apa adanya.

### 3.10 Pembersihan Snap

Dihapus: `createSnapTransaction`, tag `<Script>` Snap.js di `layout.tsx`, entri domain Midtrans di CSP `next.config.ts`, tipe `web/src/types/midtrans-snap.d.ts`, seluruh state `snapError` + efek `window.snap.pay()` di 4 titik pemicu, dan env var `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` / `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION` (dari `.env.example`, `.env`, dan Vercel).

Tombol "Lanjutkan Pembayaran" di `/invoice/[token]` dan `/account/deposit/[id]` **tidak dihapus**, tapi berubah makna: karena pembayaran sekarang inline di halaman invoice itu sendiri, tombol tidak lagi membuka popup. Kalau charge masih berlaku, halaman langsung menampilkan QR/VA-nya; kalau sudah kedaluwarsa, tombol memicu charge ulang dengan metode yang sama (dan kode unik baru).

### 3.11 Webhook

`handleOrderWebhook` sudah terbukti tidak punya percabangan per metode pembayaran — E2E migrasi Snap memverifikasi QRIS dan BCA VA menghasilkan alur status yang identik. Tidak ada perubahan struktural yang dibutuhkan; yang berubah hanya sisi deposit (§3.4).

### 3.12 Verifikasi E2E

Sandbox Midtrans, memakai teknik yang sudah terdokumentasi dari Fase 7c & Task 7 migrasi Snap:

- QRIS: dua langkah POST ke `simulator.sandbox.midtrans.com/v2/qris/payment` → `/gopay` (perlu decode HTML entity pada `exploreData`)
- VA BCA: POST `va_number` ke `/bca/va/inquiry` → POST field tersembunyi ke `/bca/va/payment`
- Webhook diposting manual memakai `signature_key` **asli** dari `getTransactionStatus` (bukan bypass — jalur verifikasi signature betulan tereksekusi)

Yang wajib dibuktikan, bukan diasumsikan: total yang ditagih Midtrans **persis sama** dengan `order.total` / `deposit.totalPaid` termasuk fee & kode unik; deposit mengkredit **`amount` saja**, bukan `totalPaid`; dan satu deposit menghasilkan tepat satu baris `WalletLedger`.

## 4. Bagian C — Pengiriman & Akses Invoice

### 4.1 Keadaan sekarang (diverifikasi, bukan asumsi)

**Invoice tidak pernah dikirim ke mana pun.** Tidak ada paket pengirim email terpasang (`resend`/`nodemailer`/`@sendgrid/mail`/dll. — nol), dan `buyerEmail` hanya disimpan ke DB lalu ditampilkan di panel admin. Label field-nya berbunyi "Email (untuk akses invoice)", tapi satu-satunya cara mengakses invoice adalah URL ber-`publicToken`. Guest yang menutup tab kehilangan pesanannya, dan tidak ada halaman pencarian pesanan.

Jadi ini fitur baru sepenuhnya, bukan penggantian saluran yang sudah ada.

### 4.2 Email invoice via Resend

User sudah punya domain dan bisa mengatur DNS-nya, sehingga pengiriman email ke alamat customer sungguhan layak dikerjakan (tanpa domain terverifikasi, layanan email hanya mengizinkan kirim ke alamat pemilik akun — tidak berguna untuk customer).

Paket `resend`, dipasang lewat integrasi Vercel Marketplace supaya `RESEND_API_KEY` ter-provision otomatis ke semua environment. Domain diverifikasi lewat DNS (SPF/DKIM). Kuota gratisnya 3.000 email/bulan — jauh di atas kebutuhan saat ini.

Tiga email, masing-masing satu template:

| Pemicu | Isi |
|---|---|
| Order dibuat | Rincian pesanan + rincian biaya (§3.8) + instruksi bayar sesuai metode + link invoice |
| Order sukses | SN/kode voucher + link invoice |
| Order gagal/refund | Penjelasan + info saldo dikembalikan (kalau member) |

**Kegagalan kirim email tidak boleh pernah menggagalkan pembayaran atau fulfillment.** Semua pemanggilan dibungkus try/catch, kegagalannya dicatat ke log, dan tidak pernah dilempar ke jalur webhook maupun job runner. Ini pelajaran yang sama dengan `sendTelegramAlert` di Fase 7b: saluran notifikasi tidak boleh jadi titik gagal jalur uang. Bedanya dengan kasus 7b — di sana pesan Telegram **adalah** deliverable-nya sehingga status baru ditulis setelah kirim berhasil; di sini email cuma salinan, sumber kebenarannya tetap halaman invoice, jadi fire-and-forget sudah tepat.

Email order-sukses memuat SN/kode voucher. Ini **disengaja** dan tidak bertentangan dengan redaksi SN dari log (L-4, Fase 7d) — di sana masalahnya SN bocor ke log operasional; di sini SN memang barang yang dibeli customer dan harus sampai ke tangannya.

### 4.3 Halaman Cek Transaksi

Rute baru `/cek-transaksi`: guest memasukkan **email + nomor invoice**, lalu melihat pesanan yang cocok. Menuntut dua-duanya (bukan email saja) supaya tidak menjadi cara memanen daftar pesanan orang lain hanya bermodal tebakan email — semangat yang sama dengan penggantian `orderNumber` ke `publicToken` di Fase 7c (C-2).

Endpoint pencariannya ikut kena rate limit (pola `checkRateLimit` yang sudah ada), karena form publik yang menerima tebakan berulang adalah persis bentuk yang perlu dibatasi.

Link "Cek Transaksi" dipasang di header dan footer, sejajar dengan referensi.

### 4.4 Tombol bagikan ke WhatsApp

Di halaman invoice: tombol "Kirim ke WhatsApp" yang membuka `wa.me` dengan pesan berisi link invoice sudah terisi. Nol integrasi, nol biaya, jalan hari itu juga — customer mengirimkannya ke dirinya sendiri atau ke siapa pun.

WhatsApp **otomatis** (WhatsApp Business API) sengaja tidak dikerjakan: perlu persetujuan Meta yang makan berminggu-minggu dan biaya per percakapan. Tidak realistis untuk tenggat 2026-08-05, dan email sudah menutupi kebutuhannya.

### 4.5 Field kontak

Step 4 checkout tetap "Detail Kontak": email (wajib, dipakai kirim invoice) + nomor WhatsApp (opsional, disimpan ke `Order.buyerPhone` yang kolomnya sudah ada tapi belum pernah diisi). Nomor WA dipakai admin untuk menghubungi customer bila ada masalah — bukan untuk pengiriman otomatis.

## 5. Bagian A — Redesign Storefront

Dikerjakan setelah Bagian B dan C. Murni presentasi, tidak menyentuh uang.

### 5.1 Model baru

```prisma
model Banner {
  id        String   @id @default(cuid())
  imageUrl  String
  linkUrl   String?
  sortOrder Int      @default(0)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model SiteSetting {
  key   String @id  // "logo_url", "logo_type" ("image"|"video"), "trending_mode" ("manual"|"auto")
  value String @db.Text
}

// tambahan pada model Product
isTrending Boolean @default(false)
```

`SiteSetting` sengaja berbentuk key-value, bukan tabel berkolom tetap: pengaturan situs akan bertambah seiring waktu, dan bentuk ini tidak menuntut migration tiap kali ada setting baru.

### 5.2 Header

Logo kiri diambil dari `SiteSetting`. Kalau `logo_type` = `"video"`, dirender `<video autoplay loop muted playsinline>`; kalau `"image"`, `<Image>` biasa. Upload lewat `/admin/settings` memakai server action upload Blob yang sudah ada (`uploadProductBanner` digeneralisasi jadi `uploadFile` dengan parameter folder; whitelist tipe ditambah `video/mp4` + `video/webm`).

Search bar tampil sebagai input di tengah header (bukan cuma ikon seperti sekarang); mengkliknya membuka overlay pencarian yang sudah ada. Kanan: toggle tema + hamburger drawer (isi drawer tidak berubah dari hasil kerja hari ini).

### 5.3 Banner carousel

Auto-slide 5 detik, indikator dots yang bisa diklik, swipe di mobile, tombol panah di desktop. Diimplementasikan sendiri dengan CSS scroll-snap + `setInterval` — tidak menambah dependensi carousel demi satu komponen. Kalau tidak ada banner aktif, seluruh section tidak dirender (bukan menampilkan kotak kosong).

Admin CRUD di `/admin/banners`: upload gambar, isi link tujuan opsional, atur urutan, aktif/nonaktif.

### 5.4 Section Trending

Judul "🔥 TRENDING" + 4 kartu (ikon kecil + nama produk, layout mendatar seperti referensi). Sumbernya ditentukan `SiteSetting["trending_mode"]`:

- `"manual"` — produk dengan `isTrending: true`, diurutkan `sortOrder`/nama, diambil 4
- `"auto"` — 4 produk teratas berdasarkan jumlah order berstatus sukses dalam 7 hari terakhir

Switch mode-nya ada di `/admin/settings`, checkbox `isTrending` ada di form produk. Kalau mode `"auto"` menghasilkan kurang dari 4 (toko masih sepi), sisanya diisi dari produk manual sebagai cadangan — supaya section tidak pernah tampil setengah kosong saat launching.

### 5.5 Kategori

Rename: Games → **Top Up Game**, Pulsa & Data → **Pulsa**, PLN → **Token Listrik**. E-Money & Voucher tetap.
Tambah: **Paket Internet, Telepon & SMS, Masa Aktif, Aktivasi Voucher, Tagihan**.

Perubahan data ini lewat seed idempoten (upsert by slug), bukan SQL manual, supaya bisa dijalankan ulang di lingkungan mana pun.

Admin CRUD kategori di `/admin/categories`: tambah, edit nama & urutan, hapus. **Hapus hanya diizinkan kalau kategori tidak punya produk** — mencegah produk jadi yatim dan melanggar foreign key.

Pills kategori di storefront jadi scrollable horizontal (jumlahnya sekarang 10). Kategori tanpa produk aktif tetap tampil, isinya pesan "Segera hadir".

### 5.6 Marquee metode pembayaran

Strip logo metode pembayaran berjalan mendatar terus-menerus di atas footer, berhenti saat hover. Sumbernya `PaymentMethodConfig` yang `isActive` — mematikan metode di admin otomatis menghilangkannya dari marquee, tanpa ada daftar kedua yang harus diingat untuk disinkronkan.

Animasinya CSS murni (`@keyframes` + `transform: translateX`), dan **wajib menghormati `prefers-reduced-motion`** — sebagian orang mengalami pusing/mual karena gerakan terus-menerus di layar, jadi animasi berhenti untuk mereka.

### 5.7 Footer + halaman statis

Footer 4 kolom: brand + deskripsi singkat, Peta Situs (link kategori), Dukungan (FAQ, S&K, Kebijakan Privasi, Kontak), dan info pembayaran. Di mobile jadi accordion/tumpuk.

Halaman baru — konten statis, di-draft dalam Bahasa Indonesia dan bisa diedit user belakangan:

| Rute | Isi |
|---|---|
| `/faq` | Accordion pertanyaan umum (proses berapa lama, kalau saldo gagal masuk, cara cek pesanan, metode bayar, dll.) |
| `/syarat-ketentuan` | Ketentuan layanan |
| `/kebijakan-privasi` | Data apa yang dikumpulkan & untuk apa |
| `/kontak` | Tombol WhatsApp & Telegram (env var yang sudah ada) + jam operasional |

Ini halaman statis biasa di route group `(public)`, tidak butuh model DB.

## 6. Urutan Pengerjaan

1. **Bagian B** — schema + fee + metode pembayaran + charge + invoice + E2E sandbox. Menyentuh uang dan butuh verifikasi nyata; tidak boleh terdesak deadline.
2. **Bagian C** — email invoice + Cek Transaksi + share WA. Isi emailnya memuat rincian biaya dari Bagian B, jadi harus menyusul, bukan mendahului.
3. **Bagian A** — visual, cepat, aman dikebut.

Marquee (§5.6) bergantung pada tabel yang dibuat Bagian B, jadi urutan ini juga menghindari ketergantungan mundur.

Bagian C didahulukan dari Bagian A dengan alasan yang disengaja: customer yang sudah membayar tapi kehilangan invoice-nya adalah masalah kepercayaan yang nyata, sementara carousel dan marquee murni hiasan. Kalau tenggat 5 Agustus terlanjur mepet, yang paling aman dipotong adalah Bagian A — bukan C.

Spec ini cakupannya besar (5 model baru, rearsitektur pembayaran, integrasi email, 4 halaman admin, 5 halaman publik baru). Karena itu ia dipecah jadi **tiga rencana implementasi terpisah** — B, C, A — bukan satu rencana raksasa. Masing-masing bisa selesai, di-review, dan di-merge sendiri; yang sudah jadi tetap bisa rilis meski sisanya belum.

## 7. Yang Sengaja TIDAK Dikerjakan

- **Kartu kredit/debit** — butuh tokenisasi + alur 3D Secure, jauh lebih berat, dan jarang dipakai untuk top-up nominal kecil.
- **E-wallet deeplink** (GoPay/ShopeePay tombol khusus) — QRIS sudah mencakup semuanya lewat scan; menambah keluarga integrasi baru untuk nilai tambah kecil. Kalau nanti diinginkan, arsitekturnya sudah siap: cukup satu baris baru di `PaymentMethodConfig` + satu fungsi charge, tanpa membongkar apa pun.
- **WhatsApp otomatis** (WhatsApp Business API) — persetujuan Meta makan berminggu-minggu + biaya per percakapan; tidak realistis untuk tenggat ini. Digantikan email (§4.2) + tombol share manual (§4.4).
- **Menyalin identitas visual referensi** (warna cyan, font, gaya logo) — yang disamakan struktur & fitur, bukan tampilan brand.
- **CMS untuk halaman statis** — konten FAQ/S&K/Privasi jarang berubah; file statis cukup, tabel DB + editor jadi beban tanpa manfaat sepadan.

## 8. Risiko yang Diketahui

| Risiko | Penanganan |
|---|---|
| `deposit.amount` vs `totalPaid` tertukar → customer dikredit fee + kode unik | Ditulis eksplisit di §3.4 sebagai titik paling rawan; wajib diverifikasi di E2E, bukan diasumsikan |
| Bentuk API Mandiri (`echannel`) diasumsikan sama dengan `bank_transfer` | §3.6 mewajibkan cek dokumentasi resmi saat implementasi |
| Fee/kode unik tidak ikut ke `order.total` → webhook amount-check menolak semua pembayaran | §3.3 menetapkan `total` = jumlah yang ditagih; E2E membuktikannya |
| Kegagalan kirim email menggagalkan webhook/fulfillment | §4.2 mewajibkan fire-and-forget ber-try/catch, tidak pernah melempar ke jalur uang |
| Verifikasi domain Resend (DNS) memakan waktu di luar kendali kita | Dikerjakan paling awal di Bagian C supaya propagasi DNS berjalan sementara kode ditulis |
| `/cek-transaksi` jadi cara memanen pesanan orang lain | §4.3 menuntut email **dan** nomor invoice sekaligus, plus rate limit |
| Bagian A memakan waktu bagian berisiko menjelang deadline | Urutan dikunci di §6: uang dulu, akses invoice, visual terakhir |
