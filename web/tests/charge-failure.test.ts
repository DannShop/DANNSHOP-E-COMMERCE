import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { reportChargeFailure } from "@/lib/payment/charge-failure";
import { MidtransApiError } from "@/lib/midtrans/client";

function midtransError(httpStatus: number, statusCode: number, statusMessage: string) {
  return new MidtransApiError({
    endpoint: "https://api.midtrans.com/v2/charge",
    httpStatus,
    statusCode,
    statusMessage,
    errorMessages: [],
    raw: {},
  });
}

const ctx = { scope: "checkout" as const, refId: "INV-20260808-0001", method: "qris" };

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("reportChargeFailure", () => {
  it("kegagalan konfigurasi TIDAK menyuruh pembeli mencoba lagi", () => {
    // Inti bug 2026-08-08: key sandbox di mode production. Mengulang checkout
    // hanya menghasilkan order FAILED beruntun - pesannya harus mengarahkan ke
    // metode lain / CS, bukan ke tombol coba lagi.
    const { buyerMessage, failure } = reportChargeFailure(
      ctx,
      midtransError(401, 401, "Unknown Merchant server_key/id"),
    );
    expect(failure.kind).toBe("config");
    expect(buyerMessage).not.toMatch(/coba lagi/i);
    expect(buyerMessage).toMatch(/metode lain|CS/i);
  });

  it("gangguan sesaat tetap menyuruh coba lagi", () => {
    const { buyerMessage, failure } = reportChargeFailure(ctx, midtransError(500, 500, "internal error"));
    expect(failure.kind).toBe("transient");
    expect(buyerMessage).toMatch(/coba lagi/i);
  });

  it("failure yang dikembalikan aman disimpan sebagai JSON dan memuat alasan lengkap", () => {
    const { failure } = reportChargeFailure(ctx, midtransError(401, 401, "Unknown Merchant server_key/id"));
    const roundTripped = JSON.parse(JSON.stringify(failure));
    expect(roundTripped.statusMessage).toBe("Unknown Merchant server_key/id");
    expect(roundTripped.httpStatus).toBe(401);
    expect(typeof roundTripped.at).toBe("string");
    // Tidak boleh ada jejak kredensial di kolom yang dibaca admin.
    expect(JSON.stringify(roundTripped)).not.toMatch(/Mid-server-|SB-Mid-server-|Basic /);
  });

  it("mencatat alasan ke log dengan status yang bisa dibaca, bukan objek Error mentah", () => {
    reportChargeFailure(ctx, midtransError(402, 402, "Merchant cannot use this feature."));
    expect(console.error).toHaveBeenCalledWith(
      "checkout: charge Midtrans gagal",
      expect.objectContaining({ kind: "config", statusCode: 402, refId: "INV-20260808-0001", method: "qris" }),
    );
  });
});
