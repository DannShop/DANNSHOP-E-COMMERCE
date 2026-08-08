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

// Tiga kelas kegagalan, karena TINDAKAN yang benar untuk masing-masing beda
// dan dulu ketiganya tersamar jadi satu pesan "silakan coba lagi":
//   config    - kredensial/akun merchant. Mengulang checkout SELAMANYA gagal
//               sampai admin membetulkan key atau mengaktifkan channel.
//   request   - payload yang kita kirim ditolak. Ini bug kita, bukan nasib.
//   transient - gangguan sesaat (5xx, jaringan, timeout, order_id bentrok).
//               Cuma di kelas inilah "coba lagi" benar-benar masuk akal.
export type MidtransFailureKind = "config" | "request" | "transient";

function classify(statusCode: number): MidtransFailureKind {
  // 401 "Unknown Merchant server_key/id" = key tidak dikenal di environment
  // ini - gejala paling sering: key sandbox dipakai saat Mode Production
  // dicentang (prefix key Midtrans TIDAK bisa dipercaya untuk membedakannya,
  // ada key sandbox yang diawali "Mid-server-" persis seperti key production).
  // 402 = channel-nya belum diaktifkan Midtrans untuk merchant ini.
  if (statusCode === 401 || statusCode === 402 || statusCode === 403) return "config";
  // 406 = order_id sudah pernah dipakai. Checkout ulang membuat orderNumber
  // baru, jadi ini benar-benar bisa sembuh dengan mencoba lagi.
  if (statusCode === 406) return "transient";
  if (statusCode >= 500) return "transient";
  if (statusCode >= 400) return "request";
  return "transient";
}

export class MidtransApiError extends Error {
  readonly kind: MidtransFailureKind;
  readonly httpStatus: number;
  /** `status_code` dari body Midtrans - sering BEDA dari status HTTP. */
  readonly statusCode: number | null;
  readonly statusMessage: string | null;
  readonly errorMessages: string[];
  readonly endpoint: string;
  readonly raw: unknown;

  constructor(input: {
    endpoint: string;
    httpStatus: number;
    statusCode: number | null;
    statusMessage: string | null;
    errorMessages: string[];
    raw: unknown;
  }) {
    const detail = [input.statusMessage, ...input.errorMessages].filter(Boolean).join(" | ") || "(tanpa pesan)";
    super(`Midtrans ${input.endpoint} ditolak [HTTP ${input.httpStatus} / status_code ${input.statusCode ?? "-"}]: ${detail}`);
    this.name = "MidtransApiError";
    this.endpoint = input.endpoint;
    this.httpStatus = input.httpStatus;
    this.statusCode = input.statusCode;
    this.statusMessage = input.statusMessage;
    this.errorMessages = input.errorMessages;
    this.raw = input.raw;
    this.kind = classify(input.statusCode ?? input.httpStatus);
  }
}

/**
 * Ringkasan kegagalan yang AMAN disimpan ke DB & ditulis ke log: tidak pernah
 * memuat server key, dan tidak dipotong 200 karakter seperti dulu. Inilah yang
 * masuk ke OrderPayment.rawResponse / Deposit.rawResponse supaya admin bisa
 * tahu penyebabnya tanpa akses log runtime Vercel (yang fana).
 */
// `type`, BUKAN `interface`: bentuk ini ditulis langsung ke kolom Json Prisma,
// dan Prisma.InputJsonObject butuh index signature implisit yang cuma didapat
// type alias - interface akan ditolak TypeScript di call site.
export type MidtransFailure = {
  kind: MidtransFailureKind;
  httpStatus: number | null;
  statusCode: number | null;
  statusMessage: string | null;
  errorMessages: string[];
  message: string;
  at: string;
};

export function describeMidtransFailure(e: unknown): MidtransFailure {
  const at = new Date().toISOString();
  if (e instanceof MidtransApiError) {
    return {
      kind: e.kind,
      httpStatus: e.httpStatus,
      statusCode: e.statusCode,
      statusMessage: e.statusMessage,
      errorMessages: e.errorMessages,
      message: e.message,
      at,
    };
  }
  // Timeout/DNS/TLS dan error tak terduga lain. Bukan config - jangan sampai
  // gangguan jaringan sesaat bikin admin mengira key-nya salah.
  return {
    kind: "transient",
    httpStatus: null,
    statusCode: null,
    statusMessage: null,
    errorMessages: [],
    message: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    at,
  };
}

