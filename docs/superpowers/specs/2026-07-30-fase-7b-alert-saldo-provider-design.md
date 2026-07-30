# Fase 7b: Alert Saldo Provider — Spec Desain

Status: disetujui Wildan 2026-07-30, siap masuk `superpowers:writing-plans`.

## 0. Konteks

Spec Fase 7a (`docs/superpowers/specs/2026-07-29-fase-7a-admin-orders-refund-design.md` §0) sudah memecah "Fase 7" jadi sub-fase, dan menyebut 7b secara kasar sebagai "job `check-provider-balance` + `send-notification`". Saat brainstorming spec ini (2026-07-30), Wildan mempersempit fokus 7b **hanya ke alert saldo provider** — notifikasi email ke pembeli (`send-notification`) TIDAK termasuk di sini, jadi kandidat sub-fase terpisah nanti (lihat §2 "Sengaja di luar scope").

**Kenapa ini penting:** DannShop hanya bisa fulfill order kalau saldo deposit di provider (Digiflazz, dan provider lain saat aktif di Fase 5) mencukupi. Saat ini satu-satunya cara tahu saldo menipis adalah admin klik tombol "Cek Saldo" manual di `/admin/providers` — kalau lupa, order bisa mulai gagal fulfillment (jatuh ke `NEEDS_REVIEW`, sudah ditangani Fase 7a, tapi baru ketahuan SETELAH order sudah terlanjur gagal) tanpa peringatan dini.

## 1. Tujuan & Definisi Selesai

**Tujuan:** admin dapat notifikasi Telegram proaktif begitu saldo provider aktif turun di bawah ambang batas yang mereka tentukan sendiri, sebelum order mulai gagal fulfillment karena kehabisan saldo.

**Definisi selesai:** job berjalan otomatis tiap jam, mengecek saldo tiap provider aktif yang punya ambang batas terisi, dan mengirim satu pesan Telegram saat saldo melintasi ambang batas (turun di bawah = alert menipis, naik kembali di atas = alert pulih) — tanpa spam berulang selama status tidak berubah.

## 2. Scope

### Masuk

1. **Skema:** 2 field baru di `ProviderConfig` — `minBalanceAlert BigInt?` (nullable, null = alert nonaktif utk provider itu) dan `balanceAlertStatus BalanceAlertStatus @default(OK)` (enum baru `OK`/`LOW`).
2. **Job `check-provider-balance`:** self-rescheduling tiap 1 jam (pola sama seperti `sync-prices`), didaftarkan lewat `ensureRecurringJobs()` dengan guard stale-`RUNNING` yang sama seperti `reconcile-paid-orders`.
3. **Fungsi pure `decideBalanceAlertTransition`:** input saldo terkini, ambang batas, status alert saat ini → output status baru + apakah ini transisi (perlu alert atau tidak). TDD penuh.
4. **Notifikasi Telegram:** reuse `sendTelegramAlert` (Fase 7a), tambah 1 formatter baru `formatBalanceAlertMessage` di `web/src/lib/notify/telegram.ts`. Kirim saat (dan hanya saat) `decideBalanceAlertTransition` bilang ada transisi.
5. **UI admin:** field baru "Ambang alert saldo" di form provider yang sudah ada (`/admin/providers`, `provider-card.tsx`) — kosong = alert nonaktif utk provider itu. Dibangun pakai skill `ui-ux-pro-max` + `frontend-design` saat implementasi (pola sama seperti Fase 4 Task 5/9).

### Sengaja di luar scope

- **Notifikasi email ke pembeli** (`send-notification` invoice/sukses) — bukan bagian 7b ini, kandidat sub-fase terpisah nanti.
- **Laporan/analytics admin** dan **hardening keamanan** (termasuk backlog IDOR `orderNumber` sejak final review Fase 4) — tetap di luar scope, kandidat 7c/7d.
- **Deploy Hostinger** — kerja infra/ops manual Wildan, dibahas terpisah.
- **Provider selain Digiflazz** — Serpul/OkeConnect/QiosPay belum diimplementasi (Fase 5), tapi desain job ini sudah adapter-agnostic (iterasi semua `ProviderConfig` dengan `isActive: true` DAN `minBalanceAlert` terisi) — begitu provider lain aktif nanti, otomatis ikut kecek tanpa perubahan kode job.

