# Migrasi Pembayaran Midtrans: Core API QRIS → Snap — Spec Desain

Status: Disetujui Wildan (2026-08-01)

## 1. Latar Belakang

Sejak Fase 3/4, checkout order dan deposit saldo sama-sama pakai Midtrans **Core API** (`chargeQris` di `web/src/lib/midtrans/client.ts`, hardcode `payment_type: "qris"`) — customer cuma bisa bayar QRIS, tidak ada pilihan Virtual Account/kartu kredit-debit/e-wallet lain meski Midtrans mendukungnya.

User minta ditambah metode bayar lain. Alih-alih bikin function Core API terpisah per metode (VA gampang, tapi kartu kredit/debit butuh tokenisasi kartu + alur 3D Secure yang jauh lebih kompleks), diputuskan pindah ke **Midtrans Snap** — satu widget yang otomatis menampilkan semua metode bayar yang diaktifkan di akun Midtrans, tanpa perlu integrasi manual per metode di kode kita.

**Keputusan yang mengikat:**
- Mode tampilan: **Snap.js popup** (bukan redirect ke halaman Midtrans) — customer tetap di situs kita, popup muncul di atasnya.
- Scope: **checkout order DAN deposit saldo**, dua-duanya pindah ke Snap sekaligus.
- Ini scope besar & nyentuh uang langsung (checkout + deposit + webhook yang sudah dikeraskan Fase 7c/7d) — proses brainstorming+spec penuh, BUKAN eksekusi langsung seperti kerjaan UI storefront sebelumnya.

## 2. Dampak samping penting (WAJIB diketahui sebelum lanjut)

**Fitur QR self-generate (Fase 7d, M-2) jadi tidak relevan lagi untuk jalur utama.** Fase 7d membangun render QR sendiri dari `qr_string` Core API (ganti dari panggilan ke `api.qrserver.com`) — itu kerja nyata & baru saja selesai. Dengan Snap, popup Midtrans SENDIRI yang menampilkan QR/VA/dll, kita tidak perlu render QR sendiri lagi untuk jalur pembayaran utama. **Kode QR self-generate tidak dihapus** (aman dibiarkan, tidak dipakai) — cuma dicatat di sini biar jangan bingung kenapa ada kode QR yang "menganggur" setelah migrasi ini.

## 3. Kredensial baru

`MIDTRANS_CLIENT_KEY` — env var baru, BEDA dari `MIDTRANS_SERVER_KEY` yang sudah ada. Client Key ini PUBLIK (dikirim ke browser lewat `<script data-client-key>`), bukan rahasia seperti Server Key. User sudah punya, akan diberikan sebelum eksekusi dimulai. Perlu ditambah juga sebagai `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` (prefix wajib supaya ke-bundle ke client-side oleh Next.js) di `.env.example`, `.env` lokal, DAN env var Vercel production.

## 4. Arsitektur

### 4.1 `web/src/lib/midtrans/client.ts` — fungsi baru

```ts
export async function createSnapTransaction(
  input: { orderId: string; grossAmount: number },
  creds = { serverKey: ..., isProduction: ... },
): Promise<{ token: string; redirectUrl: string }>
```

Panggil endpoint Snap `/snap/v1/transactions` (base URL beda dari Core API: `https://app.sandbox.midtrans.com` / `https://app.midtrans.com`, BUKAN `api.sandbox.midtrans.com` yang dipakai Core API — perlu dicek persis di dokumentasi resmi Midtrans saat implementasi, jangan asumsi sama). Body minimal: `transaction_details: { order_id, gross_amount }`. TIDAK kirim `payment_type` (itu yang bikin Snap otomatis kasih semua opsi, beda dari Core API yang wajib pilih satu).

`chargeQris` **tidak dihapus** dari file ini (masih valid sebagai kode Core API), tapi setelah migrasi ini tidak ada pemanggil aktifnya lagi di checkout/deposit — kode legacy, aman dibiarkan menganggur (bisa dibersihkan di fase lain kalau memang tidak ada rencana pakai Core API lagi).

### 4.2 Perubahan alur Server Action

**`web/src/app/actions/checkout.ts`**: ganti panggilan `chargeQris` → `createSnapTransaction`. Return value `CheckoutResult` tambah field baru `snapToken?: string` (selain `publicToken` yang sudah ada). **Pola return-tanpa-redirect yang sudah ada di file ini TIDAK berubah** — sudah pas untuk Snap (client yang handle navigasi setelah popup selesai, bukan server action).

**`web/src/app/actions/deposit.ts`**: perubahan LEBIH BESAR — action ini sekarang **redirect server-side di akhir** (`redirect(/account/deposit/${deposit.id})`), pola ini HARUS diubah jadi return object (samakan pola dengan `checkout.ts`) supaya client sempat menjalankan `snap.pay()` dulu sebelum navigasi. `DepositResult` tambah field `depositId?: string` dan `snapToken?: string`.

### 4.3 Client-side: pemicu popup Snap

Script Snap.js dimuat via `<Script src="https://app.sandbox.midtrans.com/snap/snap.js" data-client-key={NEXT_PUBLIC_MIDTRANS_CLIENT_KEY} strategy="afterInteractive" />` (Next.js `<Script>` component dari `next/script`, bukan tag `<script>` manual — sesuai konvensi Next.js buat script pihak ketiga). Base URL sandbox vs production dipilih dari `MIDTRANS_IS_PRODUCTION` (sama seperti server-side).

Dipasang sekali di level yang tepat (root layout kalau dipakai di banyak halaman, atau cukup di 2 halaman yang butuh: halaman produk + halaman form deposit — keputusan implementasi, prioritaskan tidak muat script di halaman yang tidak butuh).

