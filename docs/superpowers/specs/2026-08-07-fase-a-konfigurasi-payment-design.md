# Fase A — Konfigurasi Payment, Lazy Reconcile, E-Wallet & Fix UI VA

Tanggal: 2026-08-07
Ruang lingkup: task 1–4 dari permintaan user. Task 5 (sistem tier member) **tidak** termasuk —
dibrainstorm terpisah sebagai Fase B karena dia mengubah cara harga dihitung dan butuh migrasi
skema yang jauh lebih besar.

## Masalah yang diselesaikan

1. **Kredensial Midtrans terkunci di env.** `MIDTRANS_SERVER_KEY` / `MIDTRANS_IS_PRODUCTION` dibaca
   sebagai default parameter di lima fungsi `lib/midtrans/client.ts` dan sekali lagi di
   `api/webhooks/midtrans/route.ts`. Ganti key atau pindah sandbox↔production berarti edit env di
   Vercel lalu redeploy — tidak bisa dilakukan dari panel admin.
2. **Expiry pembayaran hardcode 15 menit** di dua tempat terpisah (`actions/checkout.ts:18`,
   `actions/deposit.ts:9`). Angka itu dipakai tiga hal sekaligus: `expiredAt` lokal, `custom_expiry`
   ke Midtrans, dan `runAt` job expire. Semua metode dipaksa sama, padahal QRIS dan VA punya
   karakter pembayaran yang berbeda.
3. **Kode unik & fee tidak bisa dimatikan.** `generateUniqueCode()` selalu menghasilkan 1–999 dan
   selalu dikenakan ke order *dan* deposit. Range-nya hardcode.
4. **Pembayaran tidak terdeteksi kalau webhook tidak sampai.** `GET /api/orders/[token]/status`
   hanya membaca DB — satu-satunya jalur PENDING→PAID adalah webhook Midtrans. Kalau URL webhook
   belum terpasang di dashboard (atau sedang tes di localhost yang tidak publik), order menunggu
   selamanya lalu EXPIRED meski dana sudah masuk. Ini berlaku sama rata untuk QRIS, VA, dan
   echannel — bukan bug khusus VA, dan bukan soal sandbox vs production key.
5. **Belum ada e-wallet.** Hanya QRIS, VA (BCA/BNI/BRI/CIMB/Permata), dan Mandiri echannel.
6. **Nomor VA meluber di layar sempit.** `invoice-status.tsx:192-193` — span `font-mono text-xl
   tracking-wide` dalam flex row tanpa `min-w-0`, tombol Salin tanpa `shrink-0`. Bug yang sama ada
   di `account/deposit/[depositId]/deposit-status.tsx`.

## Yang TIDAK berubah

- **QR string tidak pernah beregenerasi.** Di-charge sekali, disimpan di `OrderPayment.actions`,
  dirender jadi gambar di server (`invoice/[token]/page.tsx:24-27`) dan dikirim sebagai prop
  `qrDataUri`. Polling 3 detik hanya membaca status, tidak menyentuh QR. Alur "screenshot → buka
  m-banking → bayar" tetap aman. Satu-satunya yang mematikan QR adalah `expiredAt` terlewat.
- Perhitungan harga item (`lib/pricing/effective-price.ts`) dan `memberPrice` — itu wilayah Fase B.
- Alur fulfillment ke provider (Digiflazz dkk).

---

## Komponen

### A. `lib/payment/gateway-config.ts` (baru)

Sumber kebenaran tunggal kredensial Midtrans. Mengikuti pola `lib/notify/email-config.ts` yang
sudah berjalan: satu row `SiteSetting` berisi payload terenkripsi AES-256-GCM lewat
`lib/crypto.ts`. Nol tabel baru.

```
key: "midtrans_config"
payload (terenkripsi): { serverKey: string; merchantId: string; isProduction: boolean }
```

**Client key sengaja tidak disimpan.** Core API tidak memerlukannya —
`NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` di `.env` adalah sisa peninggalan Snap sebelum migrasi ke Core
API dan nol dipakai di seluruh `src/`. Menyediakan field yang tidak berefek apa-apa hanya
menyesatkan admin. Entri itu dihapus dari `.env.example`.

