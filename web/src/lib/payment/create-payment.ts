import { chargeByMethodCode, createSnapTransaction, type PaymentActions } from "@/lib/midtrans/client";
import { getMidtransRuntime } from "@/lib/payment/gateway-config";

// Satu-satunya titik yang memutuskan Core API vs Snap. Checkout dan deposit
// sama-sama lewat sini, jadi mustahil ada jalur uang yang ketinggalan saat
// admin memindahkan toggle - persis kesalahan yang dulu terjadi ketika tiap
// pemanggil punya salinan logika charge-nya sendiri.
//
// Yang SENGAJA tidak berubah antar mode:
//   - order_id     : sama persis (Order.orderNumber / Deposit.id)
//   - gross_amount : sama persis, sudah termasuk fee metode + kode unik
//   - expiry       : dari PaymentMethodConfig.expiryMinutes yang sama
// Karena ketiganya identik, webhook, GET status, settlement, dan job expire
// tidak perlu tahu-menahu soal mode integrasi. Snap hanya mengubah CARA
// pembeli membayar, bukan apa yang ditagih atau bagaimana kita membacanya.
export async function createPaymentActions(input: {
  methodCode: string;
  orderId: string;
  grossAmount: number;
  expiryMinutes: number;
}): Promise<PaymentActions> {
  const { creds, mode } = await getMidtransRuntime();

  if (mode === "snap") {
    const snap = await createSnapTransaction(
      {
        orderId: input.orderId,
        grossAmount: input.grossAmount,
        methodCode: input.methodCode,
        expiryMinutes: input.expiryMinutes,
      },
      creds,
    );
    return { kind: "snap", token: snap.token, redirectUrl: snap.redirectUrl, method: input.methodCode };
  }

  const { actions } = await chargeByMethodCode(
    input.methodCode,
    input.orderId,
    input.grossAmount,
    input.expiryMinutes,
    creds,
  );
  return actions;
}
