import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeMidtransSignature, verifyMidtransSignature } from "@/lib/midtrans/signature";

describe("computeMidtransSignature", () => {
  it("sha512(order_id + status_code + gross_amount + serverKey)", () => {
    const expected = createHash("sha512").update("INV-1" + "200" + "22000.00" + "SB-key").digest("hex");
    expect(computeMidtransSignature("INV-1", "200", "22000.00", "SB-key")).toBe(expected);
  });
});

describe("verifyMidtransSignature", () => {
  const serverKey = "SB-key";
  const raw = { order_id: "INV-1", status_code: "200", gross_amount: "22000.00" };
  const validSig = computeMidtransSignature(raw.order_id, raw.status_code, raw.gross_amount, serverKey);

  it("signature cocok → true", () => {
    expect(verifyMidtransSignature({ ...raw, signature_key: validSig }, serverKey)).toBe(true);
  });

  it("signature tidak cocok → false", () => {
    expect(verifyMidtransSignature({ ...raw, signature_key: "salah" }, serverKey)).toBe(false);
  });
});
