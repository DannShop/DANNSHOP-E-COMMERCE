# Task 8 — Laporan Verifikasi Akhir Fase 7a

Status keseluruhan (TERKINI, setelah Ronde 2): **DONE_WITH_CONCERNS** — automated check sekarang 100% hijau (termasuk build) setelah fix RSC boundary di commit `0952ef4`. Manual E2E (Step 5) sudah dijalankan penuh, 6 dari 7 sub-langkah **PASS**. 1 sub-langkah (kasus NEEDS_REVIEW (b)) menemukan **bug kode nyata baru** (bukan limitasi environment, bukan regresi dari bug Ronde 1) — lihat "Ronde 2" di bawah untuk detail lengkap. Ronde 1 (di bawah) dipertahankan sebagai histori valid, bukan dihapus.

---

## RONDE 1 (histori — bug build RSC boundary, sebelum fix commit `0952ef4`)

Status ronde 1 saat ditulis: **BLOCKED** — ditemukan bug kode nyata di Task 7 pada Step 3 (automated check), sebelum verifikasi manual (Step 5) sempat dijalankan. Sesuai instruksi task, eksekusi dihentikan di sini alih-alih menutupi bug dengan workaround, dan Task 8 tidak melakukan perubahan source code apa pun untuk memperbaikinya (di luar scope — verifikasi-only).

## Step 1-2: Env var Telegram di `.env.example` — PASS

Ditambahkan 2 baris ke `web/.env.example`:
```
TELEGRAM_BOT_TOKEN="isi-token-bot-dari-botfather"
TELEGRAM_CHAT_ID="isi-chat-id-tujuan-notifikasi"
```
Commit: `148e530` — `docs(fase7a): tambah env var Telegram ke .env.example`.

`web/.env` (tidak di-commit, sudah ada sebelumnya) sudah berisi `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` asli sesuai deskripsi environment dari controller.

## Step 3: Automated check — **PARSIAL, BERHENTI DI BUILD (FAIL)**

Dijalankan dari `web/`:

| Perintah | Hasil |
|---|---|
| `npx vitest run` | **PASS** — 22 file test, 104/104 test lulus, tidak ada regresi. |
| `npx tsc --noEmit` | **PASS** — tidak ada error type. |
| `npm run lint` | **PASS** — 0 error, 2 warning pra-eksisting tidak terkait Fase 7a (`no-img-element` di `account/deposit` dan `invoice`, sudah ada sebelum Fase 7a). |
| `npm run build` | **FAIL (exit code 1)** — lihat detail bug di bawah. |

### Bug yang ditemukan (bukan limitasi environment)

`npm run build` gagal total dengan error Next.js:

```
It is not allowed to define inline "use server" annotated Server Actions in Client Components.
To use Server Actions in a Client Component, you can either export them from a separate file
with "use server" at the top, or pass them down through props from a Server Component.
```

Error muncul untuk keempat action di `web/src/app/actions/orders.ts`
(`retryFulfillmentAction`, `retryRefundAction`, `markCompletedManualAction`, `markRefundedAction`),
semua memakai pola `"use server"` inline per-fungsi (bukan directive file-level).

Root cause: `web/src/app/admin/orders/[orderNumber]/order-actions.tsx` adalah **Client Component**
(`"use client"` di baris 1) yang meng-**import langsung** keempat fungsi tsb dari
`@/app/actions/orders` (baris 6-8):

```ts
import {
  retryFulfillmentAction, retryRefundAction, markCompletedManualAction, markRefundedAction,
} from "@/app/actions/orders";
```

Next.js 16 melarang pola ini ketika file server action memakai `"use server"` inline per-fungsi
(bukan file-level) — larangan ini persis yang didokumentasikan di komentar kode Fase 4 yang sudah
ada di codebase yang sama, `web/src/app/admin/providers/provider-card.tsx:19-24`:

> "Action-action server diterima lewat props dari page.tsx (Server Component), bukan di-import
> langsung di file "use client" ini — actions/providers.ts memakai "use server" inline per-fungsi
> (supaya bisa tetap meng-export Zod schema untuk test), dan Next.js melarang inline "use server"
> di-import langsung oleh Client Component; pola resminya justru "pass them down through props
> from a Server Component"."

