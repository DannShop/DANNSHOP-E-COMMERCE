import { z } from "zod";
import { digiflazzSign, verifyDigiflazzWebhookSignature } from "./digiflazz-sign";
import type {
  CallbackResult, CreateTrxInput, ProviderSkuPrice, ProviderTrxResult,
  TopupProviderAdapter,
} from "./types";

export interface DigiflazzCredentials {
  username: string;
  apiKey: string;
  webhookSecret?: string;
}

// Shape row price-list prepaid — TERVERIFIKASI dari developer.digiflazz.com (spec §5.2)
const priceRowSchema = z.object({
  buyer_sku_code: z.string(),
  product_name: z.string(),
  category: z.string(),
  brand: z.string(),
  price: z.number(),
  buyer_product_status: z.boolean(),
  seller_product_status: z.boolean(),
});

const priceListSchema = z.object({ data: z.array(priceRowSchema) });
const balanceSchema = z.object({ data: z.object({ deposit: z.number() }) });

const BASE_URL = "https://api.digiflazz.com/v1";

export class DigiflazzAdapter implements TopupProviderAdapter {
  readonly key = "digiflazz" as const;

  constructor(
    private creds: DigiflazzCredentials,
    private baseUrl: string = BASE_URL,
  ) {}

  private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    // Digiflazz membalas error dalam body JSON (bukan selalu non-200) — parse dulu, validasi di caller.
    return res.json();
  }

  async fetchPriceList(): Promise<ProviderSkuPrice[]> {
    const raw = await this.post("/price-list", {
      cmd: "prepaid",
      username: this.creds.username,
      sign: digiflazzSign(this.creds.username, this.creds.apiKey, "pricelist"),
    });
    const parsed = priceListSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Digiflazz price-list: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
    }
    return parsed.data.data.map((r) => ({
      skuCode: r.buyer_sku_code,
      productName: r.product_name,
      category: r.category,
      brand: r.brand,
      costPrice: BigInt(Math.round(r.price)),
      available: r.buyer_product_status && r.seller_product_status,
    }));
  }

  async fetchBalance(): Promise<bigint> {
    const raw = await this.post("/cek-saldo", {
      cmd: "deposit",
      username: this.creds.username,
      sign: digiflazzSign(this.creds.username, this.creds.apiKey, "depo"),
    });
    const parsed = balanceSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Digiflazz cek-saldo: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
    }
    return BigInt(Math.round(parsed.data.data.deposit));
  }

  async createTransaction(_input: CreateTrxInput): Promise<ProviderTrxResult> {
    throw new Error("belum diimplementasi (Task 4)");
  }

  async checkStatus(_input: CreateTrxInput): Promise<ProviderTrxResult> {
    throw new Error("belum diimplementasi (Task 4)");
  }

  parseCallback(_input: { rawBody: string; headers: Record<string, string> }): CallbackResult | null {
    throw new Error("belum diimplementasi (Task 5)");
  }
}
