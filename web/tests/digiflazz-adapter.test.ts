import { afterEach, describe, expect, it, vi } from "vitest";
import { DigiflazzAdapter } from "@/lib/providers/digiflazz";

const creds = { username: "userX", apiKey: "keyY" };

function mockFetchOnce(json: unknown) {
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("DigiflazzAdapter.fetchPriceList", () => {
  it("POST /price-list dengan cmd prepaid + sign md5(...pricelist), map ke ProviderSkuPrice", async () => {
    const fn = mockFetchOnce({
      data: [
        {
          buyer_sku_code: "ML86", product_name: "86 Diamonds", category: "Games",
          brand: "MOBILE LEGENDS", price: 19750,
          buyer_product_status: true, seller_product_status: true,
        },
        {
          buyer_sku_code: "FF100", product_name: "100 Diamond", category: "Games",
          brand: "FREE FIRE", price: 14000,
          buyer_product_status: true, seller_product_status: false, // seller off → tidak available
        },
      ],
    });

    const adapter = new DigiflazzAdapter(creds);
    const rows = await adapter.fetchPriceList();

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://api.digiflazz.com/v1/price-list");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.cmd).toBe("prepaid");
    expect(body.username).toBe("userX");
    expect(body.sign).toMatch(/^[0-9a-f]{32}$/);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      skuCode: "ML86", productName: "86 Diamonds", category: "Games",
      brand: "MOBILE LEGENDS", costPrice: 19750n, available: true,
    });
    expect(rows[1].available).toBe(false);
  });

  it("response bukan shape yang diharapkan → throw error jelas", async () => {
    mockFetchOnce({ data: { message: "Invalid Signature" } });
    const adapter = new DigiflazzAdapter(creds);
    await expect(adapter.fetchPriceList()).rejects.toThrow(/Digiflazz/);
  });
});

describe("DigiflazzAdapter.fetchBalance", () => {
  it("POST /cek-saldo cmd deposit → bigint", async () => {
    const fn = mockFetchOnce({ data: { deposit: 1_500_000 } });
    const adapter = new DigiflazzAdapter(creds);
    expect(await adapter.fetchBalance()).toBe(1_500_000n);
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.cmd).toBe("deposit");
  });
});

describe("DigiflazzAdapter.createTransaction", () => {
  it("POST /transaction dengan sign md5(user+key+refId), map Pending", async () => {
    const fn = mockFetchOnce({
      data: {
        ref_id: "DS-F2-1", status: "Pending", message: "PROSES", rc: "03",
        sn: "", price: 19750, buyer_last_saldo: 1000000,
      },
    });
    const adapter = new DigiflazzAdapter(creds);
    const result = await adapter.createTransaction({
      skuCode: "ML86", target: "1234567891234", refId: "DS-F2-1",
    });

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://api.digiflazz.com/v1/transaction");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      username: "userX", buyer_sku_code: "ML86", customer_no: "1234567891234", ref_id: "DS-F2-1",
    });
    expect(body.testing).toBeUndefined(); // hanya dikirim kalau diminta

    expect(result.status).toBe("pending");
    expect(result.refId).toBe("DS-F2-1");
    expect(result.costPrice).toBe(19750n);
  });

  it("status Sukses + rc 00 → success dengan SN", async () => {
    mockFetchOnce({
      data: { ref_id: "DS-F2-2", status: "Sukses", message: "OK", rc: "00", sn: "SN123456", price: 19750 },
    });
    const adapter = new DigiflazzAdapter(creds);
    const result = await adapter.createTransaction({ skuCode: "ML86", target: "123", refId: "DS-F2-2" });
    expect(result.status).toBe("success");
    expect(result.sn).toBe("SN123456");
  });

  it("status Gagal → failed, message diteruskan", async () => {
    mockFetchOnce({
      data: { ref_id: "DS-F2-3", status: "Gagal", message: "Saldo tidak cukup", rc: "40", sn: "" },
    });
    const adapter = new DigiflazzAdapter(creds);
    const result = await adapter.createTransaction({ skuCode: "ML86", target: "123", refId: "DS-F2-3" });
    expect(result.status).toBe("failed");
    expect(result.message).toBe("Saldo tidak cukup");
    expect(result.sn).toBeNull();
  });

  it("testing:true ikut terkirim di body", async () => {
    const fn = mockFetchOnce({
      data: { ref_id: "DS-F2-4", status: "Pending", message: "", rc: "03", sn: "" },
    });
    const adapter = new DigiflazzAdapter(creds);
    await adapter.createTransaction({ skuCode: "ML86", target: "123", refId: "DS-F2-4", testing: true });
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.testing).toBe(true);
  });

  it("checkStatus mengirim request identik dengan createTransaction (idempotent by ref_id)", async () => {
    const fn = mockFetchOnce({
      data: { ref_id: "DS-F2-1", status: "Sukses", message: "OK", rc: "00", sn: "SN-AKHIR" },
    });
    const adapter = new DigiflazzAdapter(creds);
    const result = await adapter.checkStatus({ skuCode: "ML86", target: "1234567891234", refId: "DS-F2-1" });
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.ref_id).toBe("DS-F2-1");
    expect(result.status).toBe("success");
    expect(result.sn).toBe("SN-AKHIR");
  });
});

describe("DigiflazzAdapter.parseCallback", () => {
  const { createHmac } = require("node:crypto");
  const secret = "hook-secret";
  const credsWithHook = { ...creds, webhookSecret: secret };
  const bodyObj = {
    data: { ref_id: "DS-F2-1", customer_no: "123", buyer_sku_code: "ML86",
            status: "Sukses", message: "OK", sn: "SN789", rc: "00" },
  };
  const rawBody = JSON.stringify(bodyObj);
  const sig = "sha1=" + createHmac("sha1", secret).update(rawBody).digest("hex");

  it("signature valid → verified true + status ter-map", () => {
    const adapter = new DigiflazzAdapter(credsWithHook);
    const result = adapter.parseCallback({ rawBody, headers: { "x-hub-signature": sig } });
    expect(result).not.toBeNull();
    expect(result!.verified).toBe(true);
    expect(result!.refId).toBe("DS-F2-1");
    expect(result!.status).toBe("success");
    expect(result!.sn).toBe("SN789");
  });

  it("signature salah → verified false (payload tetap ter-parse)", () => {
    const adapter = new DigiflazzAdapter(credsWithHook);
    const result = adapter.parseCallback({
      rawBody, headers: { "x-hub-signature": "sha1=" + "0".repeat(40) },
    });
    expect(result!.verified).toBe(false);
  });

  it("body bukan format Digiflazz → null", () => {
    const adapter = new DigiflazzAdapter(credsWithHook);
    expect(adapter.parseCallback({ rawBody: "{\"halo\":1}", headers: {} })).toBeNull();
    expect(adapter.parseCallback({ rawBody: "bukan json", headers: {} })).toBeNull();
  });
});