Fungsi yang diekspor:

- `getMidtransCreds(): Promise<MidtransCreds>` — baca DB, decrypt. Kalau row belum ada atau gagal
  decrypt, fallback ke `process.env.MIDTRANS_SERVER_KEY` / `MIDTRANS_IS_PRODUCTION`. Fallback ini
  yang membuat deploy pertama tidak mematikan pembayaran yang sedang jalan.
- `saveMidtransConfig(config)` — enkripsi lalu upsert.
- `getMidtransConfigStatus()` — aman dikirim ke browser: `{ configured, isProduction, source:
  "db" | "env" | "none", serverKeyMasked, merchantId }`. **Tidak pernah** membawa server key asli.

### B. `lib/midtrans/client.ts` — kredensial jadi argumen wajib

Lima default parameter `creds = { serverKey: process.env... }` **dicabut**. Setiap fungsi charge
dan `getTransactionStatus()` wajib menerima `creds` dari pemanggil, yang mengambilnya lewat
`getMidtransCreds()`. Tujuannya: tidak ada lagi jalur diam-diam ke env yang bisa membaca key
berbeda dari yang dipakai panel — kalau ada satu titik yang lupa di-update, TypeScript yang
menolak, bukan production yang gagal senyap.

`chargeByMethodCode(method, orderId, grossAmount, expiryMinutes)` bertambah parameter `creds`.

Webhook route (`api/webhooks/midtrans/route.ts`) juga beralih: guard `if
(!process.env.MIDTRANS_SERVER_KEY)` dan `verifyMidtransSignature(..., process.env...)` diganti
`const creds = await getMidtransCreds()`, dengan guard `if (!creds.serverKey)` yang sama semantik.

### C. Migrasi Prisma — `PaymentMethodConfig.expiryMinutes`

```prisma
expiryMinutes Int @default(15)
```

`ADD COLUMN ... DEFAULT 15` — aman, tidak menyentuh data lama, dan **mempertahankan perilaku
persis seperti sekarang** begitu deploy (semua metode tetap 15 menit). Admin lalu bebas mengatur
per metode dari panel; tidak ada angka yang dipaksakan spec ini.

Batas atas divalidasi terhadap dokumen Midtrans saat implementasi (`custom_expiry` punya batas
berbeda per channel). Validasi minimum: 5 menit — di bawah itu customer tidak sempat menyelesaikan
pembayaran. Kalau dokumen menunjukkan batas maksimum per channel, validasi dibuat per-channel;
kalau tidak, batas atas seragam 1440 menit (24 jam).

**Ini satu-satunya migrasi di Fase A.** Sesuai checklist deploy Vercel: `prisma migrate deploy` ke
prod wajib dijalankan user sebelum/berbarengan dengan push.

### D. `lib/payment/rules.ts` (baru) — aturan kode unik & fee

Disimpan di `SiteSetting` key `payment_rules` sebagai JSON biasa (bukan rahasia, tidak dienkripsi):

```
{
  uniqueCodeOrder: boolean,    // default true
  uniqueCodeDeposit: boolean,  // default true
  feeOrder: boolean,           // default true
  feeDeposit: boolean,         // default true
  uniqueCodeMin: number,       // default 1
  uniqueCodeMax: number,       // default 999
}
```

Default di atas = perilaku sekarang, sehingga tidak ada perubahan tagihan pada deploy pertama.

`generateUniqueCode()` di `lib/payment/fee.ts` berubah tanda tangan jadi `generateUniqueCode(min,
max)`. Validasi: `1 <= min <= max <= 99999`.

Titik pakai (`actions/checkout.ts`, `actions/deposit.ts`): kalau toggle mati, `uniqueCode = 0` dan
`fee = 0n`, tapi **tetap melewati `calculateTotal()` yang sama**. Tidak ada jalur perhitungan total
kedua yang bisa menyimpang — ini menjaga invarian yang sudah dipegang webhook saat mencocokkan
`gross_amount` dengan `order.total` / `deposit.totalPaid`.

