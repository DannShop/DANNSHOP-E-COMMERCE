# Fase 7a — Laporan perbaikan review akhir (whole-branch)

Tanggal: 2026-07-30
Worktree: `D:\Coding VSC\DannShop-PPOB\.claude\worktrees\fase-7a-admin-orders-refund-sdd`
Branch: `worktree-fase-7a-admin-orders-refund-sdd`

Semua 5 temuan dari review akhir whole-branch (paling capable model) sudah diperbaiki. Detail per fix di bawah, lalu hasil verifikasi lengkap.

## Fix 1 — Double-payout guard (Critical)

**1a. Guard setiap tulis status order di jalur otomatis.**

- `web/src/lib/order/fulfillment.ts`: menambah `export const ORDER_STATUSES_NOT_OVERWRITABLE_BY_AUTOMATION = ["COMPLETED", "REFUNDED", "EXPIRED", "FAILED", "REFUND_PENDING"] as const;` di atas file.
- Semua 5 titik tulis status order yang tadinya `db.order.update`/`tx.order.update` tanpa guard, dikonversi jadi `updateMany` dengan `status: { notIn: [...ORDER_STATUSES_NOT_OVERWRITABLE_BY_AUTOMATION] }`:
  - `applyFulfillmentResult` cabang SUCCESS (dulu baris 118-121) — kalau `count === 0`, `console.error` lalu `return` (skip tulis `orderStatusHistory`).
  - `applyFulfillmentResult` cabang auto-refund member, di dalam `db.$transaction` (dulu baris 147) — kalau `count === 0`, `throw new Error("ORDER_ALREADY_TERMINAL")` supaya transaksi (kredit wallet + ledger) ikut rollback. Blok `catch` sesudahnya membedakan: kalau `e.message === "ORDER_ALREADY_TERMINAL"` → `console.error` + `return` (TIDAK jalankan fallback eskalasi NEEDS_REVIEW/alert); error lain → tetap eskalasi seperti semula.
  - `applyFulfillmentResult` cabang guest REFUND_PENDING (dulu baris 165) — sekarang lewat helper `escalateOrder` (lihat Fix 4) yang sudah guarded.
  - `retryOrderFulfillment` blok recovery-catch (dulu baris 249, fallback ke NEEDS_REVIEW) — dikonversi ke `updateMany` guarded; kalau `count === 0` skip histori.
  - `web/src/lib/jobs/runner.ts` eskalasi 30x-recheck (dulu baris 125) — sekarang lewat `escalateOrder` yang di-import dari `fulfillment.ts` (guarded + alert unconditional sekaligus, lihat Fix 4).

**1b. Eligibility gate di `markCompletedManualAction`** (`web/src/app/actions/orders.ts`):
- Sebelum klaim `updateMany`, cek `db.orderFulfillment.findMany` (attempt terakhir, `orderBy: attemptNo desc, take: 1`). Kalau attempt terakhir berstatus `SENT` atau `PROCESSING`, tolak dengan `{ error: ... }` — barang masih mungkin menyusul terkirim dari provider. Order tanpa fulfillment row sama sekali, atau attempt terakhir `FAILED`/`SUCCESS`, tetap diizinkan.

**Manual trace review (diminta eksplisit di brief) — cabang `ORDER_ALREADY_TERMINAL`:**
Ditelusuri baris-per-baris `applyFulfillmentResult` (`fulfillment.ts:204-266`):
- Kegagalan genuine (mis. `tx.wallet.update` gagal karena wallet tidak ada, koneksi DB putus, atau P2002 idempotencyKey race) melempar error dengan `.message` BUKAN string `"ORDER_ALREADY_TERMINAL"` → `e instanceof Error && e.message === "ORDER_ALREADY_TERMINAL"` bernilai `false` → jatuh ke cabang `else` yang TIDAK berubah: `truncateNote`, `console.error`, `escalateOrder(...NEEDS_REVIEW...)` — perilaku lama utuh untuk kegagalan nyata.
- Kasus "order sudah diselesaikan admin lain" HANYA terjadi kalau `tx.order.updateMany` di dalam transaksi mengembalikan `count === 0`, yaitu status order saat itu SUDAH salah satu dari `ORDER_STATUSES_NOT_OVERWRITABLE_BY_AUTOMATION`. `db.$transaction(async (tx) => {...})` (bentuk interactive/callback) rollback otomatis seluruh isi callback kalau callback throw — jadi kredit wallet + ledger yang sudah dieksekusi di baris sebelumnya di dalam callback yang sama IKUT di-rollback, tidak pernah benar-benar tersimpan. Comment di kode menegaskan ini eksplisit.
- Tidak ada risiko tabrakan string sentinel dengan pesan error asli Prisma/driver — pola sama persis dengan sentinel `"ORDER_STATUS_CHANGED"` yang sudah dipakai di `retryOrderRefund` di file yang sama sebelum fix ini.
- Kesimpulan: kegagalan genuine tetap eskalasi + alert seperti semula; hanya kasus "order sudah final di jalur lain" yang diserap diam-diam (dengan `console.error` untuk jejak audit), sesuai spesifikasi.

