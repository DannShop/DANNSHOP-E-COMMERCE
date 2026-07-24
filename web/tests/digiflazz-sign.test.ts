import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { digiflazzSign, verifyDigiflazzWebhookSignature } from "@/lib/providers/digiflazz-sign";

describe("digiflazzSign", () => {
  it("md5(username + apiKey + salt) sesuai docs", () => {
    const expected = createHash("md5").update("userXkeyYpricelist").digest("hex");
    expect(digiflazzSign("userX", "keyY", "pricelist")).toBe(expected);
  });
});

describe("verifyDigiflazzWebhookSignature", () => {
  const secret = "webhook-secret";
  const body = JSON.stringify({ data: { ref_id: "DS-1" } });
  const goodSig = "sha1=" + createHmac("sha1", secret).update(body).digest("hex");

  it("signature benar → true", () => {
    expect(verifyDigiflazzWebhookSignature(body, secret, goodSig)).toBe(true);
  });

  it("signature salah → false", () => {
    expect(verifyDigiflazzWebhookSignature(body, secret, "sha1=" + "0".repeat(40))).toBe(false);
  });

  it("header hilang / format aneh → false", () => {
    expect(verifyDigiflazzWebhookSignature(body, secret, undefined)).toBe(false);
    expect(verifyDigiflazzWebhookSignature(body, secret, "bukan-format")).toBe(false);
  });
});