### E. `lib/payment/settlement.ts` (baru) — logika settlement bersama

`handleOrderWebhook` dan `handleDepositWebhook` **dipindahkan** dari `api/webhooks/midtrans/route.ts`
ke modul ini, bukan disalin. Keduanya menyentuh uang (kredit saldo, dispatch fulfillment); dua
salinan yang bisa menyimpang adalah risiko yang tidak sepadan.

Setelah dipindah, kedua fungsi punya dua pemanggil: route webhook (seperti sekarang) dan lazy
reconcile (baru). Perilaku idempotennya sudah benar dan dipertahankan apa adanya — klaim atomik
lewat `updateMany({ where: { status: "PENDING..." } })` plus `idempotencyKey` unik di
`WalletLedger` berarti pemanggilan ganda dari dua jalur aman.

Route webhook menyusut jadi murni urusan transport: parse, verifikasi signature, dedup
`WebhookEvent`, panggil settlement, tandai processed.

### F. Lazy reconcile di endpoint status

Di `GET /api/orders/[token]/status` dan `GET /api/deposits/[depositId]/status`:

Sebelum menyusun response — kalau status masih `PENDING_PAYMENT`/`PENDING`, `paidVia` MIDTRANS, dan
sudah lewat **20 detik** sejak reconcile terakhir → tarik `getTransactionStatus()` ke Midtrans,
jalankan fungsi settlement bersama, lalu baca ulang record sebelum merespons.

Throttle 20 detik diperlukan karena browser polling tiap 3 detik; tanpa itu satu invoice terbuka
akan menembak Midtrans 20×/menit. Penanda waktu reconcile terakhir memakai `OrderPayment.updatedAt`
/ `Deposit.updatedAt` — kolom yang sudah ada, jadi tidak menambah kolom baru untuk ini. Konsekuensi
yang diterima: update lain pada record itu ikut menggeser jendela throttle; efeknya paling buruk
hanya menunda satu percobaan reconcile 20 detik, dan polling berikutnya tetap mencoba lagi.

Kegagalan panggilan Midtrans di jalur ini **tidak boleh menggagalkan response status** — di-catch,
di-log, endpoint tetap mengembalikan data DB apa adanya. Reconcile adalah jaring pengaman, bukan
dependensi halaman invoice.

### G. E-wallet GoPay & ShopeePay

Varian baru pada `PaymentActions`:

```ts
| { kind: "ewallet"; provider: "gopay" | "shopeepay"; deeplink: string; qrUrl: string | null }
```

Response Midtrans untuk e-wallet berbentuk array `actions` (`generate-qr-code`, `deeplink-redirect`,
`get-status`, `cancel`), berbeda dari VA — jadi skema Zod-nya sendiri, dengan pencarian action
berdasarkan `name` (bukan indeks array, yang urutannya tidak dijamin). ShopeePay hanya memberi
deeplink; GoPay memberi deeplink + QR.

Dua row `PaymentMethodConfig` baru: `ewallet_gopay`, `ewallet_shopeepay`. Karena `prisma/seed.ts`
tidak dijalankan di production, keduanya di-**upsert saat halaman Konfigurasi Payment dibuka**
(idempoten, `isActive: false` sebagai nilai awal supaya tidak tiba-tiba muncul di checkout sebelum
admin siap). `prisma/seed.ts` juga ditambah entri yang sama supaya environment baru konsisten.

UI: blok tombol "Buka aplikasi GoPay/ShopeePay" di `invoice-status.tsx` dan `deposit-status.tsx`,
plus QR untuk GoPay bila tersedia. Halaman invoice sudah punya `qrDataUri` untuk QRIS; untuk GoPay
`qrUrl` adalah URL gambar dari Midtrans, jadi dirender langsung sebagai `<img src>` tanpa lewat
library `qrcode`.

### H. Halaman admin `/admin/payment-config`

Entri nav baru di `app/admin/nav-config.ts`, grup "Pembayaran & Provider" yang sudah ada, di atas
"Metode Pembayaran". `NAV_GROUPS` adalah sumber tunggal menu + judul header, jadi cukup satu entri.

