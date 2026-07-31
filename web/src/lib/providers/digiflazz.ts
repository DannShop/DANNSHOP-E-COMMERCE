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

const trxDataSchema = z.object({
  ref_id: z.string(),
  status: z.string(),          // "Pending" | "Sukses" | "Gagal"
  message: z.string().optional().default(""),
  rc: z.string().optional().default(""),
  sn: z.string().optional().default(""),
  price: z.number().optional(),
});
const trxSchema = z.object({ data: trxDataSchema });

const callbackSchema = z.object({ data: trxDataSchema.omit({ price: true }).extend({ price: z.number().optional() }) });

// Mapping status Digiflazz → TrxStatus internal (spec §5.2: rc 00 sukses, 03 pending)
function mapTrxStatus(status: string, rc: string): "success" | "pending" | "failed" {
  if (status === "Sukses" || rc === "00") return "success";
  if (status === "Pending" || rc === "03") return "pending";
  return "failed";
}

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
      signal: AbortSignal.timeout(15_000),
    });
    // Digiflazz membalas error dalam body JSON (bukan selalu non-200) — parse dulu, validasi di caller.
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Digiflazz ${path}: response bukan JSON (status ${res.status}): ${text.slice(0, 200)}`);
    }
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
      throw new Error("Digiflazz cek-saldo: response tidak sesuai skema yang diharapkan");
    }
    return BigInt(Math.round(parsed.data.data.deposit));
  }

  async createTransaction(input: CreateTrxInput): Promise<ProviderTrxResult> {
    const body: Record<string, unknown> = {
      username: this.creds.username,
      buyer_sku_code: input.skuCode,
      customer_no: input.target,
      ref_id: input.refId,
      sign: digiflazzSign(this.creds.username, this.creds.apiKey, input.refId),
    };
    if (input.testing) body.testing = true;

    const raw = await this.post("/transaction", body);
    const parsed = trxSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Digiflazz transaction: response tidak sesuai skema yang diharapkan");
    }
    const d = parsed.data.data;
    return {
      refId: d.ref_id,
      status: mapTrxStatus(d.status, d.rc),
      sn: d.sn ? d.sn : null,
      message: d.message,
      costPrice: d.price !== undefined ? BigInt(Math.round(d.price)) : null,
      raw,
    };
  }

  async checkStatus(input: CreateTrxInput): Promise<ProviderTrxResult> {
    return this.createTransaction(input);
  }

  parseCallback(input: { rawBody: string; headers: Record<string, string> }): CallbackResult | null {
    let json: unknown;
    try {
      json = JSON.parse(input.rawBody);
    } catch {
      return null;
    }
    const parsed = callbackSchema.safeParse(json);
    if (!parsed.success) return null;

    // Cari header case-insensitive
    const sigHeader = Object.entries(input.headers).find(
      ([k]) => k.toLowerCase() === "x-hub-signature",
    )?.[1];

    const verified = this.creds.webhookSecret
      ? verifyDigiflazzWebhookSignature(input.rawBody, this.creds.webhookSecret, sigHeader)
      : false;

    const d = parsed.data.data;
    return {
      refId: d.ref_id,
      status: mapTrxStatus(d.status, d.rc),
      sn: d.sn ? d.sn : null,
      message: d.message,
      verified,
      raw: json,
    };
  }
}
