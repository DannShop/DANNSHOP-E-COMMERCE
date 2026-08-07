import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chargeQris,
  getTransactionStatus,
  chargeBankTransfer,
  chargePermataVA,
  chargeEchannel,
  chargeEwallet,
  chargeByMethodCode,
} from "@/lib/midtrans/client";

const creds = { serverKey: "SB-server-key", isProduction: false };

function mockFetchOnce(json: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("chargeQris", () => {
  it("POST ke sandbox /v2/charge dengan Basic Auth + payment_type qris", async () => {
    const fn = mockFetchOnce({
      status_code: "201", transaction_id: "trx-1", order_id: "INV-1",
      transaction_status: "pending", qr_string: "00020101...",
      actions: [{ name: "generate-qr-code", url: "https://x/qr" }],
      expiry_time: "2026-07-26 10:15:00",
    });

    const result = await chargeQris({ orderId: "INV-1", grossAmount: 22000, expiryMinutes: 15 }, creds);

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://api.sandbox.midtrans.com/v2/charge");
    const req = init as RequestInit;
    expect((req.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("SB-server-key:").toString("base64")}`,
    );
    const body = JSON.parse(req.body as string);
    expect(body.payment_type).toBe("qris");
    expect(body.transaction_details).toEqual({ order_id: "INV-1", gross_amount: 22000 });
    expect(body.custom_expiry).toEqual({ expiry_duration: 15, unit: "minute" });

    expect(result.transactionId).toBe("trx-1");
    expect(result.qrString).toBe("00020101...");
    expect(result.transactionStatus).toBe("pending");
  });

  it("pakai base URL production kalau isProduction true", async () => {
    const fn = mockFetchOnce({
      status_code: "201", transaction_id: "t", order_id: "INV-1",
      transaction_status: "pending", qr_string: null, actions: [], expiry_time: null,
    });
    await chargeQris({ orderId: "INV-1", grossAmount: 1000, expiryMinutes: 15 }, { serverKey: "prod-key", isProduction: true });
    expect(fn.mock.calls[0][0]).toBe("https://api.midtrans.com/v2/charge");
  });
});

describe("getTransactionStatus", () => {
  it("GET /v2/{orderId}/status", async () => {
    const fn = mockFetchOnce({
      status_code: "200", transaction_id: "trx-1", order_id: "INV-1",
      transaction_status: "settlement", fraud_status: "accept", gross_amount: "22000.00",
    });
    const result = await getTransactionStatus("INV-1", creds);
    expect(fn.mock.calls[0][0]).toBe("https://api.sandbox.midtrans.com/v2/INV-1/status");
    expect(result.transactionStatus).toBe("settlement");
    expect(result.fraudStatus).toBe("accept");
    expect(result.grossAmount).toBe("22000.00");
  });
});

describe("chargeBankTransfer", () => {
  it("POST /v2/charge dengan payment_type bank_transfer + bank di body", async () => {
    const fn = mockFetchOnce({
      status_code: "201", transaction_id: "trx-va1", order_id: "INV-1",
      transaction_status: "pending", gross_amount: "44000.00", currency: "IDR",
      payment_type: "bank_transfer",
      va_numbers: [{ bank: "bca", va_number: "812785002530231" }],
    });

    const result = await chargeBankTransfer({ orderId: "INV-1", grossAmount: 44000, bank: "bca", expiryMinutes: 15 }, creds);

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://api.sandbox.midtrans.com/v2/charge");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.payment_type).toBe("bank_transfer");
    expect(body.bank_transfer).toEqual({ bank: "bca" });
    expect(body.custom_expiry).toEqual({ expiry_duration: 15, unit: "minute" });

    expect(result.bank).toBe("bca");
    expect(result.vaNumber).toBe("812785002530231");
    expect(result.transactionStatus).toBe("pending");
  });

  it("bekerja untuk bni/bri/cimb dengan bentuk response yang sama", async () => {
    mockFetchOnce({
      status_code: "201", transaction_id: "trx-va2", order_id: "INV-2",
      transaction_status: "pending", gross_amount: "10000.00", currency: "IDR",
      payment_type: "bank_transfer",
      va_numbers: [{ bank: "cimb", va_number: "9998887776665" }],
    });
    const result = await chargeBankTransfer({ orderId: "INV-2", grossAmount: 10000, bank: "cimb", expiryMinutes: 15 }, creds);
    expect(result.vaNumber).toBe("9998887776665");
  });

  it("lempar error kalau va_numbers tidak ada di response", async () => {
    mockFetchOnce({
      status_code: "201", transaction_id: "trx-x", order_id: "INV-1",
      transaction_status: "pending", gross_amount: "1000.00", currency: "IDR", payment_type: "bank_transfer",
    });
    await expect(
      chargeBankTransfer({ orderId: "INV-1", grossAmount: 1000, bank: "bca", expiryMinutes: 15 }, creds),
    ).rejects.toThrow(/Midtrans bank_transfer: response tidak sesuai/);
  });
});

describe("chargePermataVA", () => {
  it("POST /v2/charge TANPA field bank_transfer, baca permata_va_number", async () => {
    const fn = mockFetchOnce({
      status_code: "201", transaction_id: "trx-permata", order_id: "INV-3",
      transaction_status: "pending", gross_amount: "44000.00", currency: "IDR",
      payment_type: "bank_transfer",
      permata_va_number: "850003072869607",
    });

    const result = await chargePermataVA({ orderId: "INV-3", grossAmount: 44000, expiryMinutes: 15 }, creds);

    const [, init] = fn.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.payment_type).toBe("bank_transfer");
    expect(body.bank_transfer).toBeUndefined();
    expect(body.custom_expiry).toEqual({ expiry_duration: 15, unit: "minute" });

    expect(result.vaNumber).toBe("850003072869607");
  });
});

describe("chargeEchannel", () => {
  it("POST /v2/charge dengan payment_type echannel, baca bill_key + biller_code", async () => {
    const fn = mockFetchOnce({
      status_code: "201", transaction_id: "trx-mandiri", order_id: "INV-4",
      transaction_status: "pending", gross_amount: "44000.00", currency: "IDR",
      payment_type: "echannel",
      bill_key: "778347787706",
      biller_code: "70012",
    });

    const result = await chargeEchannel({ orderId: "INV-4", grossAmount: 44000, expiryMinutes: 15 }, creds);

    const [, init] = fn.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.payment_type).toBe("echannel");
    expect(body.transaction_details).toEqual({ order_id: "INV-4", gross_amount: 44000 });
    expect(body.custom_expiry).toEqual({ expiry_duration: 15, unit: "minute" });

    expect(result.billKey).toBe("778347787706");
    expect(result.billerCode).toBe("70012");
  });
});

describe("chargeEwallet", () => {
  it("GoPay: mencari action berdasarkan name, bukan indeks array", async () => {
    // Urutan action SENGAJA dibalik dari urutan "wajar" (deeplink duluan,
    // baru QR) - kalau parser mengandalkan actions[0]/actions[1], test ini gagal.
    mockFetchOnce({
      status_code: "201", transaction_id: "trx-gopay", order_id: "INV-5",
      transaction_status: "pending",
      actions: [
        { name: "get-status", method: "GET", url: "https://x/status" },
        { name: "deeplink-redirect", method: "GET", url: "https://gojek/pay/x" },
        { name: "generate-qr-code", method: "GET", url: "https://x/qr.png" },
        { name: "cancel", method: "POST", url: "https://x/cancel" },
      ],
    });

    const result = await chargeEwallet({ orderId: "INV-5", grossAmount: 22000, provider: "gopay", expiryMinutes: 15 }, creds);

    expect(result.deeplink).toBe("https://gojek/pay/x");
    expect(result.qrUrl).toBe("https://x/qr.png");
  });

  it("ShopeePay: tanpa generate-qr-code, qrUrl null (bukan error)", async () => {
    mockFetchOnce({
      status_code: "201", transaction_id: "trx-shopee", order_id: "INV-6",
      transaction_status: "pending",
      actions: [{ name: "deeplink-redirect", method: "GET", url: "https://shopee/pay/y" }],
    });

    const result = await chargeEwallet({ orderId: "INV-6", grossAmount: 22000, provider: "shopeepay", expiryMinutes: 15 }, creds);

    expect(result.deeplink).toBe("https://shopee/pay/y");
    expect(result.qrUrl).toBeNull();
  });

  it("melempar error kalau deeplink-redirect tidak ada di response", async () => {
    mockFetchOnce({
      status_code: "201", transaction_id: "trx-x", order_id: "INV-7",
      transaction_status: "pending",
      actions: [{ name: "generate-qr-code", method: "GET", url: "https://x/qr.png" }],
    });

    await expect(
      chargeEwallet({ orderId: "INV-7", grossAmount: 22000, provider: "gopay", expiryMinutes: 15 }, creds),
    ).rejects.toThrow(/deeplink-redirect/);
  });

  it("body request memakai payment_type sesuai provider", async () => {
    const fn = mockFetchOnce({
      status_code: "201", transaction_id: "trx-x", order_id: "INV-8",
      transaction_status: "pending",
      actions: [{ name: "deeplink-redirect", method: "GET", url: "https://x" }],
    });
    await chargeEwallet({ orderId: "INV-8", grossAmount: 22000, provider: "shopeepay", expiryMinutes: 15 }, creds);
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.payment_type).toBe("shopeepay");
  });
});

describe("chargeByMethodCode", () => {
  it("ewallet_gopay dan ewallet_shopeepay dipetakan ke chargeEwallet dengan provider yang benar", async () => {
    mockFetchOnce({
      status_code: "201", transaction_id: "trx-x", order_id: "INV-9",
      transaction_status: "pending",
      actions: [{ name: "deeplink-redirect", method: "GET", url: "https://gojek/x" }],
    });
    const { actions } = await chargeByMethodCode("ewallet_gopay", "INV-9", 22000, 15, creds);
    expect(actions).toEqual({ kind: "ewallet", provider: "gopay", deeplink: "https://gojek/x", qrUrl: null });
  });

  it("method tidak dikenal melempar error", async () => {
    await expect(chargeByMethodCode("dompet-misterius", "INV-10", 22000, 15, creds)).rejects.toThrow(
      /tidak dikenali/,
    );
  });
});