Isi halaman:

1. **Kredensial Midtrans** — server key (password field, placeholder menampilkan versi masked kalau
   sudah terisi; dikosongkan = tidak mengubah yang tersimpan), merchant ID, toggle
   Sandbox/Production. Menampilkan `source` (db/env/none) supaya admin tahu apakah yang aktif nilai
   panel atau fallback env.
2. **URL webhook siap-salin** — mengikuti pola halaman webhook Digiflazz yang sudah ada, agar admin
   bisa langsung paste ke dashboard Midtrans. Ini menutup penyebab paling umum masalah #4.
3. **Aturan kode unik & fee** — 4 toggle + input range min/max.

Semua server action di halaman ini memakai pola `requireAdmin()` + `logAdmin()` lokal yang sudah
dipakai `actions/payment-methods.ts`. Detail yang di-log ke `AdminActionLog` **tidak boleh memuat
server key** — cukup `{ isProduction, serverKeyChanged: boolean }`.

Expiry per metode **tidak** ditaruh di halaman ini; dia menyatu di form
`/admin/payment-methods` bersama fee dan logo, karena nilainya per-metode.

### I. Fix UI nomor VA

`invoice-status.tsx` dan `deposit-status.tsx`: span nomor VA dapat `min-w-0 break-all`, tombol
Salin dapat `shrink-0`. Blok echannel (kode perusahaan / kode bayar) diperiksa dengan perlakuan
yang sama.

---

## Alur data setelah perubahan

```
Checkout / Deposit
  ├─ baca PaymentMethodConfig  → feeFlat, feePercent, expiryMinutes
  ├─ baca payment_rules        → toggle fee/kode unik + range
  ├─ hitung fee, uniqueCode, total  (calculateTotal — satu jalur)
  ├─ getMidtransCreds()        → DB terenkripsi, fallback env
  └─ chargeByMethodCode(..., expiryMinutes, creds)
        → simpan actions ke OrderPayment.actions / Deposit.rawResponse
        → jadwalkan job expire pada expiredAt

Deteksi pembayaran (dua jalur, satu logika)
  ├─ Webhook Midtrans  → verifikasi signature → dedup → settlement
  └─ Polling status    → throttle 20 dtk → getTransactionStatus → settlement
```

## Penanganan error

- `getMidtransCreds()` gagal decrypt → log + fallback env, jangan throw (jangan sampai seluruh
  checkout mati karena satu row korup). Pola sama persis `getEmailProviderConfig()`.
- Charge Midtrans gagal → perilaku sekarang dipertahankan: order/deposit → FAILED, pesan generik ke
  user, detail ke `console.error`.
- Reconcile gagal → di-catch, response status tetap jalan (lihat F).
- Toggle/range tidak valid → ditolak Zod di server action sebelum menyentuh DB.

## Testing

Menambah test Vitest (pola `tests/midtrans-*.test.ts` yang sudah ada, semuanya pure-function tanpa
DB):

- `generateUniqueCode(min, max)` — hasil selalu dalam range, `min === max` menghasilkan nilai tetap,
  range tidak valid ditolak.
- Aturan fee/kode unik: tiap kombinasi toggle menghasilkan `total` yang benar lewat
  `calculateTotal()`.
- Parsing response e-wallet: action dicari berdasarkan `name`, bukan indeks; ShopeePay tanpa QR
  tidak membuat parser gagal.
- Round-trip enkripsi/dekripsi config gateway + fallback ke env saat row kosong/korup.

Verifikasi akhir: `npx tsc --noEmit`, `npm run lint`, `npm test`. QA visual dan pengujian pembayaran
sandbox di browser dilakukan user.

## Yang ditunda ke Fase B

Sistem tier member (bronze/silver/gold/platinum) dengan diskon persen per tier, harga langganan per
tier, dan pengaturannya di panel admin. Butuh model `MembershipTier` + `UserMembership`, dan
`effectivePrice()` harus menerima tier alih-alih boolean `isMember`. Dibrainstorm terpisah.
