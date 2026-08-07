import { z } from "zod";

export interface MidtransCreds {
  serverKey: string;
  isProduction: boolean;
}

// CATATAN PENTING: fungsi-fungsi di file ini SENGAJA tidak punya nilai default
// `process.env.MIDTRANS_SERVER_KEY` untuk parameter `creds`. Kredensial wajib
// dipasok pemanggil lewat getMidtransCreds() di lib/payment/gateway-config.ts,
// yang membaca konfigurasi panel admin (terenkripsi di DB) dengan env sebagai
// fallback. Kalau default env dibiarkan hidup di sini, satu pemanggil yang lupa
// diperbarui akan diam-diam memakai key yang BERBEDA dari yang dipasang admin -
// gejalanya cuma "pembayaran tidak terbaca", tanpa error yang kelihatan. Tanpa
// default, TypeScript yang menolak, bukan production yang gagal senyap.

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
  // Dulu `z.array(z.unknown())` - isinya ditangkap lalu dibuang. Padahal di
  // sinilah URL gambar QR resmi Midtrans berada, dan URL itu yang diminta
  // simulator sandbox (simulator tidak menerima data URI hasil render sendiri).
  actions: z.array(z.object({ name: z.string(), method: z.string().optional(), url: z.string() })).optional(),
  expiry_time: z.string().nullable().optional(),
});

export interface MidtransChargeResult {
  transactionId: string;
  orderId: string;
  transactionStatus: string;
  qrString: string | null;
  /** URL gambar QR yang di-host Midtrans. Dipakai untuk simulator sandbox & cadangan. */
  qrUrl: string | null;
  expiryTime: string | null;
  raw: unknown;
}

// custom_expiry menyamakan jam kadaluarsa DI SISI MIDTRANS dengan job lokal
// expire-order/expire-deposit (PaymentMethodConfig.expiryMinutes) - tanpa ini,
// VA/echannel Midtrans defaultnya baru expired ~24 jam kemudian sementara
// order/deposit lokal sudah EXPIRED jauh lebih awal, jadi customer masih bisa
// transfer nyata ke VA yang "sudah kadaluarsa" di app tapi masih hidup di
// Midtrans - saldo/fulfillment tidak pernah otomatis diproses.
//
// Didukung untuk bank_transfer, echannel, qris, gopay, dan shopeepay. Batas
// bawah 15 menit bukan angka karangan: scheduler expiry Midtrans hanya andal
// untuk durasi >= 15 menit (lihat MIN_EXPIRY_MINUTES di lib/payment/rules.ts,
// tempat validasinya ditegakkan sebelum angka sampai ke sini).
function customExpiry(expiryMinutes: number) {
  return { custom_expiry: { expiry_duration: expiryMinutes, unit: "minute" } };
}

