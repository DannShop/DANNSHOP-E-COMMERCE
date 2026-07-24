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
