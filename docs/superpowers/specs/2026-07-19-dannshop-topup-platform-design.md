# DannShop Topup Platform — Design Doc

Tanggal: 2026-07-19
Status: Disetujui Wildan (2026-07-24) — Fase 1 selesai; lihat Addendum §15
Bahasa: Indonesia (sesuai preferensi pemilik project)

## 1. Ringkasan Keputusan

Platform topup game & PPOB single-brand ala Codashop/UniPin, dibangun **full Next.js (TypeScript)** sebagai rewrite dari project Laravel DannShop sebelumnya. Project Laravel **tidak dihapus** — jadi referensi arsitektur (order flow, ledger, webhook handling).

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Model bisnis | Single brand (bukan multi-seller) | Launching cepat, fokus ke katalog + provider |
| Stack | Next.js App Router + TypeScript, fullstack | Satu bahasa, keputusan Wildan |
| Model user | Guest checkout + member dengan saldo deposit | Sweet spot pasar Indonesia |
| Provider produk | Digiflazz, OkeConnect H2H, QiosPay H2H, Serpul — semua, dengan routing harga termurah | Mode agregator; dikerjakan bertahap (Digiflazz dulu end-to-end) |
| Payment gateway | Midtrans (Core API) dulu; Xendit/Duitku menyusul lewat abstraction yang sama | Akun sudah ada, integrasi lama sudah terverifikasi |
| Database | MySQL (managed Hostinger) + Prisma | Hostinger tidak sedia PostgreSQL |
| Hosting | Hostinger Business Web App | Sudah dibeli; support Next.js, cron, ~3GB RAM |
| Background jobs | Job queue berbasis MySQL + cron scheduling | Tidak ada managed Redis di Hostinger; skala MVP cukup |
| Realtime status | Polling (TanStack Query, interval ±3 detik) | Cukup untuk UX Codashop-like; upgrade ke WebSocket opsional |
| Satuan uang | `BIGINT` rupiah utuh, tanpa float/decimal | Konsisten dengan project Laravel |

## 2. Arsitektur Big Picture

```
┌─────────────────────────────────────────────────────┐
│  Next.js (App Router, TypeScript) — di Hostinger    │
│                                                     │
│  Frontend (RSC/SSR)        Backend (Route Handlers) │
│  - Katalog (SEO/SSR)       - Order flow + status    │
│  - Detail produk + cek nick- Wallet ledger (deposit)│
│  - Checkout                - Webhook Midtrans       │
│  - Member area             - Callback 4 provider    │
│  - Admin panel             - Provider adapters      │
│                            - Routing engine (harga) │
│  Cron: sync harga, retry pending, expire order      │
└──────────┬──────────────────┬───────────────────────┘
           │                  │
     MySQL (Hostinger)   Midtrans (uang masuk)
                         Digiflazz/OkeConnect/QiosPay/Serpul (produk keluar)
```

Prinsip inti (diwarisi dari arsitektur Laravel):

1. **Alur uang dan alur barang terpisah tegas.** Midtrans menerima uang; provider H2H mengirim produk. Keduanya bertemu hanya di order flow.
2. **Provider adapter pattern.** Setiap provider = satu modul yang mengimplementasi interface yang sama. Menambah provider = menambah satu adapter, bukan mengubah order flow.
3. **Ledger double-entry untuk saldo member.** Kolom `balance` hanya cache; kebenaran ada di ledger. Tidak pernah update saldo langsung.
4. **Semua status change tercatat** di status history (audit trail).

## 3. Stack Teknis

- **Next.js 15+ App Router**, TypeScript strict
- **Prisma** ORM → MySQL
- **TanStack Query** untuk data fetching + polling status transaksi
- **Tailwind CSS + shadcn/ui** untuk UI
- **Auth**: Auth.js (NextAuth v5) — credentials + Google OAuth (fase 2); session JWT
- **Validasi**: Zod di semua boundary (form, route handler, callback provider)
- **Job queue**: tabel `jobs` di MySQL + endpoint cron (Hostinger cron memanggil `/api/cron/tick` tiap menit, dilindungi secret header)

