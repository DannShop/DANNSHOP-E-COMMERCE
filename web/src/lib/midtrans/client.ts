import { z } from "zod";

export interface MidtransCreds {
  serverKey: string;
  isProduction: boolean;
}

function baseUrl(creds: MidtransCreds): string {
  return creds.isProduction ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
}

function authHeader(creds: MidtransCreds): string {
  return `Basic ${Buffer.from(`${creds.serverKey}:`).toString("base64")}`;
}

async function request(url: string, creds: MidtransCreds, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      Authorization: authHeader(creds),
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Midtrans ${url}: response bukan JSON (status ${res.status}): ${text.slice(0, 200)}`);
  }
}

const chargeSchema = z.object({
  status_code: z.string(),
  transaction_id: z.string(),
  order_id: z.string(),
  transaction_status: z.string(),
  qr_string: z.string().nullable().optional(),
  actions: z.array(z.unknown()).optional(),
  expiry_time: z.string().nullable().optional(),
});

export interface MidtransChargeResult {
  transactionId: string;
  orderId: string;
  transactionStatus: string;
  qrString: string | null;
  expiryTime: string | null;
  raw: unknown;
}

export async function chargeQris(
  input: { orderId: string; grossAmount: number },
  creds: MidtransCreds = {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  },
): Promise<MidtransChargeResult> {
  const raw = await request(`${baseUrl(creds)}/v2/charge`, creds, {
    method: "POST",
    body: JSON.stringify({
      payment_type: "qris",
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
    }),
  });
  const parsed = chargeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Midtrans charge: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
  }
  const d = parsed.data;
  return {
    transactionId: d.transaction_id,
    orderId: d.order_id,
    transactionStatus: d.transaction_status,
    qrString: d.qr_string ?? null,
    expiryTime: d.expiry_time ?? null,
    raw,
  };
}

const statusSchema = z.object({
  status_code: z.string(),
  transaction_id: z.string(),
  order_id: z.string(),
  transaction_status: z.string(),
  fraud_status: z.string().nullable().optional(),
  gross_amount: z.string(),
});

export interface MidtransStatusResult {
  transactionId: string;
  orderId: string;
  transactionStatus: string;
  fraudStatus: string | null;
  grossAmount: string;
  statusCode: string;
  raw: unknown;
}

export async function getTransactionStatus(
  orderId: string,
  creds: MidtransCreds = {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  },
): Promise<MidtransStatusResult> {
  const raw = await request(`${baseUrl(creds)}/v2/${orderId}/status`, creds, { method: "GET" });
  const parsed = statusSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Midtrans status: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
  }
  const d = parsed.data;
  return {
    transactionId: d.transaction_id,
    orderId: d.order_id,
    transactionStatus: d.transaction_status,
    fraudStatus: d.fraud_status ?? null,
    grossAmount: d.gross_amount,
    statusCode: d.status_code,
    raw,
  };
}
