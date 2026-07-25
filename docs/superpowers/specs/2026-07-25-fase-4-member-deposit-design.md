# Fase 4: Member + Deposit — Design

Status: Disetujui Wildan (2026-07-25)

Addendum terhadap desain utama `docs/superpowers/specs/2026-07-19-dannshop-topup-platform-design.md` (§4 Blok 3, §6, §7, §12 baris Fase 4). Dokumen itu tetap sumber kebenaran arsitektur keseluruhan; dokumen ini merinci keputusan implementasi Fase 4 yang belum ada di sana.

## 1. Ruang lingkup

DoD (spec utama §12): *"Deposit → beli pakai saldo → refund saat provider digagalkan."*

Dibangun:
1. Checkout terhubung ke sesi login (`order.userId` otomatis terisi kalau login, apapun metode bayarnya).
2. Opsi "Bayar pakai saldo" di checkout, khusus member dengan saldo cukup.
3. Halaman deposit saldo via QRIS Midtrans.
4. Auto-refund ke saldo untuk member saat fulfillment gagal (guest tetap `REFUND_PENDING` seperti Fase 3).
5. Dashboard member: saldo, riwayat transaksi, riwayat deposit.

Di luar scope (fase lain sesuai roadmap §12): admin refund queue (Fase 7), provider ke-2–4 (Fase 5), routing termurah multi-provider (Fase 6).

**Tidak ada migrasi Prisma baru.** Semua model yang dibutuhkan (`User`, `Wallet`, `WalletLedger`, `Deposit`, enum `PaidVia.BALANCE`, `LedgerType`, `DepositStatus`) sudah ada sejak Fase 1 (18 model awal), termasuk pembuatan `Wallet` otomatis saat register (`web/src/app/actions/auth.ts`) dan proteksi route `/account/:path*` di `web/src/proxy.ts` yang sudah menunggu halaman ini dibangun.

## 2. Checkout terhubung ke sesi login

`web/src/app/actions/checkout.ts` → `createCheckoutOrder` ambil sesi via `auth()` di awal. Kalau ada sesi: `order.userId = session.user.id`, **berlaku untuk semua metode bayar** (bukan cuma saldo) — supaya riwayat transaksi dashboard member lengkap.

`buyerEmail` tetap field manual di form (bukan diambil paksa dari sesi) — di-prefill dari `session.user.email` kalau login, tapi tetap bisa diedit (kasus: user login checkout-in buat orang lain, invoice ke email lain). Guest checkout (tanpa sesi) tidak berubah sama sekali dari Fase 3.

## 3. Bayar pakai saldo (member)

Form checkout dapat opsi ke-3 di radio metode bayar: `"Saldo (Rp {balance})"`, muncul hanya kalau ada sesi. **Disabled** kalau `wallet.balance < item.sellingPrice`, dengan teks kecil + link ke `/account/deposit` (saldo diambil server-side saat render halaman produk).

`createCheckoutOrder` bercabang di akhir berdasarkan field `paymentMethod` (`"qris"` default | `"balance"`):

1. `paymentMethod === "balance"` tanpa sesi → error `"Harus login untuk bayar pakai saldo."` (defense in depth, bukan cuma andalkan UI disabled).
2. Order dibuat dulu (`status: PENDING_PAYMENT`, `paidVia: "BALANCE"`, `payment: { method: "balance", status: "PENDING" }`) — pola sama seperti cabang Midtrans.
3. **Satu `db.$transaction`** membungkus debit + ledger + perubahan status, supaya tidak ada state parsial (mis. saldo berkurang tapi ledger gagal ditulis):
   ```ts
   await db.$transaction(async (tx) => {
     const debited = await tx.wallet.updateMany({
       where: { userId, balance: { gte: order.total } },
       data: { balance: { decrement: order.total } },
     });
     if (debited.count === 0) throw new InsufficientBalanceError(); // rollback transaksi

     const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
     await tx.walletLedger.create({
       data: {
         walletId: wallet.id,
         type: "ORDER_PAYMENT",
         amount: -order.total,
         balanceAfter: wallet.balance,
         referenceType: "order",
         referenceId: order.id,
         idempotencyKey: `order-payment:${order.id}`,
       },
     });
     await tx.order.update({ where: { id: order.id }, data: { status: "PAID" } });
     await tx.orderPayment.update({ where: { orderId: order.id }, data: { status: "PAID" } });
     await tx.orderStatusHistory.create({
       data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "PAID", note: "Bayar pakai saldo" },
     });
   });
   ```
