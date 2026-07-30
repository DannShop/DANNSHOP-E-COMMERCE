# Task 7 Report — Verifikasi akhir end-to-end (manual)

## Status: DONE

## Ringkasan

Semua step otomatis PASS bersih. Step 3-5 (jalur menipis/no-repeat/pulih) diverifikasi penuh dengan kredensial Digiflazz asli (DB dev, saldo asli Rp 0) dan bot Telegram asli baru (`t.me/dannshop_bot`, dibuat ulang sesi ini karena kredensial lama tidak pernah tersimpan di `.env` manapun — lihat catatan di bawah). Step 6 (jalur gagal-cek) **di-skip** atas keputusan eksplisit user — opsional di brief, dan menyentuh kredensial Digiflazz asli membawa risiko tidak bisa direstore (percobaan backup otomatis diblokir classifier keamanan sistem).

## Step 1: Build produksi

`cd web && npm run build` → **sukses**, `✓ Compiled successfully`, semua 24 route ter-generate tanpa error.

## Step 2: Full automated suite

- `npx vitest run` → **117/117 test PASS**, 23 test files (baseline 104 Fase7a + 13 baru Task2-4, sesuai ekspektasi brief).
- `npx tsc --noEmit` → bersih, exit 0.
- `npm run lint` → 0 error, 2 warning pre-existing tidak terkait (`@next/next/no-img-element` di `deposit-status.tsx`/`invoice-status.tsx`, sudah dicatat sejak Fase 3/4).

## Catatan penting: kredensial Telegram tidak ada di `.env` worktree ini

PROGRESS.md mengklaim `.env` worktree ini sudah punya kredensial Telegram asli (di-copy dari checkout utama) — **klaim ini salah/basi**. Diverifikasi: baik `.env` worktree ini maupun `.env` checkout utama (`D:/Coding VSC/DannShop-PPOB/web/.env`, timestamp 25 Jul, belum pernah disentuh sejak sebelum Fase 7a) sama-sama TIDAK punya `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`. Kemungkinan besar kredensial Telegram asli yang dipakai testing Fase 7a hanya pernah ada di `.env` worktree Fase 7a (sudah terhapus/sisa folder kosong, dicek — tidak ada `.env` di sana). User membuat bot Telegram baru sesi ini (`@dannshop_bot`, username sama seperti bot lama) dan memberikan token+chat ID langsung, ditambahkan ke `.env` worktree ini (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, plus `NEXT_PUBLIC_APP_URL` yang juga belum ada). Tidak dicatat di commit apa pun (`.env` tidak pernah di-track git).

## Step 3: Verifikasi jalur "menipis" — PASS

1. Login admin, `/admin/providers` → Digiflazz awalnya **Nonaktif**, diaktifkan dulu (job hanya proses `isActive:true` per Global Constraint).
2. "Cek Saldo" → saldo real Digiflazz **Rp 0** (Health Sehat).
3. Ambang alert diisi **Rp 100.000** (di atas saldo asli), disimpan — form Task 6 berfungsi benar, wiring ke `saveBalanceThreshold` (Task 4) OK.
4. Trigger via `POST /api/cron/tick` (header `x-cron-secret` dari `.env`) → `{"ran":1,"failed":0}`.
5. **Hasil: badge berubah "Sehat"→"Menipis", pesan Telegram real masuk ke bot** — user konfirmasi diterima persis: `⚠️ Saldo Digiflazz menipis: Rp 0 (ambang Rp 100.000)` + link `/admin/providers`. Format 100% cocok `formatBalanceAlertMessage` (Task 3).

## Step 4: Verifikasi tidak ada alert berulang — PASS

Catatan proses: job `check-provider-balance` self-reschedule 1 jam (Global Constraint), jadi panggilan `/api/cron/tick` berikutnya tidak otomatis re-run job itu (yang due & jalan di tick-tick berikutnya hanya `reconcile-paid-orders`, job lain yang kebetulan due — diverifikasi via query langsung tabel `Job`). Untuk menguji ulang job yang sama tanpa menunggu 1 jam, `Job.runAt` untuk `check-provider-balance` di-update manual jadi lampau (murni mengubah jadwal, tidak menyentuh logic/kode), lalu tick lagi.

