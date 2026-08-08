import { z } from "zod";
import { digiflazzSign, verifyDigiflazzWebhookSignature } from "./digiflazz-sign";
import {
  noopProviderApiLogger, redactProviderRequest,
  type ProviderApiLogger, type ProviderApiOutcome,
} from "./api-log";
import type {
  CallbackResult, CreateTrxInput, ProviderCallContext, ProviderSkuPrice, ProviderTrxResult,
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

// Menentukan "panggilan ini sebenarnya berhasil atau tidak" dari respons mentah.
//
// TIDAK BISA pakai status HTTP: Digiflazz membalas 200 untuk penolakan (IP belum
// di-whitelist, signature salah, saldo kurang) — persis jebakan yang sama seperti
// Midtrans. Yang menentukan adalah `data.rc` di dalam body.
export function classifyDigiflazzResponse(json: unknown): {
  outcome: ProviderApiOutcome;
  rc: string | null;
  message: string | null;
} {
  const data = (json as { data?: unknown } | null | undefined)?.data;

  // /price-list sukses membalas `data: [...]` (array baris SKU), bukan objek.
  if (Array.isArray(data)) return { outcome: "SUCCESS", rc: null, message: null };
  if (data === null || typeof data !== "object") {
    return { outcome: "INVALID_RESPONSE", rc: null, message: null };
  }

  const d = data as Record<string, unknown>;
  const rc = typeof d.rc === "string" ? d.rc : null;
  const message = typeof d.message === "string" ? d.message : null;
  const status = typeof d.status === "string" ? d.status : null;

  if (rc === null) {
    // /cek-saldo yang sukses membalas `data: { deposit }` tanpa rc sama sekali.
    // Objek tanpa rc DAN tanpa deposit = bentuk error Digiflazz (mis.
    // `{ data: { message: "Invalid Signature" } }`), bukan keberhasilan.
    return { outcome: "deposit" in d ? "SUCCESS" : "REJECTED", rc, message };
  }
  if (rc === "00" || status === "Sukses") return { outcome: "SUCCESS", rc, message };
  if (rc === "03" || status === "Pending") return { outcome: "PENDING", rc, message };
  return { outcome: "REJECTED", rc, message };
}

export class DigiflazzAdapter implements TopupProviderAdapter {
  readonly key = "digiflazz" as const;

  private baseUrl: string;
  private log: ProviderApiLogger;

  // Logger disuntik (bukan di-import langsung) supaya adapter tetap bisa dipakai
  // tanpa database — test dan skrip one-off memakai default no-op, sementara
  // registry.getAdapter menyuntikkan penulis DB yang sesungguhnya.
  constructor(
    private creds: DigiflazzCredentials,
    options?: { baseUrl?: string; log?: ProviderApiLogger },
  ) {
    this.baseUrl = options?.baseUrl ?? BASE_URL;
    this.log = options?.log ?? noopProviderApiLogger;
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
    meta: { operation: string; context?: ProviderCallContext },
  ): Promise<unknown> {
    const startedAt = Date.now();
    const endpoint = `${this.baseUrl}${path}`;
    let httpStatus: number | null = null;
    let parsed: unknown;
    let responseText: string | null = null;
    let outcome: ProviderApiOutcome = "TRANSPORT_ERROR";
    let providerRc: string | null = null;
    let message: string | null = null;
    let errorMessage: string | null = null;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      httpStatus = res.status;
      // Digiflazz membalas error dalam body JSON (bukan selalu non-200) — parse dulu, validasi di caller.
      const text = await res.text();
      try {
        parsed = JSON.parse(text);
      } catch {
        // Body mentah disimpan apa adanya: halaman error HTML dari WAF/proxy di
        // depan provider justru sering memuat sebab sebenarnya (IP diblokir,
        // rate limit) yang tidak muncul di mana pun lagi.
        outcome = "INVALID_RESPONSE";
        responseText = text;
        errorMessage = `Respons bukan JSON (status ${res.status})`;
        throw new Error(`Digiflazz ${path}: response bukan JSON (status ${res.status}): ${text.slice(0, 200)}`);
      }
      const classified = classifyDigiflazzResponse(parsed);
      outcome = classified.outcome;
      providerRc = classified.rc;
      message = classified.message;
      return parsed;
    } catch (e) {
      // errorMessage yang sudah diisi di atas lebih spesifik — jangan ditimpa.
      errorMessage ??= e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      // Dicatat di `finally` supaya jalur yang MELEMPAR (timeout, DNS, non-JSON)
      // ikut tersimpan — justru jalur itulah yang sebelumnya tidak meninggalkan
      // jejak apa pun selain satu baris console.error yang hilang saat redeploy.
      await this.log({
        provider: "DIGIFLAZZ",
        operation: meta.operation,
        endpoint,
        outcome,
        httpStatus,
        durationMs: Date.now() - startedAt,
        requestBody: redactProviderRequest(body),
        responseBody: parsed,
        responseText,
        providerRc,
        message,
        errorMessage,
        context: meta.context,
      });
    }
  }

  async fetchPriceList(): Promise<ProviderSkuPrice[]> {
    const raw = await this.post(
      "/price-list",
      {
        cmd: "prepaid",
        username: this.creds.username,
        sign: digiflazzSign(this.creds.username, this.creds.apiKey, "pricelist"),
      },
      { operation: "price-list" },
    );
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
    const raw = await this.post(
      "/cek-saldo",
      {
        cmd: "deposit",
        username: this.creds.username,
        sign: digiflazzSign(this.creds.username, this.creds.apiKey, "depo"),
      },
      { operation: "cek-saldo" },
    );
    const parsed = balanceSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Digiflazz cek-saldo: response tidak sesuai skema yang diharapkan");
    }
    return BigInt(Math.round(parsed.data.data.deposit));
  }

  async createTransaction(input: CreateTrxInput): Promise<ProviderTrxResult> {
    return this.sendTrx(input, "transaction");
  }

  // Badan bersama createTransaction & checkStatus: request-nya identik (cek status
  // = kirim ulang transaksi yang sama, idempotent by ref_id). Dipisah hanya supaya
  // log bisa membedakan "pengiriman awal" dari "cek status ulang" — dua-duanya
  // muncul sebagai POST /transaction yang sama persis di riwayat.
  private async sendTrx(input: CreateTrxInput, operation: "transaction" | "check-status"): Promise<ProviderTrxResult> {
    const body: Record<string, unknown> = {
      username: this.creds.username,
      buyer_sku_code: input.skuCode,
      customer_no: input.target,
      ref_id: input.refId,
      sign: digiflazzSign(this.creds.username, this.creds.apiKey, input.refId),
    };
    if (input.testing) body.testing = true;

    const raw = await this.post("/transaction", body, {
      operation,
      context: { ourRefId: input.refId, ...input.context },
    });
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
    return this.sendTrx(input, "check-status");
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
