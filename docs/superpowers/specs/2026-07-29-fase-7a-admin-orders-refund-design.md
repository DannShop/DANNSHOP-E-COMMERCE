# Fase 7a: Admin Orders + Refund Queue + Notifikasi Telegram — Spec Desain

Status: disetujui Wildan 2026-07-29, siap masuk `superpowers:writing-plans`.

## 0. Konteks: Fase 7 dipecah jadi sub-fase

Spec utama (`docs/superpowers/specs/2026-07-19-dannshop-topup-platform-design.md` §12) mendefinisikan Fase 7 sebagai satu baris: "Admin lengkap + ops — refund queue, laporan, alert saldo, hardening, deploy Hostinger." Ini sebenarnya 4 subsistem berkarakter beda yang kalau dipaksa jadi satu spec besar sulit direview. Wildan memutuskan (2026-07-29) untuk memecahnya jadi sub-fase yang di-approve satu-satu:

- **7a (spec ini)** — Admin Orders + Refund Queue + notifikasi Telegram. Prioritas pertama karena order `NEEDS_REVIEW` (diperkenalkan Fase 3) dan `REFUND_PENDING` (Fase 3, dipakai lagi Fase 4) saat ini **sama sekali tidak terlihat di admin** — tidak ada halaman, tidak ada notifikasi, tidak ada jalur penyelesaian.
- **7b** (belum di-spec) — Background job `check-provider-balance` (alert saldo provider rendah) + `send-notification` (email invoice/sukses ke pembeli). Akan reuse infra Telegram dari 7a.
- **7c** (belum di-spec) — Hardening keamanan: kumpulan temuan yang diparkir sejak Fase 3-4 (IDOR `orderNumber` bisa dienumerasi + expose `sn` tanpa auth, `CRON_SECRET` compare pakai `!==` bukan `timingSafeEqual`, rate limit endpoint publik, QR string dikirim ke `api.qrserver.com`, dll — daftar lengkap di `PROGRESS.md` bagian "Status Fase 3/4").
- **7d** (belum di-spec) — Laporan ringkas (omzet, margin, transaksi harian).

Deploy Hostinger (item terakhir Fase 7 di spec utama) adalah kerja infra/ops manual oleh Wildan, bukan sub-fase coding — dibahas terpisah saat semua sub-fase di atas selesai.

## 1. Tujuan & Definisi Selesai

**Tujuan:** admin (Wildan) bisa melihat, mencari, dan menyelesaikan order yang butuh perhatian manual (`NEEDS_REVIEW`, `REFUND_PENDING`) tanpa harus memantau dashboard terus-menerus — dapat notifikasi proaktif via Telegram begitu ada order yang butuh aksi.

**Definisi selesai:** order yang jatuh ke `NEEDS_REVIEW` atau `REFUND_PENDING` memicu pesan Telegram ke admin dalam hitungan detik; admin bisa klik link di pesan itu, masuk ke halaman detail order, dan menyelesaikannya lewat salah satu dari 4 aksi yang tersedia — semuanya tercatat di `AdminActionLog` dan `OrderStatusHistory`.

## 2. Scope

### Masuk

1. **`/admin/orders`** — tabel order dengan:
   - Tab filter: **Semua** / **Butuh Perhatian** (`NEEDS_REVIEW`) / **Refund Pending** (`REFUND_PENDING`)
   - Pencarian: `orderNumber`, `buyerEmail`, `buyerPhone`
   - Pagination (tabel order akan terus tumbuh)
2. **`/admin/orders/[orderNumber]`** — halaman detail:
   - Info order (produk, item, target, total, `paidVia`, status)
   - Riwayat status lengkap (`OrderStatusHistory`, urut waktu)
   - Semua percobaan fulfillment (`OrderFulfillment`, provider, SKU, SN/pesan per attempt)
   - Tombol aksi kontekstual (lihat §3)
3. **Notifikasi Telegram** (§4) — trigger otomatis saat order masuk `NEEDS_REVIEW` atau `REFUND_PENDING`.
4. Semua aksi admin tercatat ke `AdminActionLog` (model sudah ada sejak Fase 1) + baris baru `OrderStatusHistory`.