## 3. Logic Alert (per provider, tiap job run)

Untuk tiap `ProviderConfig` dengan `isActive: true` DAN `minBalanceAlert` tidak null:

1. Panggil `adapter.fetchBalance()` (adapter sudah ada dari Fase 2/registry `getAdapter`).
2. **Kalau throw** (network/API error) — catat `healthStatus: DOWN`, `console.error`, **lanjut ke provider berikutnya tanpa alert dan tanpa mengubah `balanceAlertStatus`**. Alasan: gangguan API sesaat itu wajar dan sering self-heal di cek jam berikutnya; alert di tiap gangguan jaringan berisiko berisik. Perilaku ini sama persis dengan tombol "Cek Saldo" manual yang sudah ada (`web/src/app/actions/providers.ts:92-105`).
3. **Kalau sukses** — update `balance`, `healthStatus: HEALTHY`, `lastHealthCheckAt`, catat baris baru `ProviderBalanceLog` (persis seperti tombol manual sekarang).
4. Panggil `decideBalanceAlertTransition(balance, minBalanceAlert, currentBalanceAlertStatus)`:
   - `balance < minBalanceAlert` dan status saat ini `OK` → transisi ke `LOW`, alert "menipis".
   - `balance >= minBalanceAlert` dan status saat ini `LOW` → transisi ke `OK`, alert "pulih".
   - Selain itu (status baru == status lama) → tidak ada transisi, tidak ada alert.
5. Kalau ada transisi: update `balanceAlertStatus` ke status baru, kirim `sendTelegramAlert(formatBalanceAlertMessage(...))`.

**Tidak ada alert berulang** selama status tidak berubah — kalau saldo terus di bawah ambang selama berjam-jam/berhari-hari sampai admin top-up, hanya ada 1 pesan "menipis" (saat pertama melintas) dan 1 pesan "pulih" (saat top-up terdeteksi), bukan pengingat berkala.

## 4. Format Pesan Telegram

Mengikuti pola `formatOrderAlertMessage` yang sudah ada:

- **Menipis:** `⚠️ Saldo {DisplayName} menipis: Rp {balance} (ambang Rp {threshold})\n{baseUrl}/admin/providers`
- **Pulih:** `✅ Saldo {DisplayName} pulih: Rp {balance}\n{baseUrl}/admin/providers`

## 5. Error Handling

- Job memproses tiap provider dalam loop independen — satu provider gagal (network error) tidak boleh menghentikan pengecekan provider lain dalam run yang sama.
- `sendTelegramAlert` sudah tidak pernah throw (jaminan dari Fase 7a) — kegagalan kirim Telegram tidak boleh menggagalkan job/melewatkan update `balanceAlertStatus`.
- Job mengikuti pola retry/backoff standar `runDueJobs` yang sudah ada (tidak ada logic retry khusus tambahan).

## 6. Testing

- `decideBalanceAlertTransition` — pure function, TDD penuh. Kasus minimal: sehat→menipis (transisi), menipis→sehat (transisi), tetap sehat, tetap menipis (2 kasus non-transisi), saldo persis di ambang batas (boundary, `<` bukan `<=`).
- Job orchestration (`check-provider-balance` handler) — tidak ada test otomatis, konsisten dengan konvensi repo (semua job handler lain juga begitu — `sync-prices`, `reconcile-paid-orders`, dll tidak punya test DB-orchestration).
- Verifikasi manual sebelum final review: set `minBalanceAlert` di atas saldo asli Digiflazz sandbox lewat `/admin/providers`, jalankan job (manual trigger atau tunggu jadwal), pastikan Telegram masuk **sekali** (bukan berulang di run berikutnya selama status tidak berubah), lalu turunkan ambang batas di bawah saldo asli untuk verifikasi jalur "pulih".