Pola yang benar sudah ada dan established di codebase ini: `web/src/app/admin/providers/page.tsx`
(Server Component) meng-import action dari `actions/providers.ts` lalu meneruskannya sebagai props
ke `<ProviderCard toggleProviderActive={...} .../>` (Client Component) — **tidak** ada import
langsung fungsi server action di file `"use client"`.

Task 7 (`web/src/app/admin/orders/[orderNumber]/page.tsx` + `order-actions.tsx`, commit `551017e`)
tidak mengikuti pola ini: `page.tsx` (Server Component) memanggil `<OrderActions orderId=... />`
tanpa meneruskan action apa pun sebagai props, dan `order-actions.tsx` meng-import
`retryFulfillmentAction` dkk langsung di module scope Client Component.

`actions/orders.ts` sendiri berisi komentar (baris 11-14) yang menjelaskan alasan pola
`"use server"` inline per-fungsi dipilih (konsisten dengan `catalog.ts`/`providers.ts`) — tapi
komentar itu tidak menyebut konsekuensi larangan import-langsung-dari-Client-Component, dan
konsumen di Task 7 melanggarnya.

**Ini bukan limitasi environment (bukan Digiflazz IP-whitelist / bukan Midtrans sandbox) — ini
adalah bug arsitektur RSC boundary yang membuat build produksi gagal total (exit code 1),
mempengaruhi seluruh build, bukan cuma satu route.** Tidak lolos kriteria PASS Step 3 brief
("build sukses termasuk route baru").

`vitest`/`tsc`/`lint` tidak menangkap ini karena ketiganya tidak melakukan analisis RSC
client/server module-boundary — hanya `next build` (bundler) yang memvalidasi batas ini.

### Verifikasi tambahan (karakterisasi blast radius, tanpa mengubah kode)

- `npm run dev` (Turbopack) berhasil start tanpa error compile langsung (`✓ Ready in 2.5s`) —
  karena Next.js dev meng-compile route secara lazy/on-demand. Percobaan `curl` ke
  `/admin/orders/TEST-DOES-NOT-EXIST` menghasilkan redirect 302 (middleware auth, sebelum page
  handler ter-invoke), jadi belum sempat memicu compile module graph halaman detail order secara
  penuh dalam dev mode. Tidak dilanjutkan ke login+navigasi manual karena `next build` sudah cukup
  definitif menunjukkan bug nyata, dan melanjutkan verifikasi manual di atas kode yang gagal build
  akan menutupi masalah, bukan memverifikasinya.
- Dev server dihentikan kembali setelah pengecekan ini (port 3000 dikonfirmasi bebas listener).

## Step 4 (setup bot Telegram): N/A

Sesuai instruksi controller, bot Telegram sudah tersedia dengan kredensial asli di `web/.env`
(`t.me/dannshop_bot`) — langkah BotFather di brief dilewati.

## Step 5 (verifikasi manual E2E): **TIDAK TERUJI (diblokir oleh bug Step 3)**