### Sengaja di luar scope 7a

- Halaman admin untuk `Deposit` (tidak ada status macet yang butuh aksi admin saat ini; kalau nanti perlu, masuk 7d Laporan)
- Refund otomatis via Midtrans refund API — **diputuskan manual** (admin transfer di luar sistem, klik "Tandai Sudah Direfund" di dashboard)
- WhatsApp — **diputuskan Telegram** (setup instan via @BotFather, gratis, tanpa verifikasi bisnis)
- `check-provider-balance`, `send-notification` job (→ 7b, reuse `sendTelegramAlert` dari sini)
- Laporan omzet/margin (→ 7d)
- Hardening keamanan (→ 7c) — termasuk IDOR `orderNumber` yang sudah diketahui sejak final review Fase 4

## 3. Aksi Admin

`NEEDS_REVIEW` punya **dua penyebab berbeda** (ditemukan saat riset spec ini, lihat `web/src/lib/order/fulfillment.ts`):

- **(a) Tidak ada provider SKU tersedia** — `selectFulfillmentSku` gagal saat order baru `PAID→PROCESSING`. Tidak ada baris `OrderFulfillment` sama sekali.
- **(b) Transaksi kredit-saldo gagal** — auto-refund-ke-wallet (member) crash di `db.$transaction` (DB error, bukan bug). Order sudah pasti `FAILED` di fulfillment, `userId` ada.

Satu tombol generik tidak cukup untuk keduanya. Empat tombol, muncul kontekstual:

| Tombol | Kapan muncul | Efek |
|---|---|---|
| **Coba Kirim Ulang** | `NEEDS_REVIEW` kasus (a) — belum ada `OrderFulfillment` sukses | Fungsi baru yang mengulang alur `selectFulfillmentSku` → kirim ke provider, dipicu dari status `NEEDS_REVIEW` (bukan `PAID` seperti alur otomatis) |
| **Coba Refund Ulang** | `NEEDS_REVIEW` kasus (b) — `userId` ada, ada `OrderFulfillment` `FAILED` | Ulangi transaksi kredit saldo + ledger. Aman diulang — `idempotencyKey` (`order-refund:${id}`) unique, kalau sudah pernah sukses otomatis no-op |
| **Tandai Selesai Manual** | `NEEDS_REVIEW` atau `PROCESSING` macet lama | Admin input SN/kode voucher sendiri (sudah diproses manual di luar sistem) → order `COMPLETED` |
| **Tandai Sudah Direfund** | `REFUND_PENDING` (selalu guest, `userId` kosong) | Admin isi catatan (nomor referensi transfer) → order `REFUNDED` |

Setiap aksi: perlu konfirmasi (bukan sekali klik langsung eksekusi), klaim atomik di DB (guard status, aman kalau 2 admin klik nyaris bersamaan), dicatat ke `AdminActionLog` + `OrderStatusHistory`.

## 4. Notifikasi Telegram