## Fix 2 — VARCHAR(191) overflow (2 titik baru)

- File baru `web/src/lib/order/status-note.ts` — `truncateNote()` dipindah ke sini (versi aman surrogate-pair, pakai `Array.from`), dipakai bersama oleh `fulfillment.ts` dan `actions/orders.ts`.
- `fulfillment.ts`: definisi lokal `truncateNote` (dulu baris 12-18) dihapus, diganti `import { truncateNote } from "./status-note";`. 4 titik pakai lama tetap jalan sama.
- Titik baru yang dibungkus `truncateNote`: SUCCESS-path note `` `SN: ${result.sn ?? "-"}` `` (dulu baris 123, sebelumnya TIDAK dipotong).
- `web/src/app/actions/orders.ts`: `markCompletedManualAction` (note "Ditandai selesai manual oleh admin. SN: ...") dan `markRefundedAction` (note "Direfund manual oleh admin: ...") sekarang dibungkus `truncateNote(...)`.
- `web/src/app/admin/orders/[orderNumber]/order-actions.tsx`: kedua `<Textarea>` (SN dan catatan refund) diberi `maxLength={191}` sebagai hint sisi klien.

## Fix 3 — Retry manual admin tidak boleh re-alert

- `selectAndSend` (`fulfillment.ts`) sekarang menerima parameter ke-4 `alertOnFailure: boolean = true`.
- `dispatchFulfillment` memanggil `selectAndSend(order, item, 1)` — default `true`, alert tetap jalan untuk jalur otomatis.
- `retryOrderFulfillment` cabang `send_fresh` memanggil `selectAndSend(order, item, decision.nextAttemptNo, false)` — retry dipicu admin, tidak re-alert kalau gagal lagi dengan alasan "tidak ada SKU"/"harga modal naik".
- Flag ini diteruskan ke `escalateOrder({ ..., alertOnFailure })` di dalam `selectAndSend`.

## Fix 4 — Helper `escalateOrder` (alert unconditional terhadap histori)

- `export async function escalateOrder(params)` ditambahkan di `fulfillment.ts`: klaim atomik (`updateMany` guarded terhadap `ORDER_STATUSES_NOT_OVERWRITABLE_BY_AUTOMATION`) → kalau berhasil, tulis `orderStatusHistory` dibungkus `try/catch` yang HANYA `console.error` kalau gagal (tidak menggagalkan langkah berikutnya) → alert Telegram tetap terkirim (kecuali `alertOnFailure === false`) selama klaim status berhasil, tidak peduli histori sukses atau tidak.
- Dipakai di 4 titik alert yang sudah ada:
  1. `selectAndSend` cabang NEEDS_REVIEW (dengan `alertOnFailure` dari Fix 3).
  2. `applyFulfillmentResult` cabang auto-refund-crash NEEDS_REVIEW (di luar transaksi, hanya jalan untuk kegagalan genuine — TIDAK dipanggil untuk kasus `ORDER_ALREADY_TERMINAL`, lihat Fix 1 trace review di atas).
  3. `applyFulfillmentResult` cabang guest REFUND_PENDING.
  4. `runner.ts` eskalasi 30x-recheck — di-import sebagai `escalateOrder` dari `fulfillment.ts` (import `sendTelegramAlert`/`formatOrderAlertMessage` yang jadi tidak terpakai dihapus dari `runner.ts`).
- Fix 1 dan Fix 4 dikerjakan sebagai satu edit koheren per titik panggil (sesuai instruksi), bukan dua pass terpisah.

## Fix 5 — SN manual tampil di invoice pembeli (migrasi kecil disetujui)