// Body error Midtrans bentuknya konsisten: status_code (string), kadang
// status_message, kadang error_messages[]. Dibaca defensif karena ini justru
// jalur yang paling sering kena bentuk tak terduga.
function readErrorEnvelope(raw: unknown): {
  statusCode: number | null;
  statusMessage: string | null;
  errorMessages: string[];
} {
  if (typeof raw !== "object" || raw === null) {
    return { statusCode: null, statusMessage: null, errorMessages: [] };
  }
  const o = raw as Record<string, unknown>;
  const codeRaw = o.status_code;
  const code = typeof codeRaw === "string" ? Number(codeRaw) : typeof codeRaw === "number" ? codeRaw : NaN;
  return {
    statusCode: Number.isFinite(code) ? code : null,
    statusMessage: typeof o.status_message === "string" ? o.status_message : null,
    errorMessages: Array.isArray(o.error_messages) ? o.error_messages.map(String) : [],
  };
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

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new MidtransApiError({
      endpoint: url,
      httpStatus: res.status,
      statusCode: null,
      statusMessage: `response bukan JSON: ${text.slice(0, 500)}`,
      errorMessages: [],
      raw: text.slice(0, 2000),
    });
  }

  // Status HTTP SAJA tidak cukup: GET /v2/{id}/status membalas HTTP 200 dengan
  // body status_code "404" saat transaksi tidak ada, dan /v2/charge membalas
  // HTTP 200 dengan status_code "201" saat SUKSES. Yang menentukan adalah
  // status_code di body; status HTTP cuma cadangan kalau body tidak punya.
  const env = readErrorEnvelope(raw);
  const effective = env.statusCode ?? res.status;
  if (effective >= 400) {
    throw new MidtransApiError({
      endpoint: url,
      httpStatus: res.status,
      statusCode: env.statusCode,
      statusMessage: env.statusMessage,
      errorMessages: env.errorMessages,
      raw,
    });
  }

  return raw;
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

/**
 * Membatalkan transaksi PENDING. Best-effort: TIDAK pernah melempar.
 *
 * Dipakai uji channel di panel admin untuk merapikan transaksi percobaan yang
 * baru saja dibuatnya. Kegagalan cancel bukan alasan menggagalkan uji - kalau
 * cancel ditolak, transaksinya toh kedaluwarsa sendiri.
 */
export async function cancelTransaction(orderId: string, creds: MidtransCreds): Promise<boolean> {
  try {
    await request(`${baseUrl(creds)}/v2/${orderId}/cancel`, creds, { method: "POST" });
    return true;
  } catch {
    return false;
  }
}

// ===== Uji koneksi (dipakai tombol "Test Koneksi" di panel admin) =====

export interface MidtransPingResult {
  /** true = server key ini SAH untuk environment yang sedang dipilih. */
  ok: boolean;
  isProduction: boolean;
  httpStatus: number | null;
  statusCode: number | null;
  statusMessage: string | null;
}

/**
 * Memvalidasi pasangan (server key, mode) TANPA membuat transaksi apa pun.
 *
 * Caranya: GET status sebuah order_id yang dijamin tidak ada. Midtrans membalas
 *   - status_code 404 "Transaction doesn't exist."  -> otentikasi SAH
 *   - status_code 401 "Unknown Merchant server_key/id" -> key tidak dikenal di
 *     environment ini (paling sering: key sandbox dipakai di mode production)
 * Jadi 404 di sini adalah SUKSES, bukan kegagalan.
 *
 * Tidak pernah melempar - pemanggilnya adalah UI diagnostik, yang justru harus
 * bisa menampilkan kegagalan alih-alih ikut meledak.
 */
export async function pingMidtrans(creds: MidtransCreds): Promise<MidtransPingResult> {
  const probeOrderId = `PING-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  try {
    await request(`${baseUrl(creds)}/v2/${probeOrderId}/status`, creds, { method: "GET" });
    // Tidak diharapkan (order_id acak mustahil ada), tapi kalau lolos berarti
    // otentikasi jelas sah.
    return { ok: true, isProduction: creds.isProduction, httpStatus: 200, statusCode: 200, statusMessage: null };
  } catch (e) {
    if (e instanceof MidtransApiError) {
      const authOk = e.statusCode === 404;
      return {
        ok: authOk,
        isProduction: creds.isProduction,
        httpStatus: e.httpStatus,
        statusCode: e.statusCode,
        statusMessage: e.statusMessage,
      };
    }
    return {
      ok: false,
      isProduction: creds.isProduction,
      httpStatus: null,
      statusCode: null,
      statusMessage: e instanceof Error ? e.message : String(e),
    };
  }
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
