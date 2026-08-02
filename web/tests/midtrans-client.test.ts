import { afterEach, describe, expect, it, vi } from "vitest";
import { chargeQris, getTransactionStatus, chargeBankTransfer, chargePermataVA, chargeEchannel, createSnapTransaction } from "@/lib/midtrans/client";

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

    const result = await chargeQris({ orderId: "INV-1", grossAmount: 22000 }, creds);

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://api.sandbox.midtrans.com/v2/charge");
    const req = init as RequestInit;
    expect((req.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("SB-server-key:").toString("base64")}`,
    );
    const body = JSON.parse(req.body as string);
    expect(body.payment_type).toBe("qris");
    expect(body.transaction_details).toEqual({ order_id: "INV-1", gross_amount: 22000 });

    expect(result.transactionId).toBe("trx-1");
    expect(result.qrString).toBe("00020101...");
    expect(result.transactionStatus).toBe("pending");
  });

  it("pakai base URL production kalau isProduction true", async () => {
    const fn = mockFetchOnce({
      status_code: "201", transaction_id: "t", order_id: "INV-1",
      transaction_status: "pending", qr_string: null, actions: [], expiry_time: null,
    });
    await chargeQris({ orderId: "INV-1", grossAmount: 1000 }, { serverKey: "prod-key", isProduction: true });
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

describe("createSnapTransaction", () => {
  it("POST ke /snap/v1/transactions dengan Basic Auth, tanpa payment_type", async () => {
    const fn = mockFetchOnce({
      token: "snap-token-abc",
      redirect_url: "https://app.sandbox.midtrans.com/snap/v3/redirection/snap-token-abc",
    });

    const result = await createSnapTransaction({ orderId: "INV-1", grossAmount: 22000 }, creds);

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://app.sandbox.midtrans.com/snap/v1/transactions");
    const req = init as RequestInit;
    expect((req.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("SB-server-key:").toString("base64")}`,
    );
    const body = JSON.parse(req.body as string);
    expect(body.payment_type).toBeUndefined();
    expect(body.transaction_details).toEqual({ order_id: "INV-1", gross_amount: 22000 });

    expect(result.token).toBe("snap-token-abc");
    expect(result.redirectUrl).toBe("https://app.sandbox.midtrans.com/snap/v3/redirection/snap-token-abc");
  });

  it("pakai base URL production kalau isProduction true", async () => {
    const fn = mockFetchOnce({ token: "t", redirect_url: "https://app.midtrans.com/snap/v3/redirection/t" });
    await createSnapTransaction({ orderId: "INV-1", grossAmount: 1000 }, { serverKey: "prod-key", isProduction: true });
    expect(fn.mock.calls[0][0]).toBe("https://app.midtrans.com/snap/v1/transactions");
  });

  it("lempar error kalau response tidak sesuai skema", async () => {
    mockFetchOnce({ error_messages: ["invalid"] });
    await expect(createSnapTransaction({ orderId: "INV-1", grossAmount: 1000 }, creds)).rejects.toThrow(
      /Snap transaction: response tidak sesuai/,
    );
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

    const result = await chargeBankTransfer({ orderId: "INV-1", grossAmount: 44000, bank: "bca" }, creds);

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://api.sandbox.midtrans.com/v2/charge");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.payment_type).toBe("bank_transfer");
    expect(body.bank_transfer).toEqual({ bank: "bca" });

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
    const result = await chargeBankTransfer({ orderId: "INV-2", grossAmount: 10000, bank: "cimb" }, creds);
    expect(result.vaNumber).toBe("9998887776665");
  });

  it("lempar error kalau va_numbers tidak ada di response", async () => {
    mockFetchOnce({
      status_code: "201", transaction_id: "trx-x", order_id: "INV-1",
      transaction_status: "pending", gross_amount: "1000.00", currency: "IDR", payment_type: "bank_transfer",
    });
    await expect(chargeBankTransfer({ orderId: "INV-1", grossAmount: 1000, bank: "bca" }, creds)).rejects.toThrow(
      /Midtrans bank_transfer: response tidak sesuai/,
    );
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

    const result = await chargePermataVA({ orderId: "INV-3", grossAmount: 44000 }, creds);

    const [, init] = fn.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.payment_type).toBe("bank_transfer");
    expect(body.bank_transfer).toBeUndefined();

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

    const result = await chargeEchannel({ orderId: "INV-4", grossAmount: 44000 }, creds);

    const [, init] = fn.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.payment_type).toBe("echannel");
    expect(body.transaction_details).toEqual({ order_id: "INV-4", gross_amount: 44000 });

    expect(result.billKey).toBe("778347787706");
    expect(result.billerCode).toBe("70012");
  });
});
