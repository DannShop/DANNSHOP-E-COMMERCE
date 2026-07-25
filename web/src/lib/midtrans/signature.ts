import { createHash } from "node:crypto";

export function computeMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
): string {
  return createHash("sha512").update(orderId + statusCode + grossAmount + serverKey).digest("hex");
}

export function verifyMidtransSignature(
  notif: { order_id: string; status_code: string; gross_amount: string; signature_key: string },
  serverKey: string,
): boolean {
  const expected = computeMidtransSignature(notif.order_id, notif.status_code, notif.gross_amount, serverKey);
  return expected === notif.signature_key;
}