Dengan ambang **masih Rp 100.000** (belum diubah) dan saldo masih Rp 0 (masih di bawah ambang): job jalan lagi (`updatedAt` job baru terkonfirmasi via query DB), **badge tetap "Menipis" (tidak berubah)**, user konfirmasi **tidak ada pesan Telegram baru** — edge-triggered behavior (`decideBalanceAlertTransition`) terbukti benar, tidak spam alert selama status belum berubah.

## Step 5: Verifikasi jalur "pulih" — PASS

Ambang diturunkan ke **0** (saldo asli Rp 0, dan `decideBalanceAlertTransition` pakai `balance < threshold` strict — jadi `0 < 0` = false = tidak LOW, valid untuk uji pulih tanpa perlu saldo asli berubah). Job dipaksa due lagi (sama seperti Step 4), tick → **badge berubah "Menipis"→"Sehat"**, user konfirmasi pesan Telegram masuk: `✅ Saldo Digiflazz pulih: Rp 0` + link. Format cocok persis brief.

## Step 6: Verifikasi jalur gagal-cek — DI-SKIP (keputusan user)

Opsional di brief. Butuh mengubah API Key Digiflazz jadi salah sementara lalu mengembalikannya. Backup otomatis kredensial terenkripsi (agar bisa direstore persis) ke file lokal **diblokir oleh classifier keamanan sistem** (dianggap berisiko eksfiltrasi walau isinya blob terenkripsi, bukan plaintext). Diberi 2 opsi ke user (skip vs user ganti-kembalikan sendiri manual) — **user pilih skip**. Dicatat sebagai gap non-blocking: logic `healthStatus: DOWN` + tidak ada alert saat `fetchBalance()` throw sudah eksplisit di Global Constraint plan dan konsisten dengan pola tombol "Cek Saldo" manual yang sudah lama ada (bukan kode baru berisiko tinggi) — hanya belum diverifikasi via jaringan nyata gagal.

## Verifikasi tambahan yang ditemukan saat testing (bukan bug, informasi proses)

- 1 console warning dev-mode (`Base UI: A component is changing the default value state of an uncontrolled FieldControl...`) muncul saat submit form ambang batas pertama kali. Tidak mempengaruhi hasil (value tetap tersimpan benar di semua percobaan), kemungkinan besar warning React dev-only terkait transisi `defaultValue`→controlled pada `useActionState`, sama pola dengan form kredensial yang sudah ada sebelumnya (tidak unik ke Task 6). Dicatat sebagai minor non-blocking, bukan temuan baru yang perlu fix.

## Cleanup setelah verifikasi

- State test dikembalikan: Digiflazz **Nonaktif** kembali, ambang alert saldo dikosongkan (null), persis kondisi sebelum Task 7 dimulai.
- Dev server (`npm run dev`, PID 22040) dihentikan, port 3000 dikonfirmasi tidak listening lagi.
- Artefak sementara Playwright MCP (`.playwright-mcp/`) dihapus (scratch, bukan bagian kode).
- Tidak ada perubahan kode di task ini — `git status --short` bersih setelah cleanup, tidak ada commit yang diperlukan (Step 8 di brief: "kalau bersih, tidak perlu commit apa pun").

## Kredensial Telegram baru — tindak lanjut yang disarankan (non-blocking untuk Fase 7b)

`.env` checkout utama (`D:/Coding VSC/DannShop-PPOB/web/.env`) sebaiknya juga diberi `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`/`NEXT_PUBLIC_APP_URL` yang sama setelah merge, supaya sesi berikutnya (dev lokal di checkout utama, bukan worktree) juga bisa kirim alert real tanpa bingung ulang. Di luar scope Task 7 (task ini hanya milik worktree), dicatat untuk langkah setelah merge.