export async function chargeQris(
  input: { orderId: string; grossAmount: number; expiryMinutes: number },
  creds: MidtransCreds,
): Promise<MidtransChargeResult> {
  const raw = await request(`${baseUrl(creds)}/v2/charge`, creds, {
    method: "POST",
    body: JSON.stringify({
      payment_type: "qris",
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
      ...customExpiry(input.expiryMinutes),
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
    qrUrl: findAction(d.actions ?? [], "generate-qr-code"),
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
  input: { orderId: string; grossAmount: number; bank: "bca" | "bni" | "bri" | "cimb"; expiryMinutes: number },
  creds: MidtransCreds,
): Promise<BankTransferResult> {
  const raw = await request(`${baseUrl(creds)}/v2/charge`, creds, {
    method: "POST",
    body: JSON.stringify({
      payment_type: "bank_transfer",
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
      bank_transfer: { bank: input.bank },
      ...customExpiry(input.expiryMinutes),
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
  input: { orderId: string; grossAmount: number; expiryMinutes: number },
  creds: MidtransCreds,
): Promise<PermataResult> {
  const raw = await request(`${baseUrl(creds)}/v2/charge`, creds, {
    method: "POST",
    body: JSON.stringify({
      payment_type: "bank_transfer",
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
      ...customExpiry(input.expiryMinutes),
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
  input: { orderId: string; grossAmount: number; expiryMinutes: number },
  creds: MidtransCreds,
): Promise<EchannelResult> {
  const raw = await request(`${baseUrl(creds)}/v2/charge`, creds, {
    method: "POST",
    body: JSON.stringify({
      payment_type: "echannel",
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
      echannel: { bill_info1: "Pembayaran", bill_info2: "DannShop" },
      ...customExpiry(input.expiryMinutes),
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

// ===== E-wallet (GoPay & ShopeePay) =====

const ewalletSchema = z.object({
  status_code: z.string(),
  transaction_id: z.string(),
  order_id: z.string(),
  transaction_status: z.string(),
  actions: z.array(z.object({ name: z.string(), method: z.string().optional(), url: z.string() })),
});

export type EwalletProvider = "gopay" | "shopeepay";

export interface EwalletResult {
  transactionId: string;
  orderId: string;
  transactionStatus: string;
  provider: EwalletProvider;
  deeplink: string;
  /** URL gambar QR dari Midtrans. GoPay menyediakannya, ShopeePay tidak. */
  qrUrl: string | null;
  raw: unknown;
}

// Response e-wallet berbentuk array `actions` (beda dari VA yang memberi nomor
// langsung). Action DICARI BERDASARKAN `name`, bukan indeks array - urutan
// elemennya tidak dijamin Midtrans, dan GoPay mengembalikan lebih banyak action
// (generate-qr-code, deeplink-redirect, get-status, cancel) daripada ShopeePay
// (deeplink-redirect saja). Mengandalkan actions[0] akan pecah begitu Midtrans
// menyisipkan action baru.
function findAction(actions: { name: string; url: string }[], name: string): string | null {
  return actions.find((a) => a.name === name)?.url ?? null;
}

export async function chargeEwallet(
  input: { orderId: string; grossAmount: number; provider: EwalletProvider; expiryMinutes: number },
  creds: MidtransCreds,
): Promise<EwalletResult> {
  const raw = await request(`${baseUrl(creds)}/v2/charge`, creds, {
    method: "POST",
    body: JSON.stringify({
      payment_type: input.provider,
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
      ...customExpiry(input.expiryMinutes),
    }),
  });
  const parsed = ewalletSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Midtrans ${input.provider}: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
  }
  const deeplink = findAction(parsed.data.actions, "deeplink-redirect");
  if (!deeplink) {
    throw new Error(`Midtrans ${input.provider}: deeplink-redirect tidak ada di response`);
  }
  return {
    transactionId: parsed.data.transaction_id,
    orderId: parsed.data.order_id,
    transactionStatus: parsed.data.transaction_status,
    provider: input.provider,
    deeplink,
    qrUrl: findAction(parsed.data.actions, "generate-qr-code"),
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
  creds: MidtransCreds,
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
  | { kind: "qris"; qrString: string; qrUrl?: string | null }
  | { kind: "va"; bank: string; vaNumber: string }
  | { kind: "echannel"; billerCode: string; billKey: string }
  | { kind: "ewallet"; provider: EwalletProvider; deeplink: string; qrUrl: string | null };

export async function chargeByMethodCode(
  method: string,
  orderId: string,
  grossAmount: number,
  expiryMinutes: number,
  creds: MidtransCreds,
): Promise<{ actions: PaymentActions }> {
  if (method === "qris") {
    const r = await chargeQris({ orderId, grossAmount, expiryMinutes }, creds);
    return { actions: { kind: "qris", qrString: r.qrString ?? "", qrUrl: r.qrUrl } };
  }
  if (method === "ewallet_gopay" || method === "ewallet_shopeepay") {
    const provider: EwalletProvider = method === "ewallet_gopay" ? "gopay" : "shopeepay";
    const r = await chargeEwallet({ orderId, grossAmount, provider, expiryMinutes }, creds);
    return { actions: { kind: "ewallet", provider, deeplink: r.deeplink, qrUrl: r.qrUrl } };
  }
  if (method === "va_permata") {
    const r = await chargePermataVA({ orderId, grossAmount, expiryMinutes }, creds);
    return { actions: { kind: "va", bank: "permata", vaNumber: r.vaNumber } };
  }
  if (method === "va_mandiri") {
    const r = await chargeEchannel({ orderId, grossAmount, expiryMinutes }, creds);
    return { actions: { kind: "echannel", billerCode: r.billerCode, billKey: r.billKey } };
  }
  if (method.startsWith("va_")) {
    const bank = method.slice(3) as "bca" | "bni" | "bri" | "cimb";
    const r = await chargeBankTransfer({ orderId, grossAmount, bank, expiryMinutes }, creds);
    return { actions: { kind: "va", bank: r.bank, vaNumber: r.vaNumber } };
  }
  throw new Error(`Metode pembayaran tidak dikenali: ${method}`);
}
