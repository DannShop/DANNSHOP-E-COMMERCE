// Pencatatan riwayat panggilan API keluar ke provider.
//
// Ada karena kegagalan fulfillment selama ini hanya meninggalkan satu kalimat
// (`OrderFulfillment.message`) - cukup untuk tahu order gagal, tidak cukup untuk
// tahu KENAPA. Yang hilang justru bagian yang menentukan: request persis apa yang
// kita kirim, provider membalas apa apa adanya, status HTTP berapa, berapa lama,
// dan - untuk kasus terburuk - apakah kita bahkan sempat dapat respons sama sekali.
//
// Dua aturan yang tidak boleh dilanggar file ini:
//  1. MENULIS LOG TIDAK BOLEH PERNAH MELEMPAR ERROR. Ini jalur uang; log yang
//     gagal disimpan tidak boleh menggagalkan transaksi yang sedang berjalan.
//  2. KREDENSIAL TIDAK BOLEH TERSIMPAN. Body request memuat `sign` (turunan API
//     key) dan `username`. Log ini dibaca dari halaman admin dan bisa ikut ter-dump
//     saat backup DB, jadi diredaksi SEBELUM menyentuh database. Berlaku untuk DUA
//     jalur: `requestBody` (lewat redactProviderRequest) DAN `endpoint` (lewat
//     sanitizeEndpointForLog) — provider yang memakai GET menaruh kredensialnya di
//     dalam URL, bukan di body.

import type { Prisma, ProviderKey } from "@prisma/client";
import { db } from "@/lib/db";
import type { ProviderCallContext } from "./types";

export const PROVIDER_API_OUTCOMES = [
  "SUCCESS", // provider menerima & memproses
  "PENDING", // diterima, hasil belum final
  "REJECTED", // dapat respons utuh, TAPI provider menolak (rc error) - mis. IP belum whitelist
  "INVALID_RESPONSE", // dapat respons, tapi bukan JSON yang bisa dibaca (HTML error page, body kosong)
  "TRANSPORT_ERROR", // tidak dapat respons sama sekali (timeout, DNS, koneksi ditolak)
] as const;

export type ProviderApiOutcome = (typeof PROVIDER_API_OUTCOMES)[number];

/** Outcome yang berarti "ada yang perlu dilihat admin". */
export const PROVIDER_API_FAILURE_OUTCOMES: ProviderApiOutcome[] = [
  "REJECTED",
  "INVALID_RESPONSE",
  "TRANSPORT_ERROR",
];

export interface ProviderApiLogEntry {
  provider: ProviderKey;
  operation: string;
  endpoint: string;
  outcome: ProviderApiOutcome;
  httpStatus: number | null;
  durationMs: number;
  requestBody: unknown;
  responseBody?: unknown;
  responseText?: string | null;
  providerRc?: string | null;
  message?: string | null;
  errorMessage?: string | null;
  /** true = keluar lewat relay ber-IP tetap. Menentukan arti kegagalan rc 45. */
  viaRelay?: boolean;
  context?: ProviderCallContext;
}

export type ProviderApiLogger = (entry: ProviderApiLogEntry) => Promise<void>;

/** Logger default untuk adapter yang dibuat di luar registry (mis. di test). */
export const noopProviderApiLogger: ProviderApiLogger = async () => {};

// Key yang isinya rahasia murni - dibuang total, tidak ada nilai forensiknya.
const FULLY_REDACTED = new Set([
  "sign", "signature", "api_key", "apikey", "apiKey", "secret", "password", "pin", "token", "server_key", "client_key",
]);

// Key yang perlu tetap KELIHATAN SEBAGIAN: admin harus bisa memastikan panggilan
// ini memakai akun provider yang benar (salah akun = salah whitelist IP = gagal
// terus), tapi nilainya penuh tidak perlu ikut tersimpan.
const PARTIALLY_MASKED = new Set(["username", "user", "merchant_id"]);

export function maskValue(value: string): string {
  if (value.length <= 3) return "***";
  return `${value.slice(0, 3)}***`;
}

/**
 * Salin body request dengan kredensial diredaksi. Rekursif supaya body bersarang
 * (dipakai provider lain nanti) tidak lolos begitu saja.
 * `customer_no`/`ref_id`/`buyer_sku_code` SENGAJA dibiarkan utuh - justru itu yang
 * dibutuhkan saat mendiagnosis "nomor tujuan ditolak" atau "ref id duplikat".
 */