4. Kalau `InsufficientBalanceError` (race — saldo berubah sejak render, mis. 2 tab checkout barengan) tertangkap di luar transaksi (yang otomatis di-rollback, saldo tidak jadi berkurang) → `order`/`payment` ditandai `FAILED` (update terpisah, di luar transaksi yang di-rollback), error `"Saldo tidak cukup (mungkin berubah). Coba lagi atau pakai QRIS."`.
5. Setelah transaksi commit sukses → panggil `dispatchFulfillment(order.id)` di **luar** transaksi (sama seperti webhook Midtrans setelah klaim `PAID` — panggilan network ke provider tidak boleh ikut nge-lock transaksi DB).
6. Jalur ini tidak menyentuh Midtrans sama sekali — tidak ada charge, tidak ada webhook, tidak ada job `expire-order` (order langsung `PAID`, bukan `PENDING_PAYMENT` yang menunggu).

## 4. Deposit saldo via Midtrans

Halaman `/account/deposit` (dilindungi middleware yang sudah ada): preset nominal Rp 25rb/50rb/100rb/250rb/500rb + input custom, validasi Zod min Rp 10rb / max Rp 5jt (client & server).

**Keputusan teknis (supaya tidak perlu migrasi Prisma):** `Deposit` tidak punya nomor publik terpisah seperti `Order.orderNumber`. Midtrans butuh `order_id` unik per charge — **pakai `deposit.id` (cuid) langsung sebagai `order_id`**. Valid karena `chargeQris({ orderId, grossAmount })` generik, tidak terikat format tertentu (diverifikasi dari `web/src/lib/midtrans/client.ts`). QR string hasil charge disimpan di kolom `rawResponse` yang sudah ada (`Deposit` tidak punya kolom `actions` terpisah seperti `OrderPayment`), bentuk: `{ qrString, chargeResponse: raw }`.

`createDeposit(amount)` action:
1. Wajib sesi login.
2. Validasi nominal.
3. Buat `Deposit` (`status: PENDING`, `expiredAt: now + 15 menit`, konsisten dengan expiry order Fase 3).
4. `chargeQris({ orderId: deposit.id, grossAmount: amount })` → simpan `paymentRef = transactionId`, `rawResponse = { qrString, chargeResponse: raw }`. Gagal charge → `status: FAILED`, error (pola sama Fase 3).
5. Jadwalkan job `expire-deposit` (`payload: { depositId }`, `runAt: expiredAt`).
6. Redirect ke `/account/deposit/[depositId]` — QR + polling status (pola sama `/invoice/[orderNumber]` Fase 3, pesan sukses "Saldo bertambah Rp X" bukan SN barang).

Webhook (`web/src/app/api/webhooks/midtrans/route.ts`) — tambah cabang setelah lookup `Order` gagal:
```ts
const order = await db.order.findUnique({ where: { orderNumber: notif.order_id } });
if (!order) {
  const deposit = await db.deposit.findUnique({ where: { id: notif.order_id } });
  if (deposit) return handleDepositWebhook(deposit, notif, markProcessed);
  await markProcessed("order_not_found");
  return NextResponse.json({ ok: true });
}
```
`handleDepositWebhook`: konfirmasi status via `getTransactionStatus` (best practice Midtrans, sama seperti order), `paid` → klaim atomik `PENDING→PAID` (`updateMany` + cek `count`), lalu dalam satu `db.$transaction`: `wallet.balance` increment, tulis `WalletLedger` (`type: DEPOSIT`, `amount` positif, `idempotencyKey: "deposit:" + deposit.id`), update `deposit.status = PAID`. `failed`/`expired` → update status saja, wallet tidak disentuh. Signature verify + dedup `webhookEvent` tetap generik per `source: "midtrans"`, tidak perlu berubah.

## 5. Auto-refund ke saldo untuk member

`web/src/lib/order/fulfillment.ts` → `applyFulfillmentResult`, cabang `status === "FAILED"` bercabang berdasarkan **`order.userId`** (bukan `paidVia` — sesuai spec utama §7: keputusan refund ditentukan status member/guest):