- `web/prisma/schema.prisma`: tambah `manualSn String? @db.Text` di `model Order` (pakai `@db.Text`, bukan default VARCHAR(191), supaya imun dari kelas bug Fix 2).
- Migrasi dijalankan: `npx prisma migrate dev --name add_order_manual_sn` (MySQL lokal Laragon perlu dinyalakan manual dulu — `mysqld.exe` sempat tidak listen di port 3306, sudah di-start ulang). Migration SQL yang dihasilkan (`web/prisma/migrations/20260730042850_add_order_manual_sn/migration.sql`):
  ```sql
  -- AlterTable
  ALTER TABLE `order` ADD COLUMN `manualSn` TEXT NULL;
  ```
  Prisma Client di-regenerate otomatis oleh `migrate dev`.
- `web/src/app/actions/orders.ts`: `markCompletedManualAction` sekarang menulis `manualSn: sn.trim()` di `data` object `db.order.updateMany`, sejajar dengan `status`/`completedAt`.
- `web/src/app/invoice/[orderNumber]/page.tsx`: baris `sn: ...` diubah jadi `latestFulfillment?.status === "SUCCESS" ? latestFulfillment.sn : order.manualSn` — fallback ke SN manual admin kalau tidak ada fulfillment SUCCESS.

## Catatan implementasi tambahan (di luar 5 fix, murni teknis)

- `ORDER_STATUSES_NOT_OVERWRITABLE_BY_AUTOMATION` dideklarasikan `as const` (readonly tuple) sesuai spesifikasi brief, tapi Prisma `notIn` mengharapkan array mutable secara tipe — jadi tiap titik pakai memakai `notIn: [...ORDER_STATUSES_NOT_OVERWRITABLE_BY_AUTOMATION]` (spread jadi array baru) supaya `tsc --noEmit` bersih tanpa mengubah nilai/rasionalnya.
- Cabang `decision.action === "not_eligible"` di `retryOrderFulfillment` (order sudah "dimiliki" fungsi ini via klaim `NEEDS_REVIEW→PROCESSING` di awal, jadi risikonya rendah) sengaja TIDAK disentuh — tidak disebutkan eksplisit di 5 titik guard pada brief Fix 1a, jadi dibiarkan seperti semula untuk tetap sesuai lingkup yang diminta.

## Verifikasi

Dijalankan dari `web/`, semua lulus:

```
$ npx vitest run
 Test Files  22 passed (22)
      Tests  104 passed (104)

$ npx tsc --noEmit
(tidak ada output — bersih)

$ npm run lint
✖ 2 problems (0 errors, 2 warnings)
# 2 warning pre-existing (no-img-element di deposit-status.tsx & invoice-status.tsx),
# tidak terkait perubahan fix ini.

$ npm run build
✓ Compiled successfully in 21.3s
✓ Generating static pages using 3 workers (19/19)
```

Tidak ada test otomatis baru ditambahkan untuk Fix 1/Fix 4 (sesuai konvensi repo di Global Constraints plan: TDD hanya untuk pure function, kode orkestrasi DB diverifikasi manual/review) — trace manual untuk cabang `ORDER_ALREADY_TERMINAL` didokumentasikan di atas.

## File yang diubah

- `web/src/lib/order/fulfillment.ts` (Fix 1a, 2, 3, 4)
- `web/src/lib/order/status-note.ts` (baru — Fix 2)
- `web/src/lib/jobs/runner.ts` (Fix 1a, 4)
- `web/src/app/actions/orders.ts` (Fix 1b, 2, 5)
- `web/src/app/admin/orders/[orderNumber]/order-actions.tsx` (Fix 2)
- `web/prisma/schema.prisma` (Fix 5)
- `web/prisma/migrations/20260730042850_add_order_manual_sn/` (baru — Fix 5)
- `web/src/app/invoice/[orderNumber]/page.tsx` (Fix 5)

## Concerns / hal yang perlu diperhatikan