export function redactProviderRequest(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(redactProviderRequest);
  if (body === null || typeof body !== "object") return body;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (FULLY_REDACTED.has(key)) {
      out[key] = "[redacted]";
    } else if (PARTIALLY_MASKED.has(key) && typeof value === "string") {
      out[key] = maskValue(value);
    } else if (value !== null && typeof value === "object") {
      out[key] = redactProviderRequest(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

// Respons /price-list memuat RIBUAN baris SKU (ratusan KB). Menyimpannya utuh tiap
// 3 jam akan menggembungkan tabel log ini jauh melebihi manfaatnya - yang berguna
// dari panggilan price-list cuma "berhasil/ditolak, pesannya apa".
export const MAX_LOG_JSON_CHARS = 8000;

export function truncateForLog(value: unknown): Prisma.InputJsonValue {
  let text: string;
  try {
    text = JSON.stringify(value ?? null) ?? "null";
  } catch {
    // Nilai yang tidak bisa di-serialize (circular, BigInt) - jangan sampai
    // melempar dan menjatuhkan pemanggil hanya demi sebuah log.
    return { _unserializable: true };
  }
  if (text.length <= MAX_LOG_JSON_CHARS) {
    return JSON.parse(text) as Prisma.InputJsonValue;
  }
  return {
    _truncated: true,
    _originalChars: text.length,
    _preview: text.slice(0, MAX_LOG_JSON_CHARS),
  };
}

export const MAX_LOG_TEXT_CHARS = 4000;

export function truncateTextForLog(text: string): string {
  if (text.length <= MAX_LOG_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_LOG_TEXT_CHARS)}\n…(dipotong, total ${text.length} karakter)`;
}

/**
 * Buang query string dari endpoint sebelum disimpan.
 *
 * Aturan 2 di atas diberlakukan pada `requestBody` lewat redactProviderRequest,
 * TAPI `endpoint` dulu tersimpan apa adanya. Itu aman selama satu-satunya provider
 * memakai POST + body JSON (Digiflazz): URL-nya tidak memuat rahasia apa pun.
 * Begitu ada provider yang memakai GET dengan kredensial di query string
 * (OkeConnect: `?memberID=…&pin=…&password=…`), URL ITU SENDIRI jadi rahasia —
 * dan akan tersimpan polos di DB, terbaca dari halaman admin, ikut ter-dump saat
 * backup.
 *
 * Diperbaiki di SINI, bukan di adapter, supaya kebal secara struktural: adapter
 * baru yang lalai tetap tidak bisa membocorkan kredensial lewat jalur ini.
 * Parameternya sendiri tidak hilang dari forensik — yang perlu dilihat admin
 * tetap ada di `requestBody` dalam bentuk sudah diredaksi.
 */
export function sanitizeEndpointForLog(endpoint: string): string {
  const cut = endpoint.search(/[?#]/);
  return cut === -1 ? endpoint : endpoint.slice(0, cut);
}

export const recordProviderApiCall: ProviderApiLogger = async (entry) => {
  try {
    await db.providerApiLog.create({
      data: {
        provider: entry.provider,
        operation: entry.operation,
        endpoint: sanitizeEndpointForLog(entry.endpoint),
        outcome: entry.outcome,
        httpStatus: entry.httpStatus,
        durationMs: entry.durationMs,
        orderId: entry.context?.orderId ?? null,
        orderNumber: entry.context?.orderNumber ?? null,
        fulfillmentId: entry.context?.fulfillmentId ?? null,
        ourRefId: entry.context?.ourRefId ?? null,
        providerRc: entry.providerRc ?? null,
        message: entry.message ?? null,
        viaRelay: entry.viaRelay ?? false,
        requestBody: truncateForLog(entry.requestBody),
        responseBody: entry.responseBody === undefined ? undefined : truncateForLog(entry.responseBody),
        responseText: entry.responseText ? truncateTextForLog(entry.responseText) : null,
        errorMessage: entry.errorMessage ?? null,
      },
    });
  } catch (e) {
    // Aturan 1: log gagal disimpan TIDAK boleh menjatuhkan transaksi pemanggil.
    console.error("recordProviderApiCall: gagal menyimpan log panggilan API provider", {
      provider: entry.provider, operation: entry.operation, error: e,
    });
  }
};