```ts
if (order.userId) {
  await db.$transaction(async (tx) => {
    const wallet = await tx.wallet.update({
      where: { userId: order.userId! },
      data: { balance: { increment: order.total } },
    });
    await tx.walletLedger.create({
      data: {
        walletId: wallet.id,
        type: "REFUND",
        amount: order.total,
        balanceAfter: wallet.balance,
        referenceType: "order",
        referenceId: order.id,
        idempotencyKey: `order-refund:${order.id}`,
      },
    });
    await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
  });
  await db.orderStatusHistory.create({
    data: { orderId: order.id, toStatus: "REFUNDED", note: `Auto-refund ke saldo: ${result.message}` },
  });
} else {
  // Guest — tidak berubah dari Fase 3
  await db.order.update({ where: { id: order.id }, data: { status: "REFUND_PENDING" } });
  await db.orderStatusHistory.create({
    data: { orderId: order.id, toStatus: "REFUND_PENDING", note: result.message },
  });
}
```

**Idempotency:** guard atomik yang sudah ada di awal `applyFulfillmentResult` (`updateMany where status notIn [SUCCESS, FAILED]` pada `orderFulfillment`) memastikan blok ini jalan tepat sekali per fulfillment, walau webhook dan job `recheck-fulfillment` sama-sama mencoba memproses hasil gagal yang sama. `idempotencyKey` di ledger adalah lapisan kedua (audit trail + constraint unik), bukan penjaga utama race condition.

**Keputusan produk yang perlu diingat (bukan cuma detail teknis):** kalau member bayar via QRIS/Midtrans (bukan saldo) lalu fulfillment gagal, uang **tidak** dikembalikan ke rekening/e-wallet asal — masuk sebagai saldo DannShop. Ini konsekuensi dari spec utama §7 yang sudah disetujui 2026-07-24 (refund otomatis Midtrans di luar scope, butuh integrasi terpisah).

## 6. Halaman dashboard member (`/account/*`)

Semua route di bawah `/account/*` sudah otomatis dilindungi middleware (`proxy.ts`, matcher `/account/:path*`) — tidak perlu guard tambahan per halaman.

- **`/account`** (rombak total dari placeholder Fase 1): kartu saldo besar + tombol "Isi Saldo" → `/account/deposit`; cuplikan 5 transaksi terakhir (badge status, pola tint-bg dari `invoice-status.tsx`) + link "Lihat semua" → `/account/orders`; cuplikan 3 deposit terakhir + link → `/account/deposits`.
- **`/account/deposit`** — form nominal (§4).
- **`/account/deposit/[depositId]`** — status QR + polling (§4).
- **`/account/orders`** — `db.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })`, list tanpa pagination (YAGNI — volume awal kecil), tiap baris link ke `/invoice/[orderNumber]` yang **sudah ada** dari Fase 3 (dipakai ulang apa adanya, bukan halaman detail baru).
- **`/account/deposits`** — pola sama, link ke `/account/deposit/[depositId]`.

## 7. Background jobs & testing

**Job baru:** `expire-deposit` di `web/src/lib/jobs/runner.ts`, cermin persis `expire-order` (klaim atomik `PENDING→EXPIRED` kalau lewat `expiredAt`). Tidak ada perubahan di `/api/cron/tick` — `runDueJobs` generik per `job.type`.

**Testing (TDD wajib untuk logic uang, addendum spec utama §15 poin 4):**

Unit test (Vitest):
- Checkout: `userId` ke-attach kalau ada sesi; jalur bayar-saldo sukses (debit + ledger + `PAID`); jalur saldo race/kurang (`FAILED` + error); tolak `paymentMethod: "balance"` tanpa sesi.
- Deposit: validasi nominal (di bawah min, di atas max, custom valid); job `expire-deposit`.
- `fulfillment.ts`: cabang refund member (`REFUNDED` + saldo bertambah + ledger tercatat) vs guest (regresi — `REFUND_PENDING` Fase 3 tidak berubah).
- Webhook deposit: settlement kredit saldo sekali (dedup, kirim payload sama 2x tidak dobel kredit); `failed`/`expired` tidak menyentuh wallet.

Manual E2E (dev server + Playwright MCP, pola Task 13 Fase 3): register → login → deposit → saldo dashboard bertambah → checkout pakai saldo → saldo berkurang + order masuk riwayat → simulasikan fulfillment gagal → auto-refund ke saldo (member) sambil pastikan guest checkout tetap `REFUND_PENDING`.

**Gap yang sudah diketahui dari Fase 3 (bukan hal baru):** kredensial Midtrans sandbox asli masih belum ada — webhook deposit kemungkinan juga perlu disintesis sebagian saat verifikasi manual, sama seperti pola Task 13 Fase 3.