## 4. Skema Database

### Blok 1 — Katalog

- `categories` — Games, Pulsa & Data, E-Money, PLN, Voucher
- `products` — 1 row per game/layanan. Kolom penting: `slug`, `name`, `banner`, `publisher`, `is_active`, `input_fields` (JSON — definisi field yang diisi buyer, contoh ML: `[{name:"user_id"},{name:"zone_id"}]`), `nickname_check_key` (nullable — kunci metode validasi ID)
- `product_items` — 1 row per denominasi. `product_id`, `name` (86 Diamonds), `selling_price`, `member_price`, `is_active`, `sort_order`
- `provider_skus` — **jantung routing**: `product_item_id`, `provider` (enum: digiflazz|okeconnect|qiospay|serpul), `provider_sku_code`, `cost_price` (di-sync berkala), `provider_status` (active|unavailable), `last_synced_at`. Satu item boleh punya ≤4 row (satu per provider).

Margin = `selling_price − cost_price` provider terpilih; tampil real-time di admin.

### Blok 2 — Order & Fulfillment

- `orders` — `order_number` publik (INV-YYYYMMDD-XXXX), `status` (enum, lihat §7), `product_item_id` + snapshot nama & harga, `target` (JSON: ID game / no HP), `buyer_email`, `buyer_phone`, `user_id` (nullable — guest), `paid_via` (midtrans|balance), `total`
- `order_payments` — 1:1 Midtrans: `method` (qris|gopay|va|...), `payment_ref` (transaction_id Midtrans), `status`, `qr_string/actions` (JSON), `raw_response` (JSON), `expired_at`
- `order_fulfillments` — percobaan kirim ke provider, **bisa >1 row per order** (attempt #1 Digiflazz gagal → attempt #2 OkeConnect). Kolom: `attempt_no`, `provider`, `provider_sku_code`, `cost_price` snapshot, `our_ref_id` (unik, dikirim ke provider), `provider_ref`, `status` (sent|processing|success|failed), `sn` (serial number/token hasil), `raw_callback` (JSON)
- `order_status_history` — audit trail perubahan status order

### Blok 3 — User & Wallet

- `users` — email, password hash, `role` (user|admin), verified_at
- `wallets` — 1:1 user, `balance` BIGINT (cache dari ledger)
- `wallet_ledger` — double-entry: `type` (deposit|order_payment|refund|adjustment), `amount` (+/−), `balance_after`, `reference_type` + `reference_id`, idempotency key
- `deposits` — request topup saldo via Midtrans: `amount`, `payment_ref`, `status`, `raw_response`

### Blok 4 — Operasional

- `providers` — konfigurasi 4 provider: `key`, `display_name`, `credentials` (JSON, encrypted at rest), `is_active`, `priority` (tie-breaker routing), `balance` (saldo kita di provider, di-sync), `health_status`, `last_health_check_at`
- `provider_balance_logs` — riwayat saldo provider (untuk alert saldo menipis)
- `price_sync_logs` — riwayat sync harga (kapan, provider mana, berapa SKU berubah/hilang)
- `jobs` — queue MySQL: `type`, `payload` (JSON), `run_at`, `attempts`, `max_attempts`, `status`, `last_error`
- `admin_action_logs` — jejak aksi admin
- `webhook_events` — SEMUA callback masuk (Midtrans + 4 provider) disimpan mentah dulu sebelum diproses: `source`, `raw_body`, `headers`, `processed_at`, `process_result`. Untuk debugging & idempotency.

## 5. Integrasi Provider H2H

### 5.1 Interface Adapter (kontrak seragam)

```ts
interface TopupProviderAdapter {
  key: 'digiflazz' | 'okeconnect' | 'qiospay' | 'serpul';
  fetchPriceList(): Promise<ProviderSkuPrice[]>;   // untuk sync harga
  fetchBalance(): Promise<bigint>;                  // saldo kita di provider
  createTransaction(input: { skuCode: string; target: string; refId: string }): Promise<ProviderTrxResult>;
  checkStatus(refId: string): Promise<ProviderTrxResult>;
  parseCallback(req: { query: Record<string,string>; body: unknown; headers: Record<string,string> }): CallbackResult | null;
  // CallbackResult: { refId, status: 'success'|'failed'|'processing', sn?, message, verified: boolean }
}
```

`our_ref_id` selalu dibuat oleh kita (unik per fulfillment attempt) — kunci idempotency dan pencocokan callback.

### 5.2 Digiflazz (TERVERIFIKASI dari dokumentasi resmi — developer.digiflazz.com)

- Base URL: `https://api.digiflazz.com/v1`
- **Price list**: `POST /price-list` body `{cmd:"prepaid", username, sign: md5(username + apiKey + "pricelist")}` → array `{buyer_sku_code, product_name, category, brand, price, buyer_product_status, seller_product_status, stock, ...}`
- **Cek saldo**: `POST /cek-saldo` body `{cmd:"deposit", username, sign: md5(username + apiKey + "depo")}`
- **Transaksi**: `POST /transaction` body `{username, buyer_sku_code, customer_no, ref_id, sign: md5(username + apiKey + ref_id)}` → `{data: {ref_id, status: "Pending"|"Sukses"|"Gagal", message, rc, sn, price, buyer_last_saldo}}`
- **Cek status = kirim ulang request transaksi yang sama persis** (ref_id sama). Digiflazz idempotent by ref_id — tidak akan dobel kirim. Ini dipakai cron re-check.
- **Webhook**: `POST` ke URL yang diset di dashboard. Header `X-Hub-Signature: sha1=<hmac>` = `HMAC-SHA1(raw_body, webhook_secret)`. User-Agent `Digiflazz-Hookshot`. Body `{data: {ref_id, customer_no, buyer_sku_code, status, message, sn, rc, ...}}`. **Wajib verifikasi signature sebelum proses.**
- `rc` penting: `00` sukses, `03` pending; selain itu variasi gagal (saldo kurang, SKU tidak tersedia, nomor salah, dst).
- Perhatikan `customer_no` format tujuan per kategori (game: kadang `userid` + `zoneid` digabung, mis. `123456789` + `1234` → `1234567891234` — cek per SKU).

### 5.3 Serpul (dari dokumentasi publik serpul.co.id/dokumentasi-h2h)

- Transaksi prabayar: `GET {base}/without-sign/trx?product=...&qty=1&dest=...&refID=...&memberID=...&pin=...&password=...`
- Data produk/harga: endpoint terpisah dengan `Authorization: Bearer <token>`
- Pascabayar: inquiry = kode produk prefix `C` (mis. `CPLN`), bayar = prefix `B` (`BPLN`)
- **Callback via GET** ke URL kita; parameter fleksibel (refid, price, message) — adapter harus parsing longgar + cocokkan `refID`
- **IP whitelist wajib** — IP server Hostinger harus didaftarkan di member area Serpul
- ⚠️ URL di dokumentasi adalah URL **demo** (`demo-h2h.serpul.co.id`); URL production diambil dari member area setelah punya akun

### 5.4 OkeConnect H2H & QiosPay H2H (PERLU KONFIRMASI dari member area)

Dokumentasi publik keduanya tipis; detail lengkap ada di dashboard member masing-masing. Pola keduanya keluarga OrderKuota:

- Transaksi: `GET` dengan parameter `product/produk`, `dest/tujuan`, `refID`, `memberID`, `pin`, `password`
- Callback/report: `GET` ke URL yang diset di pengaturan API H2H member area
- Kemungkinan besar juga IP whitelist

**Aksi Wildan sebelum implementasi adapter ini**: login member area OkeConnect & QiosPay → ambil dokumentasi endpoint persis (URL, nama parameter, format price list, format callback, cara cek status) → tempel ke `docs/providers/okeconnect.md` dan `docs/providers/qiospay.md`. Adapter tetap dibangun terhadap interface §5.1 sehingga hanya isi modulnya yang menunggu data ini.

### 5.5 Routing Engine (harga termurah)

Saat order dibayar:

1. Ambil semua `provider_skus` untuk item tsb dengan `provider_status = active`
2. Filter: provider `is_active`, `health_status` sehat, saldo provider ≥ `cost_price`
3. Urutkan: `cost_price` ASC, tie-breaker `providers.priority`
4. Attempt #1 = termurah. Gagal → attempt #2 provider berikutnya, dst.
5. Guard rail: jika `cost_price` terpilih > `selling_price` order (harga naik setelah checkout) → status `needs_review`, JANGAN auto-kirim rugi.

Sync harga per provider via cron (default tiap 3 jam, bisa diubah): update `cost_price`, tandai SKU hilang sebagai `provider_unavailable`, log ke `price_sync_logs`.

## 6. Payment (Midtrans Core API)

- **Charge QRIS**: `POST {base}/v2/charge` `{payment_type:"qris", transaction_details:{order_id, gross_amount}, ...}` — auth Basic `base64(ServerKey + ":")`. Sandbox: `api.sandbox.midtrans.com`, production: `api.midtrans.com`.
- E-wallet (GoPay/ShopeePay via Midtrans) & VA menyusul lewat `payment_type` berbeda — satu abstraction.
- **Notification webhook**: `POST /api/webhooks/midtrans`. Verifikasi `signature_key = sha512(order_id + status_code + gross_amount + ServerKey)`. Status mapping: `settlement/capture` → paid; `pending` → menunggu; `expire/cancel/deny` → gagal.
- **Idempotency**: simpan ke `webhook_events` dulu; kalau `payment_ref` + status sama sudah diproses, skip.
- **Best practice Midtrans**: setelah terima notifikasi, GET status ke Midtrans (`/v2/{order_id}/status`) sebagai konfirmasi — jangan percaya body notifikasi mentah saja.
- Bayar pakai **saldo member**: tanpa Midtrans — transaksi ledger atomik (potong saldo + tulis ledger + ubah status order `paid` dalam satu DB transaction).

## 7. Order Flow & Status

Status order: `pending_payment → paid → processing → completed` dengan cabang `expired`, `failed`, `refunded`, `needs_review`.

```
[Pilih item] → [Isi ID/No HP] → [Cek nickname (jika tersedia)] → [Pilih metode bayar]
     ↓
pending_payment ──(webhook Midtrans settlement / potong saldo)──→ paid
     ↓ (routing engine, otomatis)
processing (fulfillment attempt #n ke provider)
     ├─ callback sukses → completed (simpan SN, kirim email/tampilkan)
     ├─ callback gagal → attempt provider berikutnya
     ├─ tidak ada callback → cron checkStatus tiap menit (max 30 menit → eskalasi)
     └─ semua provider gagal:
          ├─ member  → refunded (otomatis ke saldo via ledger)
          └─ guest   → refund_pending (queue manual admin: transfer/e-wallet)
```

Edge cases yang WAJIB dihandle sejak fase 1:

1. **Webhook dobel** — idempotency via `webhook_events` + unique constraint pada (source, ref, status)
2. **Callback datang sebelum response transaksi selesai disimpan** — simpan fulfillment row SEBELUM memanggil provider; callback matching by `our_ref_id`
3. **Harga modal berubah** — snapshot `cost_price` saat checkout; guard rail `needs_review` (§5.5)
4. **Order expired** — cron expire `pending_payment` melewati `expired_at`
5. **Saldo provider habis** — health check cron + skip di routing + alert (email/Telegram) ke admin
6. **Pembayaran nyasar** (dibayar setelah expired) — masuk `webhook_events` tak-terproses → laporan admin (padanan `unmatched_payments` Laravel)

## 8. Cek Nickname

- Route handler `GET /api/nickname-check?product=...&target=...` → proxy ke sumber validasi, cache hasil singkat (menit-level)
- Sumber per game dikonfigurasi via `products.nickname_check_key`. Kenyataan pasar: tidak ada satu API resmi untuk semua game — sebagian tersedia via layanan pihak ketiga; game tanpa sumber valid → tombol cek disembunyikan, user tetap bisa lanjut (seperti perilaku Codashop di beberapa game)
- Fase 1: implementasi kerangka + 2–3 game populer (Mobile Legends, Free Fire); tambah bertahap

## 9. Frontend (halaman minimum launching)

Publik (SSR, SEO-optimized — sumber traffic utama):
1. **Home** — hero + grid game per kategori + pencarian
2. **Detail produk** `/[category]/[slug]` — pilih denominasi, isi ID, cek nickname, pilih pembayaran, checkout (guest atau login)
3. **Invoice/status** `/invoice/[orderNumber]` — QRIS + countdown, lalu status live (polling 3 dtk), SN saat sukses
4. **Cek pesanan** — lookup by order number + email/HP

Member:
5. Login/Register, dashboard (saldo, tombol deposit, riwayat transaksi, riwayat deposit)

Admin (`/admin`, role-gated):
6. Orders (filter status, detail attempt per provider, aksi manual: retry/refund/tandai selesai)
7. Produk & harga (CRUD + mapping provider_skus + margin viewer)
8. Providers (kredensial, saldo, health, hasil sync terakhir)
9. Refund queue (guest manual refunds)
10. Laporan ringkas (omzet, margin, transaksi harian)

## 10. Background Jobs (MySQL queue + cron)

Hostinger cron → `POST /api/cron/tick` (header `X-Cron-Secret`) tiap menit. Tick memproses tabel `jobs` yang `run_at <= now`:

- `recheck-fulfillment` — checkStatus transaksi `processing` tanpa callback (retry backoff, max 30 menit lalu eskalasi ke admin)
- `expire-orders` — expire `pending_payment` lewat waktu
- `sync-prices:{provider}` — tiap 3 jam
- `check-provider-balance` — tiap 15 menit + alert ambang batas
- `send-notification` — email invoice/sukses (Resend/SMTP)

Semua job idempotent (aman dijalankan dobel).

## 11. Keamanan

- Kredensial provider & Midtrans di env + kolom `credentials` terenkripsi (AES-256-GCM, key di env) — tidak pernah dikirim ke client
- Verifikasi signature SEMUA webhook/callback yang punya mekanismenya (Midtrans sha512, Digiflazz HMAC-SHA1); provider callback GET tanpa signature (Serpul/OkeConnect/QiosPay) → verifikasi via kecocokan `our_ref_id` + status recheck langsung ke provider sebelum menandai `completed`
- Rate limit endpoint publik (checkout, nickname-check, order-lookup)
- Admin: role check di middleware + semua aksi tercatat `admin_action_logs`
- Jangan log kredensial/PIN; `raw_callback` disimpan setelah redaksi field sensitif

## 12. Tahapan Implementasi

| Fase | Isi | Definisi selesai |
|---|---|---|
| 1. Fondasi | Next.js + Prisma + skema DB + auth + layout UI | Migrasi jalan, login admin bisa |
| 2. Katalog + Digiflazz | CRUD produk, sync harga Digiflazz, adapter Digiflazz penuh | Price list Digiflazz masuk DB, transaksi manual dari admin sukses |
| 3. Order flow + Midtrans | Checkout guest, QRIS, webhook, fulfillment otomatis, invoice + polling | Beli 86 Diamonds end-to-end di sandbox: bayar → diamond terkirim → SN tampil |
| 4. Member + deposit | Register/login user, wallet ledger, deposit via Midtrans, bayar pakai saldo, refund otomatis | Deposit → beli pakai saldo → refund saat provider digagalkan |
| 5. Provider 2–4 | Adapter Serpul → OkeConnect → QiosPay (menunggu dokumen member area) | Transaksi sukses per provider |
| 6. Routing harga | Engine termurah + fallback + guard rail | Order otomatis pilih termurah; fallback terbukti saat provider dimatikan |
| 7. Admin lengkap + ops | Refund queue, laporan, alert saldo, hardening, deploy Hostinger | Live di domain production |

Tiap fase = branch sendiri + testing sebelum lanjut (TDD untuk logic uang: ledger, routing, webhook processing).

## 13. Yang Harus Diverifikasi Wildan (bukan blocker desain)

1. Hostinger: proses Node persistent atau ada idle timeout? (menentukan WebSocket vs polling — desain default polling, jadi aman apapun hasilnya)
2. Ambil dokumentasi lengkap OkeConnect & QiosPay dari member area (→ `docs/providers/`)
3. URL production + kredensial Serpul dari member area, daftarkan IP Hostinger di whitelist ketiga provider GET-based
4. Aktifkan webhook URL di dashboard Digiflazz & Midtrans setelah deploy pertama
5. Konfirmasi margin/harga jual per item sebelum go-live (di Laravel dulu: rate 5% masih placeholder)

## 14. Referensi

- Project Laravel lama (repo ini) — blueprint arsitektur: `app/Domain/*`, `routes/api.php`
- [Digiflazz Technical Docs](https://developer.digiflazz.com/api/) — transaction, price-list, webhook
- [Serpul Dokumentasi H2H](https://serpul.co.id/dokumentasi-h2h)
- [Midtrans Core API](https://docs.midtrans.com/reference/core-api-overview) — charge QRIS, notification signature
- [Hostinger Web App Hosting](https://www.hostinger.com/id/web-app-hosting)

## 15. Addendum 2026-07-24 (keputusan review Wildan)

Roadmap Fase 2–7 di-review ulang bersama Wildan dan disetujui dengan keputusan berikut:

1. **Provider tetap 4** sesuai §1: Digiflazz → Serpul → OkeConnect → QiosPay, dikerjakan bertahap (Digiflazz end-to-end dulu).
2. **UI/UX: dark + light mode** dalam satu design system (tema via design tokens + toggle, default mengikuti preferensi OS). Referensi rasa: Codashop (terang/playful) dan UniPin (gelap/gaming) — DannShop mengambil keduanya lewat dua tema, bukan memilih salah satu. Design system disusun di awal Fase 3 (sebelum halaman publik dibangun) menggunakan skill `ui-ux-pro-max` + `frontend-design`, dan konsepnya dipresentasikan ke Wildan sebelum diterapkan.
3. **Urutan fase mengikuti §12** (katalog dulu, UI publik di Fase 3) — halaman publik langsung memakai data produk asli, bukan dummy.
4. **Workflow eksekusi per fase**: `writing-plans` (plan di-approve Wildan) → `subagent-driven-development` (implementer + reviewer per task) → final whole-branch review → PR → merge oleh Wildan. TDD wajib untuk semua logic uang/eksternal (adapter provider, webhook, ledger, routing).
5. **Pelajaran audit wallet Laravel (2026-07-24) diterapkan**: (a) unique constraint idempotency webhook harus per-event (source, ref, status/event_type), bukan per-referensi saja — bug bentrok `payment_created` vs `webhook_received` di Laravel tidak boleh terulang; (b) setiap transisi status yang melepas/mendebit dana harus lock + re-check status di dalam transaksi (hindari double-release ala WithdrawalService); (c) `reference_type` ledger harus konsisten dengan isi `reference_id`.