**`product-detail-client.tsx`** dan **`deposit-form.tsx`**: tambah `useEffect` yang mengamati `state.snapToken` — begitu ada, panggil:
```ts
window.snap.pay(state.snapToken, {
  onSuccess: () => router.push(`/invoice/${state.publicToken}`),
  onPending: () => router.push(`/invoice/${state.publicToken}`),
  onError: () => { /* tampilkan pesan error, order tetap PENDING_PAYMENT, tidak redirect */ },
  onClose: () => { /* customer tutup popup tanpa bayar - order tetap PENDING_PAYMENT, tidak redirect, biarkan form tetap tampil supaya bisa dicoba lagi (submit ulang akan membuat token Snap baru) */ },
});
```
(Untuk deposit, redirect target `/account/deposit/${state.depositId}` bukan `/invoice/...`.)

### 4.4 Halaman status/invoice — tombol "Lanjutkan Pembayaran"

`invoice-status.tsx` dan `deposit-status.tsx`: kalau status masih `PENDING_PAYMENT`/`PENDING` DAN ada `snapToken` tersimpan, tampilkan tombol yang manggil ulang `window.snap.pay(storedToken, {...})` — ini gantiin fungsi render-QR yang sekarang (customer yang nutup popup Snap tanpa bayar bisa lanjut dari sini, bukan dari form checkout lagi). **`snapToken` perlu disimpan** di `OrderPayment.rawResponse`/`Deposit.rawResponse` (field JSON yang sudah ada, tinggal tambah key `snapToken` di object yang disimpan — TIDAK perlu migrasi Prisma, kolomnya sudah `Json`).

### 4.5 CSP (`web/next.config.ts`)

Directive yang HARUS ditambah (persis, cek dokumentasi Snap.js resmi saat implementasi — jangan tebak domain):
- `script-src`: tambah domain Midtrans buat load `snap.js`.
- `connect-src`: Snap.js kemungkinan butuh manggil API Midtrans langsung dari browser.
- `frame-src`: popup Snap kemungkinan pakai iframe untuk sebagian metode bayar (VA/CC biasanya render form di iframe).

Ini WAJIB diverifikasi jalan nyata di browser (buka DevTools Console, cek CSP violation) saat testing sandbox — kalau kurang satu directive, popup bisa blank/gagal tanpa error jelas ke user.

### 4.6 Webhook (`web/src/app/api/webhooks/midtrans/route.ts`)

**Ekspektasi: TIDAK perlu perubahan kode** — notifikasi Snap dan Core API setara di sistem Midtrans (satu mekanisme notifikasi terpadu). TAPI ini asumsi yang **WAJIB diverifikasi lewat transaksi sandbox Snap sungguhan** sebelum dianggap selesai — bukan sekadar dipercaya dari dokumentasi. Kalau ternyata field yang dikirim beda (misal ada field tambahan/berbeda nama), `notifSchema` (Zod) di file ini perlu disesuaikan. Verifikasi nominal (M-3, Fase 7d) dan signature (L-2) TETAP jalan seperti sekarang — logic itu tidak bergantung Core API vs Snap.

## 5. Error handling & edge case

- Popup Snap gagal dimuat (script gagal load, CSP salah, dll) → `window.snap` bakal `undefined`, panggilan `.pay()` akan throw — WAJIB dibungkus try/catch, tampilkan pesan generik "Gagal memuat metode pembayaran, coba lagi" (bukan crash React).
- Customer tutup popup (`onClose`) → order/deposit TETAP `PENDING_PAYMENT`/`PENDING` di DB (tidak berubah dari perilaku sekarang), bisa lanjut dari halaman status (§4.4).
- Token Snap kadaluarsa (biasanya beberapa jam) kalau customer baru balik lama setelah `onClose` → `snap.pay()` dengan token basi kemungkinan gagal — perlu ditest perilakunya di sandbox, siapkan pesan error yang mengarahkan customer bikin order baru kalau token benar-benar tidak bisa dipakai lagi.

## 6. Testing

Server action (`checkout.ts`/`deposit.ts`) tetap orchestration code, tidak dapat test otomatis (konsisten konvensi repo). `createSnapTransaction` juga tidak (network call langsung, sama seperti `chargeQris`/`getTransactionStatus` yang sudah ada, tidak ditest otomatis).

**Verifikasi WAJIB manual di sandbox sebelum dianggap selesai** (bukan opsional, ini jalur uang):
1. Checkout order → popup Snap muncul, semua metode yang aktif di akun sandbox kelihatan.
2. Selesaikan pembayaran QRIS via popup (pakai simulator sandbox Midtrans) → `onSuccess`/`onPending` jalan, redirect ke invoice, webhook masuk, order jadi `PAID`, fulfillment jalan seperti biasa.
3. Coba metode SELAIN QRIS (VA minimal) → transaksi settle, webhook tetap diproses benar (verifikasi nominal M-3 tidak salah baca format baru).
4. Tutup popup tanpa bayar (`onClose`) → order tetap `PENDING_PAYMENT`, tombol "Lanjutkan Pembayaran" di halaman invoice berhasil buka ulang popup dengan token yang sama.
5. Ulangi langkah 1-4 untuk alur **deposit** (bukan cuma checkout order).
6. Cek CSP: buka DevTools Console selama semua langkah di atas, pastikan NOL CSP violation error.

## 7. Di luar scope

- Menghapus `chargeQris`/kode QR self-generate Fase 7d (dibiarkan menganggur, lihat §2).
- Redirect-mode Snap (cuma popup mode yang dikerjakan).
- Kustomisasi tampilan popup Snap (pakai default Midtrans, tidak ada theming khusus di iterasi ini).
