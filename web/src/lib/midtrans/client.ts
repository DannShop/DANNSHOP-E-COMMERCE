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

const bankTransferSchema = z.object({
  status_code: z.string(),
  transaction_id: z.string(),
  order_id: z.string(),
  transaction_status: z.string(),
  va_numbers: z.array(z.object({ bank: z.string(), va_number: z.string() })).optional(),
});

export interface BankTransferResult {
  transactionId: string;
  orderId: string;
  transactionStatus: string;
  bank: string;
  vaNumber: string;
  raw: unknown;
}

export async function chargeBankTransfer(
  input: { orderId: string; grossAmount: number; bank: "bca" | "bni" | "bri" | "cimb" },
  creds: MidtransCreds = {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  },
): Promise<BankTransferResult> {
  const raw = await request(`${baseUrl(creds)}/v2/charge`, creds, {
    method: "POST",
    body: JSON.stringify({
      payment_type: "bank_transfer",
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
      bank_transfer: { bank: input.bank },
    }),
  });
  const parsed = bankTransferSchema.safeParse(raw);
  const va = parsed.success ? parsed.data.va_numbers?.[0] : undefined;
  if (!parsed.success || !va) {
    throw new Error(`Midtrans bank_transfer: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
  }
  return {
    transactionId: parsed.data.transaction_id,
    orderId: parsed.data.order_id,
    transactionStatus: parsed.data.transaction_status,
    bank: va.bank,
    vaNumber: va.va_number,
    raw,
  };
}

const permataSchema = z.object({
  status_code: z.string(),
  transaction_id: z.string(),
  order_id: z.string(),
  transaction_status: z.string(),
  permata_va_number: z.string(),
});

export interface PermataResult {
  transactionId: string;
  orderId: string;
  transactionStatus: string;
  vaNumber: string;
  raw: unknown;
}

// Permata TIDAK memakai field bank_transfer sama sekali (beda dari BCA/BNI/
// BRI/CIMB) - request cuma payment_type + transaction_details, dan Midtrans
// otomatis mengartikannya sebagai permintaan Permata VA. Response-nya juga
// field top-level permata_va_number, bukan array va_numbers.
export async function chargePermataVA(
  input: { orderId: string; grossAmount: number },
  creds: MidtransCreds = {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  },
): Promise<PermataResult> {
  const raw = await request(`${baseUrl(creds)}/v2/charge`, creds, {
    method: "POST",
    body: JSON.stringify({
      payment_type: "bank_transfer",
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
    }),
  });
  const parsed = permataSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Midtrans permata: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
  }
  return {
    transactionId: parsed.data.transaction_id,
    orderId: parsed.data.order_id,
    transactionStatus: parsed.data.transaction_status,
    vaNumber: parsed.data.permata_va_number,
    raw,
  };
}

const echannelSchema = z.object({
  status_code: z.string(),
  transaction_id: z.string(),
  order_id: z.string(),
  transaction_status: z.string(),
  bill_key: z.string(),
  biller_code: z.string(),
});

export interface EchannelResult {
  transactionId: string;
  orderId: string;
  transactionStatus: string;
  billerCode: string;
  billKey: string;
  raw: unknown;
}

// Mandiri Bill Payment - payment_type BEDA ("echannel", bukan "bank_transfer")
// dan tidak menghasilkan nomor VA sama sekali, melainkan pasangan
// biller_code + bill_key yang dimasukkan customer lewat ATM/e-banking.
export async function chargeEchannel(
  input: { orderId: string; grossAmount: number },
  creds: MidtransCreds = {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  },
): Promise<EchannelResult> {
  const raw = await request(`${baseUrl(creds)}/v2/charge`, creds, {
    method: "POST",
    body: JSON.stringify({
      payment_type: "echannel",
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
      echannel: { bill_info1: "Pembayaran", bill_info2: "DannShop" },
    }),
  });
  const parsed = echannelSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Midtrans echannel: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
  }
  return {
    transactionId: parsed.data.transaction_id,
    orderId: parsed.data.order_id,
    transactionStatus: parsed.data.transaction_status,
    billerCode: parsed.data.biller_code,
    billKey: parsed.data.bill_key,
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

export type PaymentActions =
  | { kind: "qris"; qrString: string }
  | { kind: "va"; bank: string; vaNumber: string }
  | { kind: "echannel"; billerCode: string; billKey: string };

export async function chargeByMethodCode(
  method: string,
  orderId: string,
  grossAmount: number,
): Promise<{ actions: PaymentActions }> {
  if (method === "qris") {
    const r = await chargeQris({ orderId, grossAmount });
    return { actions: { kind: "qris", qrString: r.qrString ?? "" } };
  }
  if (method === "va_permata") {
    const r = await chargePermataVA({ orderId, grossAmount });
    return { actions: { kind: "va", bank: "permata", vaNumber: r.vaNumber } };
  }
  if (method === "va_mandiri") {
    const r = await chargeEchannel({ orderId, grossAmount });
    return { actions: { kind: "echannel", billerCode: r.billerCode, billKey: r.billKey } };
  }
  if (method.startsWith("va_")) {
    const bank = method.slice(3) as "bca" | "bni" | "bri" | "cimb";
    const r = await chargeBankTransfer({ orderId, grossAmount, bank });
    return { actions: { kind: "va", bank: r.bank, vaNumber: r.vaNumber } };
  }
  throw new Error(`Metode pembayaran tidak dikenali: ${method}`);
}