- MySQL lokal (Laragon) tidak otomatis berjalan di environment ini — sempat perlu di-start manual (`mysqld.exe --defaults-file=...`) sebelum migrasi Fix 5 bisa dijalankan. Kalau environment CI/merge lain tidak punya MySQL running, `prisma migrate deploy`/`migrate dev` akan gagal connect sampai service dinyalakan — bukan bug dari fix ini, tapi perlu diingat saat merge/deploy.
- Cabang `not_eligible` di `retryOrderFulfillment` (baris ~298) masih pakai `db.order.update` tanpa guard `notIn` — di luar lingkup 5 titik yang diminta brief, risiko rendah (order sudah diklaim function ini sendiri via status PROCESSING sebelum sampai ke situ), tapi dicatat di sini kalau reviewer ingin konsistensi penuh di masa depan.
- `maxLength={191}` di `<Textarea>` SN/catatan admin hanya hint sisi klien murni (bukan jaminan) — jaminan sebenarnya tetap `truncateNote()` sisi server, sesuai instruksi brief. Untuk `markCompletedManualAction`, note final ("Ditandai selesai manual oleh admin. SN: " + sn) bisa tetap >191 karakter walau SN-nya persis 191 karakter (karena ada prefix) — `truncateNote()` server-side tetap menangani ini dengan benar (potong+"..."), jadi tidak ada bug, hanya batas hint klien yang tidak 100% presisi terhadap batas kolom gabungan.

## Fix 6 & 7 — Perbaikan re-review (2026-07-30)

Dua issue minor terdeteksi di re-review scoped final sebelum main merge:

**Fix 6 — Table name case-sensitivity dalam migrasi (Critical for Linux production)**

- File: `web/prisma/migrations/20260730042850_add_order_manual_sn/migration.sql`
- Perubahan: Ubah `ALTER TABLE \`order\`` menjadi `ALTER TABLE \`Order\`` (capital O)
- Alasan: Tabel Order dibuat dengan nama capital-O (`model Order`, tidak ada `@@map`). Di Laragon Windows (MySQL default `lower_case_table_names=1`), tabel nama case-insensitive, jadi migration lama berjalan tanpa error. Tapi di Linux production dengan `lower_case_table_names=0` (case-sensitive), `prisma migrate deploy` akan gagal dengan error "Table '<db>.order' doesn't exist" karena nama tabel yang diciptakan adalah `Order`, bukan `order`. Migrasi sudah tercatat applied di `_prisma_migrations` lokal, jadi hanya mengedit file SQL sudah cukup (tidak perlu regenerasi atau re-run).

**Fix 7 — SN manual tidak ditampilkan di polling endpoint status invoice**

- File: `web/src/app/api/orders/[orderNumber]/status/route.ts` (line 26)
- Perubahan: Ubah response `sn: latestFulfillment?.status === "SUCCESS" ? latestFulfillment.sn : null,` menjadi `sn: latestFulfillment?.status === "SUCCESS" ? latestFulfillment.sn : order.manualSn,`
- Alasan: Fix 5 menambahkan `order.manualSn` dan mengubah SSR invoice page (line 36) untuk menampilkannya sebagai fallback. Tapi endpoint polling status (`/api/orders/[orderNumber]/status`) yang dipanggil setiap 3 detik saat order belum final, masih mengembalikan `sn: null` untuk order manual. Ketika customer membuka invoice saat admin meng-mark order complete manual, halaman akan refresh dengan data polling, dan SN menjadi null lagi karena polling tidak mengembalikan `manualSn`. Dengan fix ini, polling mengembalikan `manualSn` seperti SSR page, sehingga SN manual tetap tampil tanpa perlu reload halaman manual.

### Verifikasi

Dijalankan dari `web/` setelah kedua fix:

```
$ npx tsc --noEmit
(tidak ada output — bersih)

$ npm run lint
> web@0.1.0 lint
> eslint

D:\Coding VSC\DannShop-PPOB\.claude\worktrees\fase-7a-admin-orders-refund-sdd\web\src\app\account\deposit\[depositId]\deposit-status.tsx
  83:11  warning  Using `<img>` could result in slower LCP...

D:\Coding VSC\DannShop-PPOB\.claude\worktrees\fase-7a-admin-orders-refund-sdd\web\src\app\invoice\[orderNumber]\invoice-status.tsx
  140:11  warning  Using `<img>` could result in slower LCP...

✖ 2 problems (0 errors, 2 warnings)
# 2 warning pre-existing (sama seperti sebelumnya), tidak terkait Fix 6/7
```

### File yang diubah

- `web/prisma/migrations/20260730042850_add_order_manual_sn/migration.sql`
- `web/src/app/api/orders/[orderNumber]/status/route.ts`

### Commit

```
Commit: ff82a7f
Message: fix(fase7a): perbaiki nama tabel migrasi + endpoint status polling untuk SN manual
```
