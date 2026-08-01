import { afterEach, describe, expect, it, vi } from "vitest";
import { chargeQris, getTransactionStatus, createSnapTransaction } from "@/lib/midtrans/client";

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