Semua 7 sub-langkah Step 5 (kasus NEEDS_REVIEW (a)/(b), REFUND_PENDING, filter tab
`/admin/orders`, "Tandai Selesai Manual") **tidak dijalankan** — 5 dari 7 sub-langkah bergantung
langsung pada halaman `/admin/orders/[orderNumber]` yang tidak bisa di-build untuk produksi karena
bug di atas. Menjalankan verifikasi manual di `npm run dev` saja (yang mungkin tidak memicu error
yang sama sampai route benar-benar diakses) berisiko memberi sinyal PASS palsu untuk kode yang
akan gagal saat `next build` — bertentangan dengan instruksi eksplisit task ("STOP dan laporkan
BLOCKED... jangan menutupi bug nyata").

Tidak ada data uji (Order/WalletLedger/AdminActionLog/OrderFulfillment) yang sempat dibuat di DB,
tidak ada `ProviderSku`/`Wallet` yang sempat diubah — jadi tidak ada cleanup DB yang diperlukan
untuk Step 7.

## Kesimpulan & rekomendasi

Task 8 **tidak bisa dilanjutkan/diselesaikan** sampai bug RSC boundary di atas diperbaiki oleh
perubahan kode (di luar scope Task 8 yang verifikasi-only). Perbaikan yang selaras dengan pola
established di codebase ini (lihat `provider-card.tsx` + `providers/page.tsx`):

1. Di `web/src/app/admin/orders/[orderNumber]/page.tsx` (Server Component): import keempat action
   dari `@/app/actions/orders` dan teruskan sebagai props ke `<OrderActions .../>`.
2. Di `web/src/app/admin/orders/[orderNumber]/order-actions.tsx`: hapus import langsung
   `retryFulfillmentAction`/`retryRefundAction`/`markCompletedManualAction`/`markRefundedAction`
   dari `@/app/actions/orders`; terima keempatnya sebagai props (tipe `ServerAction = (formData:
   FormData) => Promise<ActionResult>`, sama seperti `ProviderCardProps`).
3. Setelah fix, ulangi Step 3 (automated check penuh) sampai `npm run build` PASS, baru lanjutkan
   Step 5 (manual E2E) dan sisa langkah Task 8.

Tidak ada bagian yang disintesis (Midtrans/Digiflazz) karena verifikasi manual belum sempat
dimulai — task berhenti di automated check (Step 3).

---

## RONDE 2 (setelah fix RSC boundary, commit `0952ef4`)

Coordinator mengonfirmasi bug RSC boundary Ronde 1 sudah diperbaiki oleh implementer Task 7 di
commit `0952ef4` ("fix(fase7a): pindahkan server actions order-actions.tsx jadi props (RSC
boundary)"), sudah lolos re-review terpisah. Diverifikasi ulang di worktree yang sama.

### Step 3 (ulang): Automated check — **PASS PENUH**

| Perintah | Hasil |
|---|---|
| `npx vitest run` | **PASS** — 22 file test, 104/104 test lulus. |
| `npx tsc --noEmit` | **PASS** — tidak ada error type. |
| `npm run lint` | **PASS** — 0 error, 2 warning pra-eksisting sama seperti Ronde 1 (tidak terkait Fase 7a). |
| `npm run build` | **PASS** (exit code 0) — semua 23 route ter-generate termasuk `/admin/orders` dan `/admin/orders/[orderNumber]`. |

Diperiksa juga diff fix commit `0952ef4`: `order-actions.tsx` sekarang menerima keempat action
(`retryFulfillmentAction`, `retryRefundAction`, `markCompletedManualAction`, `markRefundedAction`)
sebagai props (tipe `ServerAction` dari `action-utils.tsx`), `page.tsx` meng-import dari
`@/app/actions/orders` dan meneruskannya sebagai props ke `<OrderActions .../>` — persis pola
`provider-card.tsx`/`providers/page.tsx` yang direkomendasikan di laporan Ronde 1.

### Step 4: N/A (sama seperti Ronde 1 — bot Telegram sudah tersedia, kredensial asli di `web/.env`)

### Step 5: Verifikasi manual E2E — **6 dari 7 sub-langkah PASS, 1 sub-langkah menemukan bug baru**

Dijalankan `npm run dev` (Turbopack) + Playwright browser (Chromium) asli untuk semua interaksi UI
(login, klik tombol, confirm dialog, isi form) via `mcp__plugin_playwright_playwright__*`. Untuk
memicu skenario NEEDS_REVIEW/REFUND_PENDING yang butuh kondisi race yang tidak bisa diorkestrasi
dari luar satu request sinkron (lihat penjelasan di sub-langkah 1), dipakai teknik yang sudah
disahkan controller: konstruksi state Order "PAID" langsung via Prisma (meniru persis hasil akhir
kode produksi `createBalanceOrder`/webhook settlement), lalu panggil fungsi produksi ASLI
`dispatchFulfillment()`/`applyFulfillmentResult()` yang diimpor tanpa modifikasi dari
`web/src/lib/order/fulfillment.ts`. Semua panggilan Digiflazz dan Telegram di bawah ini 100% nyata
(network call sungguhan), tidak ada mocking di level itu.

**Fixture awal (disintesis, didokumentasikan, semua dibersihkan di Step 7):**
- Produk `mobile-legends` + item `86 Diamonds` diaktifkan (`isActive=true`), `ProviderSku` baru
  `TEST-ML86` (DIGIFLAZZ, `costPrice=20000`, `status=ACTIVE`) dibuat — sebelumnya kedua produk
  tidak punya `ProviderSku` sama sekali di DB dev ini.
- Member uji `member-a@dannshop-test.local` didaftarkan via halaman `/register` ASLI (bcrypt hash
  + `Wallet` baris otomatis dari kode produksi `registerAction`), saldo awal di-set `Rp 100.000`
  langsung via DB (fixture, BUKAN exercise jalur deposit — deposit Midtrans sudah diverifikasi
  penuh di Fase 4 Task 11, di luar scope Task 8).
- Guest order (`guest-test-case5@dannshop-test.local`) dan order QRIS kedua utk member A dikonstruksi
  langsung sebagai `Order`+`OrderPayment` status `PAID` (`paymentRef: "SYNTH-TEST-..."`,
  `rawResponse: {synthetic:true}`) — kredensial Midtrans sandbox asli tidak tersedia (gap sama
  seperti Fase 3/4), pola identik Task 11 Fase 4.

**1. NEEDS_REVIEW kasus (a) — tidak ada provider SKU tersedia: PASS**

Ditemukan: `createCheckoutOrder` (checkout.ts) MELAKUKAN pre-check `selectFulfillmentSku` SEBELUM
membuat Order sama sekali — kalau SKU dinonaktifkan sebelum submit, checkout ditolak dengan pesan
ramah ("Item ini sedang tidak tersedia untuk dibeli") dan **tidak ada Order yang dibuat**. Ini
perilaku produksi yang BENAR (guard defensif), tapi berarti race window nyata antara pre-check ini
dan re-check internal `dispatchFulfillment` cuma beberapa ratus milidetik di dalam SATU request
sinkron — tidak bisa di-trigger dari proses eksternal manapun tanpa mengubah kode. Jadi dipakai
teknik disahkan: Order dikonstruksi langsung sbg `PAID` (meniru state akhir `createBalanceOrder`,
termasuk debit wallet asli + `WalletLedger` ber-`idempotencyKey` `order-payment:${orderId}`),
`ProviderSku` dinonaktifkan, lalu `dispatchFulfillment()` ASLI dipanggil. Hasil: order jatuh ke
`NEEDS_REVIEW`, `OrderStatusHistory` note "Tidak ada provider SKU tersedia" tercatat benar. Cek
konektivitas Telegram terpisah (`getMe` → `ok:true`, bot `dannshop_bot`) + tidak ada
`console.error` dari `sendTelegramAlert` selama pemanggilan → alert terkirim (kode ini return void
setelah fetch sukses, tidak ada bukti lain yang bisa diperiksa selain absennya log error dan
konektivitas dasar yang terbukti jalan — sesuai izin brief bahwa ini cukup, tidak perlu konfirmasi
visual HP).

**2. Halaman detail order → tombol "Coba Lagi": PASS**

Login admin (`admin@dannshop.test`), buka `/admin/orders/[orderNumber]` → halaman tampil benar,
status "Sedang Ditinjau", tombol **"Coba Lagi"** muncul (bukan "Coba Refund Ulang", karena belum
ada `OrderFulfillment` row sama sekali — `canRetryRefund` di `page.tsx` butuh
`latestFulfillment?.status === "FAILED"` yang belum terpenuhi).

**3. Reaktivasi SKU + klik "Coba Lagi": PASS**

`ProviderSku` dikembalikan `ACTIVE`, klik "Coba Lagi" → dialog `confirm` browser asli muncul
("Coba kirim ulang fulfillment order ini?") → di-accept → `retryOrderFulfillment` (kode produksi
asli) berjalan → panggilan Digiflazz ASLI ditolak IP-whitelist: `"IP Anda tidak kami kenali:
103.18.34.236"` — **limitasi environment terdokumentasi sejak Fase 2/3/4, bukan bug**. Fulfillment
attempt 1 tercatat `FAILED` dengan pesan itu persis. Karena member A + wallet masih ada, auto-refund
produksi asli langsung jalan sukses → order `REFUNDED`. Diverifikasi ledger: persis 2 baris
(`ORDER_PAYMENT -22000` lalu `REFUND +22000`, `idempotencyKey` `order-payment:...`/`order-refund:...`),
`balanceAfter` akhir `100000` (kembali ke saldo semula) — double-entry benar, tanpa duplikasi.

**4. NEEDS_REVIEW kasus (b) — wallet hilang saat auto-refund: PASS SEBAGIAN + BUG BARU DITEMUKAN**

Karena `Wallet.userId` punya FK+`@unique` ke `User.id` dan `WalletLedger` mereferensikan
`Wallet.id`, wallet tidak bisa langsung `delete()` (P2003 kalau ada ledger). Dipakai teknik minim-
invasif: `Wallet.userId` member A "diparkir" sementara ke user placeholder (jadi
`where:{userId: order.userId}` di `applyFulfillmentResult` tidak menemukan baris = P2025), tanpa
menghapus baris `Wallet`/`WalletLedger` asli. Order kedua utk member A dikonstruksi PAID via QRIS
(jalur ini tidak menyentuh wallet saat checkout, beda dari BALANCE), lalu `dispatchFulfillment()`
ASLI dipanggil: Digiflazz asli ditolak IP-whitelist (limitasi environment, sama seperti di atas) →
fulfillment `FAILED` → auto-refund dicoba → `tx.wallet.update()` gagal **P2025** persis seperti
diharapkan → tertangkap di catch block `applyFulfillmentResult` (`fulfillment.ts` baris ~144-153).

**BUG DITEMUKAN (kode nyata, bukan limitasi environment):** di dalam catch block itu, urutan
operasinya adalah (1) `db.order.update(status: NEEDS_REVIEW)` — sukses, (2)
`db.orderStatusHistory.create({note: `Auto-refund gagal: ${e.message}`})` — **THROW P2000** ("The
provided value for the column is too long for the column's type. Column: note"), (3)
`sendTelegramAlert(...)` — **TIDAK PERNAH DIJALANKAN** karena exception di langkah (2) melompati
sisa blok.

Root cause: `OrderStatusHistory.note` adalah `VARCHAR(191)` (lihat
`prisma/migrations/20260719115246_init/migration.sql`), sedangkan `e.message` dari
`PrismaClientKnownRequestError` adalah string multi-baris terformat (contoh nyata dari sesi ini:
~700+ karakter, berisi cuplikan kode + stack trace ringkas) — **ini BUKAN kasus tepi yang jarang
terjadi**, ini bentuk NORMAL dari hampir semua error yang dilempar Prisma. Artinya: kapan pun
transaksi auto-refund di `applyFulfillmentResult` gagal karena error yang berasal dari Prisma
(constraint violation, connection blip, race condition apa pun — bukan cuma P2025 kasus uji ini),
kemungkinan besar catatan audit (`OrderStatusHistory`) DAN notifikasi Telegram-nya SAMA-SAMA hilang
diam-diam. Ini bertentangan langsung dengan tujuan inti Fase 7a (spec §4 — notifikasi Telegram
wajib masuk untuk setiap eskalasi NEEDS_REVIEW) untuk salah satu dari 3 penyebab NEEDS_REVIEW yang
justru paling berisiko (kegagalan auto-refund uang member).

Efek yang terbukti di UI: order `INV-20260729-7155` sukses jatuh ke `NEEDS_REVIEW` (state DB benar),
TAPI panel "Riwayat Status" di halaman admin melompat langsung dari "PAID → PROCESSING" tanpa ada
baris yang menjelaskan transisi ke NEEDS_REVIEW sama sekali (baris yang seharusnya ada — "PROCESSING
→ NEEDS_REVIEW, Auto-refund gagal: ..." — tidak pernah tercatat).

**Bagian yang tetap PASS (tidak terdampak bug di atas):** order tetap benar berakhir di
`NEEDS_REVIEW` (klaim atomik & error handling luar tetap defensif — order tidak macet). Tombol
"Coba Refund Ulang" muncul benar (bukan "Coba Lagi", karena `latestFulfillment.status === "FAILED"`
sudah terpenuhi). Wallet dikembalikan (un-parkir) ke member A, klik "Coba Refund Ulang" → dialog
confirm → `retryOrderRefund` (kode produksi asli) sukses: saldo member bertambah `Rp 22.000`
(122.000, karena order ini dibayar via QRIS bukan potong saldo, jadi refund murni menambah), order
`REFUNDED`. **Ledger diverifikasi: tepat 1 baris baru** (`REFUND +22000`,
`idempotencyKey: order-refund:<orderId>`) — TIDAK ada baris duplikat dari percobaan auto-refund
yang gagal sebelumnya, karena `db.$transaction` yang gagal di P2025 melakukan rollback penuh
(tidak ada partial write). **Invariant uang paling kritis (no double-credit, ledger idempotent)
tetap 100% benar** meski notifikasinya bocor.

Risiko terkait yang BELUM dikonfirmasi langsung sesi ini (pola akar penyebab yang sama, tidak
dipicu ulang karena di luar scope pengujian saat ini): catch block terluar
`retryOrderFulfillment` (`fulfillment.ts` baris ~236-246) menulis `Retry gagal: ${e.message}` ke
`orderStatusHistory.note` dengan pola identik — berpotensi kena masalah `VARCHAR(191)` yang sama
kalau errornya berasal dari Prisma, meski di path itu tidak ada `sendTelegramAlert` yang ikut
gagal (dampaknya "hanya" audit note hilang + kemungkinan server action melempar 500 tak tertangani
alih-alih mengembalikan `{ok:false, error}` dengan rapi ke UI).

**5. Guest order → REFUND_PENDING → "Tandai Sudah Direfund": PASS**

Order guest dikonstruksi PAID (QRIS sintetis), `dispatchFulfillment()` ASLI dipanggil → Digiflazz
asli ditolak IP-whitelist (limitasi environment, sama seperti di atas) → guest (userId null) →
`REFUND_PENDING`, note `OrderStatusHistory` tercatat lengkap ("IP Anda tidak kami kenali:
103.18.34.236" — pesan pendek, TIDAK kena bug VARCHAR(191) di atas, mengonfirmasi bug itu memang
spesifik ke path auto-refund-wallet, bukan masalah umum). Di halaman detail, isi catatan referensi
transfer → klik "Tandai Sudah Direfund" → dialog confirm → `markRefundedAction` (kode produksi
asli) sukses: order `REFUNDED`, note tercatat "Direfund manual oleh admin: ...". Diverifikasi
`AdminActionLog` punya baris baru `action="order.mark_refunded"` dengan `detail.note` sesuai isian.

**6. Halaman `/admin/orders` — filter tab + pencarian: PASS**

Tab "Semua" menampilkan semua order uji. Tab "Butuh Perhatian" (`needs_review`) benar-benar hanya
menampilkan order berstatus `NEEDS_REVIEW` (kosong saat tidak ada, muncul tepat 1 saat ada). Tab
"Refund Pending" sama (kosong setelah order guest di atas ditandai REFUNDED). Pencarian by nomor
order (substring "3584") → tepat 1 hasil. Pencarian by email penuh
(`guest-test-case5@dannshop-test.local`) → tepat 1 hasil.

**7. "Tandai Selesai Manual" pada order NEEDS_REVIEW: PASS**

Order NEEDS_REVIEW baru (kasus no-provider, sama seperti sub-langkah 1) dibuat, isi field SN, klik
"Tandai Selesai Manual" → dialog confirm → `markCompletedManualAction` (kode produksi asli) sukses:
order `COMPLETED`, `OrderStatusHistory` note "Ditandai selesai manual oleh admin. SN: ...".
Diverifikasi via query DB langsung: `completedAt` terisi timestamp yang benar (bukan null).
`AdminActionLog` punya baris baru `action="order.mark_completed_manual"` dengan `detail.sn` sesuai.

### Step 6: Laporan ini (bagian Ronde 2) — force-add + commit di Step 8.

### Step 7: Cleanup — SELESAI, diverifikasi

Dev server dihentikan (port 3000 dikonfirmasi bebas listener via `netstat`). Semua data uji
dihapus via script Prisma langsung (dijalankan lalu dihapus, tidak dikomit — `web/.scratch/*`,
sudah dibersihkan dari working tree):
- 5 `Order` uji (+ `OrderStatusHistory` cascade 22 baris, `OrderFulfillment` 3 baris,
  `OrderPayment` 5 baris) dihapus.
- 3 `Job` (`recheck-fulfillment`) sisa dari dispatch dihapus.
- 4 `AdminActionLog` uji dihapus (`order.retry_fulfillment`, `order.retry_refund`,
  `order.mark_refunded`, `order.mark_completed_manual`).
- 4 `WalletLedger` + 1 `Wallet` + 1 `User` (member-a@dannshop-test.local) dihapus total (akun ini
  dibuat khusus utk sesi Task 8, tidak ada sebelumnya).
- 1 `User` placeholder park-wallet (`wallet-park-temp@dannshop-test.local`) dihapus.
- `ProviderSku` fixture `TEST-ML86` dihapus total (tidak ada sebelum Task 8).
- `Product.mobile-legends.isActive` dikembalikan ke `false` (state semula).
- `.playwright-mcp/` (artefak snapshot/log otomatis dari tool browser) dan `web/.scratch/`
  (script Prisma sementara) dihapus dari working tree.

Diverifikasi ulang via query yang sama persis dengan query awal sesi (`query1.ts`): output SAMA
PERSIS dengan baseline sebelum Task 8 dimulai (1 user admin dengan wallet 0, kedua produk contoh
`isActive:false` tanpa `ProviderSku`, `ORDER_COUNT: 0`). `mysqld` (Laragon) sengaja TIDAK dihentikan
(di luar scope instruksi cleanup — hanya port 3000/dev server yang diminta dihentikan; MySQL adalah
layanan dev environment persisten, bukan artefak sesi ini).

### Ringkasan sintesis (transparansi penuh)

- Fixture awal: aktivasi produk/item + `ProviderSku` baru (disintesis, dihapus total setelah).
- Registrasi member A: 100% kode produksi asli (`registerAction`), hanya SALDO AWAL di-set
  langsung via DB (bukan exercise deposit Midtrans — di luar scope Task 8, sudah diverifikasi
  penuh di Fase 4 Task 11).
- Order QRIS (member A order ke-2, guest order): `Order`+`OrderPayment` dikonstruksi langsung
  sbg `PAID` (bypass `chargeQris` — kredensial Midtrans sandbox asli tidak tersedia, gap sama
  seperti Fase 3/4, non-blocking, terdokumentasi). Setelah itu, 100% kode produksi asli
  (`dispatchFulfillment`, `applyFulfillmentResult`, adapter Digiflazz ASLI dengan panggilan
  jaringan sungguhan, `sendTelegramAlert` ASLI, semua server action admin ASLI via klik UI
  Playwright).
- Wallet "parkir sementara" (kasus NEEDS_REVIEW (b)): teknik minim-invasif utk mensimulasikan
  `Wallet.userId` tidak ditemukan tanpa merusak FK/ledger — didokumentasikan detail di atas.
- Panggilan Digiflazz: 100% ASLI (network call sungguhan ke `api.digiflazz.com`), ditolak
  IP-whitelist konsisten dengan Fase 2/3/4 — limitasi environment, bukan sintesis.
- Panggilan Telegram: 100% ASLI (network call sungguhan ke `api.telegram.org`), dikonfirmasi
  `getMe` → `ok:true` (bot `dannshop_bot`), tidak ada mocking.

### Kesimpulan & rekomendasi Ronde 2

Fix RSC boundary Ronde 1 (commit `0952ef4`) **terverifikasi benar dan lengkap** — automated check
100% hijau, dan seluruh alur admin actions (4 tombol) bekerja end-to-end dengan kode produksi asli.

**Bug baru ditemukan (blocking utk kepercayaan penuh pada notifikasi Fase 7a, TIDAK blocking utk
korektnes uang):** `web/src/lib/order/fulfillment.ts`, dalam catch block auto-refund gagal di
`applyFulfillmentResult` (~baris 144-153) — `orderStatusHistory.create({note: `Auto-refund gagal:
${e.message}`})` bisa melebihi `VARCHAR(191)` untuk error Prisma apa pun (bentuk NORMAL pesan
Prisma, bukan tepi kasus), menyebabkan exception yang melompati `sendTelegramAlert(...)` di baris
setelahnya — notifikasi Telegram utk skenario ini (auto-refund crash) silently hilang, plus audit
note di `OrderStatusHistory` juga hilang. Saran perbaikan (tidak dieksekusi di Task 8 —
verifikasi-only): potong panjang `note` sebelum ditulis (mis. `.slice(0, 180)`), DAN pindahkan
`sendTelegramAlert` agar tidak bisa "ter-skip" oleh kegagalan `orderStatusHistory.create` (mis.
panggil Telegram dulu sebelum menulis note, atau bungkus keduanya masing-masing di try/catch
independen supaya kegagalan satu tidak menghalangi yang lain) — pola serupa sebaiknya dicek juga
di catch block `retryOrderFulfillment` (~baris 236-246) yang punya bentuk sama persis.

Semua invariant UANG (ledger double-entry, idempotency key, no double-credit) **tetap 100% benar**
di semua skenario yang diuji, termasuk skenario yang memicu bug notifikasi di atas — bug ini murni
di lapisan observability/notifikasi, bukan lapisan transaksi finansial.
