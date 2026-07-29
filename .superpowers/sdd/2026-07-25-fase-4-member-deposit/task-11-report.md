# Task 11: Verifikasi akhir Fase 4 (end-to-end) — Laporan

Tanggal eksekusi: 2026-07-29
Status akhir: **DONE_WITH_CONCERNS** (semua verifikasi PASS, tapi ada catatan lingkungan penting — lihat "Concerns" di bawah, terutama soal file referensi Task 13 Fase 3 yang sudah tidak ada).

## Catatan penting sebelum membaca laporan ini

1. **File referensi `.superpowers/sdd/2026-07-25-fase-3-order-midtrans/task-13-report.md` yang diminta brief sebagai acuan format TIDAK DITEMUKAN** di worktree ini maupun di `main`. Investigasi: seluruh isi `.superpowers/sdd/` di-gitignore (`.superpowers/sdd/.gitignore` isinya cuma `*`), jadi laporan task per-fase adalah file kerja lokal yang ikut terhapus saat worktree/branch fase itu dibersihkan setelah merge (`PROGRESS.md` commit `bd588ae`: "merge lokal Fase 3 selesai, worktree & branch sdd dibersihkan"). Sebagai gantinya, format & strategi sintesis Task 13 Fase 3 direkonstruksi dari ringkasannya yang tercatat detail di `PROGRESS.md` commit `05c27ef` ("checkpoint Fase 3 — verifikasi end-to-end order + Midtrans selesai"), yang memuat breakdown FULL/PARSIAL/tidak-teruji + strategi sintesis persis. Laporan ini mengikuti pola tersebut.
2. **Playwright MCP tools TIDAK tersedia** di environment sesi ini (dicek via pencarian tool, tidak ada match). Sebagai gantinya dipakai library `playwright` (npm) langsung — di-install terpisah di direktori scratchpad (bukan di `web/`, tidak menyentuh `package.json`/`package-lock.json` project), chromium di-download via `npx playwright install chromium`, lalu dipakai untuk mengendalikan browser Chromium sungguhan (headless) yang mengarah ke `npm run dev` lokal. Ini pendekatan setara secara substansi dengan Playwright MCP (browser asli, bukan simulasi), hanya beda jalur tooling.

## Step 1: Automated checks — SEMUA PASS

```
cd web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build
```