- Modul baru `web/src/lib/notify/telegram.ts` — `sendTelegramAlert(message: string): Promise<void>`, panggil Telegram Bot API `sendMessage` via `fetch` dengan `AbortSignal.timeout`, pola sama seperti client Midtrans/Digiflazz yang sudah ada.
- **Tidak pernah melempar error ke pemanggil** — dibungkus try/catch internal, gagal kirim Telegram (bot down/network) tidak boleh mengganggu jalur uang di `fulfillment.ts`. "Best effort" murni.
- Titik panggil: `web/src/lib/order/fulfillment.ts`, tepat setelah baris `OrderStatusHistory` ditulis untuk transisi ke `NEEDS_REVIEW` (2 tempat: kasus a & b) dan `REFUND_PENDING` (1 tempat).
- Isi pesan: nomor order, status baru, alasan singkat (`note` dari `OrderStatusHistory`), link `https://<domain>/admin/orders/[orderNumber]`.
- Config baru (env var, bukan DB — tidak perlu enkripsi seperti kredensial provider karena cuma 1 bot admin, bukan per-user): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`. Ditambahkan ke `.env.example`.
- Dirancang general (nama fungsi generik, bukan `sendOrderAlert`) supaya langsung reusable di 7b untuk alert saldo provider rendah — tanpa perlu dibangun ulang.

## 5. Data Model

**Tidak ada migrasi Prisma.** Semua yang dibutuhkan sudah ada:
- `OrderStatus` enum sudah punya `NEEDS_REVIEW`/`REFUND_PENDING`/`REFUNDED`/`COMPLETED`.
- `OrderStatusHistory.note` (`String?`) cukup untuk catatan transfer manual — tidak perlu kolom baru.
- `AdminActionLog` (`adminId`, `action`, `targetType`, `targetId`, `detail` Json) sudah ada sejak Fase 1, dipakai konsisten sejak Fase 2 (`catalog.ts`, `providers.ts`) — dipakai ulang di sini untuk keempat aksi baru.

## 6. Error Handling & Idempotensi

- "Coba Refund Ulang": aman diulang berkali-kali — constraint unique `WalletLedger.idempotencyKey` mencegah kredit dobel.
- "Coba Kirim Ulang" / "Tandai Selesai Manual": klaim atomik via `updateMany` dengan guard status (pola sama seperti seluruh Fase 3-4) — mencegah 2 admin memproses order yang sama bersamaan.
- Route/action admin tetap di belakang middleware role-gate yang sudah ada sejak Fase 1 — tidak ada perubahan di lapisan itu.
- Kegagalan kirim Telegram tidak pernah membatalkan/mengganggu transisi status order — lihat §4.

## 7. Testing

Ikuti konvensi yang sudah established sejak Fase 1 di repo ini (diverifikasi via grep `web/tests/` — semua test menyasar fungsi pure, tidak ada yang mock Prisma):

- Kalau ada logic keputusan pure yang bisa diekstrak (mis. "aksi mana yang valid untuk kombinasi status+penyebab tertentu") — ditulis TDD, file test terpisah.
- Kode orkestrasi DB (server actions, halaman admin, pemanggilan `sendTelegramAlert`) **tidak** di-unit-test lewat DB/network tiruan — tidak ada infra untuk itu di repo ini. Diverifikasi manual end-to-end di task terakhir plan, pola sama seperti Task 11 (Fase 4) / Task 13 (Fase 3).
- Verifikasi manual wajib mencakup: keempat tombol aksi di kedua skenario `NEEDS_REVIEW` (a dan b), skenario `REFUND_PENDING`, dan notifikasi Telegram benar-benar terkirim (butuh bot Telegram asli — Wildan perlu setup @BotFather sebelum verifikasi task terakhir bisa jalan penuh; kalau belum ada saat itu, ikuti pola sintesis yang sama seperti kredensial Midtrans sandbox di fase-fase sebelumnya).

## 8. Self-Review

**Cakupan:** §3-6 mengcover ketiga bagian scope (§2) — halaman list, halaman detail+aksi, notifikasi. Tidak ada gap.

**Placeholder scan:** tidak ada "TBD"/"nanti"/generic error handling — semua keputusan konkret (4 tombol dengan kondisi eksplisit, 2 env var bernama pasti, format idempotencyKey yang sudah ada).

**Konsistensi:** `idempotencyKey` format (`order-refund:${id}`) match persis dengan yang sudah dipakai di `fulfillment.ts` Fase 4 — tidak ada key baru yang bertabrakan. Status enum yang dipakai (`NEEDS_REVIEW`, `REFUND_PENDING`, `REFUNDED`, `COMPLETED`) semuanya sudah ada di schema, tidak ada asumsi status baru.

**Ambiguitas:** "Coba Kirim Ulang" vs "Coba Refund Ulang" dibedakan eksplisit by kondisi (ada/tidaknya `OrderFulfillment` + `userId`) — tidak ada celah admin salah pencet untuk kasus yang salah (tombol tidak akan muncul kalau kondisinya tidak cocok).