- `npx vitest run`: **93/93 PASS** (20 test file) — tidak ada regresi dari Fase 1-3.
- `npx tsc --noEmit`: **bersih**, tidak ada output/error.
- `npm run lint`: **0 error**, 2 warning pre-existing (`@next/next/no-img-element` di `deposit-status.tsx:83` dan `invoice-status.tsx:140` — pola sama dengan Minor #2 yang sudah dicatat di Fase 3 Task 13, `<img>` mentah dipakai sengaja untuk render QR dari URL eksternal `api.qrserver.com`, bukan regresi baru).
- `npm run build`: **sukses**, semua route baru Fase 4 ter-generate: `/account`, `/account/deposit`, `/account/deposit/[depositId]`, `/account/deposits`, `/account/orders`, `/api/deposits/[depositId]/status`.

## Lingkungan verifikasi manual

- **Kredensial Midtrans sandbox ASLI TIDAK tersedia** — `web/.env` sebelum sesi ini sama sekali tidak punya `MIDTRANS_SERVER_KEY`. Dipakai strategi sintesis SAMA seperti Fase 3 Task 13: server key palsu-konsisten (`MIDTRANS_SERVER_KEY` ditambahkan sementara ke `.env`, DIHAPUS lagi setelah sesi ini selesai) + shim eksternal (script Node `--require` preload, di luar `web/src`, TIDAK di-commit, TIDAK mengubah source) yang mengintersep HANYA dua panggilan `fetch()` yang dilakukan `chargeQris()`/`getTransactionStatus()` (`src/lib/midtrans/client.ts`, kode asli tidak diubah sama sekali) ke `api.sandbox.midtrans.com/v2/charge` dan `/v2/*/status`, membalas dengan respons sintetis tapi valid secara schema. Signature webhook (`verifyMidtransSignature`) dihitung ASLI (SHA-512) dengan key yang sama, jadi jalur verifikasi signature tetap 100% kode asli yang dieksekusi.
- **Kredensial Digiflazz ASLI (dari Fase 2 Task 11) dipakai apa adanya, TIDAK disintesis.** Sesuai preseden Fase 2 Task 12 dan Fase 3 Task 13, IP mesin dev ini tidak ter-whitelist di Digiflazz, jadi setiap `adapter.createTransaction()` mendapat penolakan bertanda-tangan asli ("IP Anda tidak kami kenali: 182.11.153.46") → status `failed`. Ini hasil jaringan NYATA (bukan sintesis), kondisi lingkungan yang sudah terdokumentasi sejak Fase 2, dan justru pas dipakai untuk memicu jalur gagal-fulfillment→refund tanpa sintesis apa pun.
- **Setup data uji (bukan mengubah source):** produk `mobile-legends` sebelumnya `isActive=false` dan item "86 Diamonds" belum punya mapping `ProviderSku`. Diaktifkan sementara + ditambah 1 baris `ProviderSku` (`DIGIFLAZZ`/`aybt69`, sama seperti dipakai Fase 2 Task 11) supaya checkout bisa diuji. **Keduanya dikembalikan ke kondisi semula** di langkah cleanup (lihat Step 4).

## Step 2: Verifikasi manual — 8 sub-langkah

| # | Langkah | Hasil |
|---|---------|-------|
| 1 | Register → login → `/account` state kosong | **PASS** |
| 2 | Deposit Rp50.000 → redirect, QR, "Menunggu Pembayaran" | **PASS** |
| 3 | Webhook settlement deposit → "Berhasil" tanpa reload, saldo `/account` bertambah | **PASS** |
| 4 | Radio "Saldo" enabled/disabled sesuai saldo | **PASS** (dua arah diuji) |
| 5 | Checkout saldo → order PAID, saldo terpotong | **PASS** |
| 6 | Fulfillment gagal → REFUNDED, ledger 2 baris | **PASS — invariant uang terkonfirmasi penuh** |
| 7 | Regresi guest → REFUND_PENDING (bukan REFUNDED) | **PASS — regresi terkonfirmasi TIDAK terjadi** |
| 8 | Race checkout saldo pas-pasan | **PASS — atomik, tidak dobel potong** |

### Detail per langkah

**1. Register → login → dashboard awal — PASS.**
Registrasi via `POST /register` (server action asli) → redirect `/login?registered=1` → login → redirect `/account`. Isi halaman (dump teks penuh): `"...SaldoRp 0Isi SaldoTransaksi TerakhirLihat semuaBelum ada transaksi.Riwayat DepositLihat semuaBelum ada deposit."` — saldo Rp0, "Belum ada transaksi.", "Belum ada deposit." semua benar ada.
*(Catatan: skrip verifikasi otomatis saya sendiri sempat menandai langkah ini "FAIL" karena assertion string mencari `"Rp0"` padahal `Intl.NumberFormat` merender `"Rp 0"` dengan spasi — itu bug di skrip sekali-pakai saya, BUKAN bug aplikasi; teks di atas dari dump mentah membuktikan kontennya benar.)*

**2. Deposit Rp50.000 — PASS.**
Preset Rp50.000 dipilih, submit → `createDeposit` (kode asli) memanggil `chargeQris()` (kode asli, jaringan di-shim) → redirect `/account/deposit/[id]`. QR image (`<img alt="QRIS pembayaran">`) tampil, badge = "Menunggu Pembayaran". Log server: `[midtrans-shim] charge intercepted { orderId: '...', grossAmount: 50000 }`.

**3. Webhook settlement deposit — PASS.**
POST ke `/api/webhooks/midtrans` (endpoint asli) dengan payload `order_id=<depositId>`, signature dihitung asli dengan key yang sama → `200 {"ok":true}`. Halaman status (tanpa reload, react-query polling tiap 3 detik) berubah ke badge "Berhasil" + panel "Saldo berhasil ditambahkan!" muncul. Navigasi ulang ke `/account`: saldo `Rp 50.000`, deposit muncul di "Riwayat Deposit" dengan status "Berhasil".

**4. Radio "Saldo" di halaman produk — PASS (dua kondisi diuji).**
- Saldo cukup (Rp50.000 ≥ Rp22.000 harga item): radio TIDAK disabled (`aria-disabled=null`), teks "Saldo (Rp 50.000)" tampil.
- Saldo tidak cukup (saldo di-set sementara ke Rp5.000 via DB, dikembalikan setelahnya): radio `aria-disabled="true"`, link "Isi saldo dulu" (`href="/account/deposit"`) tampil dengan teks "Saldo tidak cukup. Isi saldo dulu.", dan klik ke radio yang disabled ditolak Playwright (element non-interactive) — perilaku disabled benar-benar berlaku, bukan cuma visual.

**5. Checkout bayar saldo — PASS.**
Isi form (`user_id`, `zone_id`, email), pilih radio "Saldo", submit → `createCheckoutOrder` → `createBalanceOrder` (kode asli, TIDAK memanggil Midtrans sama sekali untuk jalur saldo) → order `INV-20260729-3530` dibuat, transisi `PENDING_PAYMENT→PAID` ("Bayar pakai saldo"), redirect ke `/invoice/INV-20260729-3530`. Confirmed via log server (`POST /games/mobile-legends 200`, `createCheckoutOrder` jalan) dan DB.

**6. Fulfillment gagal → refund saldo — PASS, INI PENGECEKAN PALING PENTING.**
Karena `dispatchFulfillment` dipanggil **sinkron** di dalam `createBalanceOrder` sebelum action selesai, dan panggilan Digiflazz asli di lingkungan ini ditolak cepat (IP whitelist), order **sudah lanjut sampai REFUNDED** sebelum halaman invoice sempat dirender pertama kali — jadi status "Diproses" transien tidak sempat teramati visual di browser (state race pada skrip verifikasi saya sendiri, `page.locator("main")` sempat timeout menunggu setelah redirect — ini keterbatasan skrip Playwright sekali-pakai saya, BUKAN bug aplikasi; log server mengonfirmasi seluruh request-response cycle sukses server-side). Diverifikasi via query DB langsung (bukti kuat, lebih definitif dari sekadar snapshot UI):

```
Order INV-20260729-3530: status=REFUNDED total=22000 paidVia=BALANCE
  history: -->PENDING_PAYMENT (Checkout bayar saldo)
         | PENDING_PAYMENT->PAID (Bayar pakai saldo)
         | PAID->PROCESSING
         | -->REFUNDED (Auto-refund ke saldo: IP Anda tidak kami kenali: 182.11.153.46)
  fulfillments: DIGIFLAZZ/aybt69 status=FAILED msg=IP Anda tidak kami kenali: 182.11.153.46

WalletLedger utk order ini (2 baris, PERSIS seperti dispesifikasikan):
  - type=ORDER_PAYMENT amount=-22000 balanceAfter=28000
  - type=REFUND        amount=+22000 balanceAfter=50000

Saldo wallet sekarang: 50000
INVARIANT: balanceAfter baris ledger terakhir (50000) == saldo wallet sekarang (50000) -> TRUE
```

Riwayat ledger lengkap wallet member ini (urut waktu): `DEPOSIT +50000 (bal 50000)` → `ORDER_PAYMENT -22000 (bal 28000)` → `REFUND +22000 (bal 50000)`. **Tidak ada duplikasi refund, tidak ada debit yang hilang.** Ini 100% kode produksi asli — satu-satunya elemen "lingkungan" adalah penolakan IP dari Digiflazz yang sudah dipreseden sejak Fase 2 Task 12, bukan sintesis buatan saya.

**7. Regresi guest — PASS, PENGECEKAN KEDUA PALING PENTING.**
Checkout sebagai guest (tanpa login) — UI "Metode Pembayaran" memang tidak muncul untuk guest (sesuai desain, `session &&` guard di `product-detail-client.tsx`), default `paymentMethod="qris"` terpakai. Order `INV-20260729-0349` dibuat via `createMidtransOrder` (kode asli, `chargeQris` di-shim jaringan). Webhook settlement dikirim (signature asli) → `handleOrderWebhook` (kode asli) → `dispatchFulfillment` (kode asli) → Digiflazz ditolak IP (sama, real) → karena `order.userId === null`, `decideRefundDestination(null)` return `"queue"`:

```
Order INV-20260729-0349: status=REFUND_PENDING userId=null
  history: -->PENDING_PAYMENT (Checkout)
         | PENDING_PAYMENT->PAID (Midtrans settlement)
         | PAID->PROCESSING
         | -->REFUND_PENDING (IP Anda tidak kami kenali: 182.11.153.46)
```

**Status akhir REFUND_PENDING, BUKAN REFUNDED** — mengonfirmasi perubahan Task 6 (fulfillment.ts) untuk jalur auto-refund member TIDAK meregresi perilaku guest yang sudah ada sejak Fase 3.

**8. Race checkout saldo pas-pasan — PASS.**
User uji baru dibuat, saldo di-set langsung ke Rp22.000 (persis 1x harga item) via DB (setup test, bukan lewat deposit — deposit sudah diuji terpisah di langkah 2-3). Dua browser context berbeda (context terpisah tapi share cookie sesi via `storageState`) dibuka ke halaman produk yang sama, form diisi identik, tombol "Beli Sekarang" diklik nyaris bersamaan (`Promise.allSettled`):

- Tab A → redirect sukses ke `/invoice/INV-20260729-8213`
- Tab B → tetap di halaman produk, teks error "Saldo tidak cukup" tampil

Verifikasi DB:
```
Jumlah order dibuat: 2
  INV-20260729-8213: status=REFUNDED (lanjut lewat PAID->PROCESSING->REFUNDED, penolakan Digiflazz sama seperti di atas)
  INV-20260729-2575: status=FAILED (history: PENDING_PAYMENT->FAILED, note "Saldo tidak cukup")

WalletLedger race user (2 baris, bukan 4):
  - ORDER_PAYMENT amount=-22000 balanceAfter=0
  - REFUND        amount=+22000 balanceAfter=22000
```
Saldo hanya terpotong **satu kali** meski dua request checkout ditembak bersamaan — guard atomik `db.wallet.updateMany({ where: { balance: { gte: total } } } )` di `createBalanceOrder` (Task 5) terbukti race-safe.

## Step 4: Cleanup — SELESAI

- Dev server (`next dev` + shim) dihentikan (proses node di-kill paksa via PowerShell `Stop-Process`), **port 3000 dikonfirmasi tidak listening lagi** (`netstat` kosong).
- Data uji dihapus dari DB dev (`dannshop_next`):
  - 3 User uji (`verify-fase4-...@test.local`, termasuk 1 leftover dari percobaan skrip pertama yang sempat gagal di client meski server-nya sukses register) + Wallet + WalletLedger masing-masing.
  - 4 Order uji (2 punya userId member, 1 guest tanpa userId, 1 race-FAILED) beserta `OrderPayment`/`OrderFulfillment`/`OrderStatusHistory` terkait.
  - 1 Deposit uji.
  - `WebhookEvent` (source midtrans) yang tercipta selama sesi ini.
  - `Job` `PENDING` sisa (recheck-fulfillment/expire-order/expire-deposit yang orphan dari test) — 2 `Job` lama berstatus `DONE` bertanggal 2026-07-25 (dari sesi development sebelumnya, bukan dari sesi ini) sengaja **DIBIARKAN**, tidak disentuh.
  - `ProviderSku` uji (`DIGIFLAZZ`/`aybt69` untuk item "86 Diamonds") dihapus; `Product.isActive` untuk `mobile-legends` dikembalikan ke `false` (kondisi semula sebelum sesi ini).
- **Tidak ada akun uji tetap yang sengaja dipertahankan** — semua dihapus bersih.
- File script sementara (`web/_verify_*.mjs`) dihapus semua dari working tree; `git status` di root worktree kembali bersih (tidak ada perubahan tracked).
- `.env` dikembalikan persis ke isi semula (baris `MIDTRANS_SERVER_KEY`/`MIDTRANS_IS_PRODUCTION` yang ditambahkan sementara untuk sesi ini dihapus lagi).
- Query final sebelum cleanup dieksekusi mengonfirmasi hanya data uji sesi ini yang ada (tidak menyentuh `admin@dannshop.test` / wallet-nya).

## Concerns (untuk final whole-branch review)

1. **File referensi Task 13 Fase 3 sudah tidak ada** (lihat "Catatan penting" di atas) — bukan masalah Fase 4, tapi pola `.superpowers/sdd/*` yang selalu gitignored+dibersihkan per-fase berarti riwayat verifikasi fase-fase lama tidak bisa diaudit ulang dari file aslinya, hanya dari ringkasan di `PROGRESS.md`. Tidak actionable untuk Fase 4 sendiri, sekadar dicatat.
2. **Playwright MCP tidak tersedia di environment ini** — diganti library `playwright` npm langsung (browser asli, hasil setara), tapi worth dicatat kalau ada ekspektasi MCP tool spesifik harus terpasang untuk sesi berikutnya.
3. **Kredensial Midtrans sandbox ASLI masih belum ada** — sama seperti Fase 3, panggilan `chargeQris`/`getTransactionStatus` yang benar-benar sukses ke Midtrans sandbox asli SAMA SEKALI BELUM PERNAH diuji end-to-end (hanya via shim). Ini gap pre-go-live yang harus diulang begitu kredensial asli tersedia, bukan blocker Fase 4.
4. Step 5/6 tidak bisa diamati sebagai dua state UI terpisah karena `dispatchFulfillment` sinkron di dalam action + penolakan Digiflazz yang cepat — ini perilaku desain yang sudah benar (bukan bug), tapi berarti dalam kondisi real-world dengan provider yang benar-benar lambat/async, transisi status "Diproses" akan lebih terlihat lewat polling daripada yang teramati di sesi verifikasi ini.

## Kesimpulan

Semua 8 sub-langkah verifikasi manual **PASS**, termasuk kedua invariant paling kritis (ledger uang 2-baris tanpa duplikasi di langkah 6, dan regresi guest REFUND_PENDING vs REFUNDED di langkah 7) yang terverifikasi dengan kode produksi asli 100% (satu-satunya sintesis: respons jaringan Midtrans QRIS create/status-check, TIDAK ada kode di `web/src` yang diubah). Automated checks semua PASS. Fase 4 **siap lanjut ke final whole-branch review**.
