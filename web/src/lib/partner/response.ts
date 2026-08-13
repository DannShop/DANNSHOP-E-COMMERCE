import { NextResponse } from "next/server";

// Bentuk balasan tunggal untuk SELURUH endpoint /api/v1/*: selalu satu objek
// `data`, selalu ada `rc` + `message`. Partner cukup menulis satu parser.
//
// Dua keputusan yang membedakannya dari API Digiflazz (yang jadi acuan bentuk
// request-nya) dan yang sengaja TIDAK ditiru:
//
// 1. HTTP status di sini BERARTI. Digiflazz — dan Midtrans — membalas HTTP 200
//    untuk penolakan, dan kebiasaan itu sudah dua kali menyesatkan diagnosis di
//    repo ini (lihat catatan `rc 45` dan `status_code 402` di docs/). Partner yang
//    menulis `if (!res.ok)` tidak akan tertipu oleh API kita.
// 2. `rc` tetap ada dan tetap jadi sumber kebenaran yang paling spesifik, karena
//    satu status HTTP memetakan ke beberapa sebab (400 bisa SKU salah atau
//    customer_no salah). Dokumentasi partner menyuruh membaca `rc`, bukan HTTP.

export const PARTNER_RC = {
  SUCCESS: "00",
  FAILED: "01",
  PENDING: "03",
  UNKNOWN_USERNAME: "10",
  INVALID_SIGNATURE: "11",
  IP_NOT_ALLOWED: "12",
  INVALID_REQUEST: "13",
  SKU_NOT_FOUND: "14",
  INVALID_CUSTOMER_NO: "15",
  INSUFFICIENT_BALANCE: "20",
  DUPLICATE_REF_ID: "21",
  PRODUCT_UNAVAILABLE: "40",
  TRANSACTION_NOT_FOUND: "41",
  RATE_LIMITED: "45",
  SYSTEM_ERROR: "99",
} as const;

export type PartnerRc = (typeof PARTNER_RC)[keyof typeof PARTNER_RC];

// Status transaksi yang dilihat partner. Sengaja hanya TIGA nilai, bukan sembilan
// OrderStatus internal kita: partner tidak punya kepentingan membedakan
// PENDING_PAYMENT/PAID/PROCESSING (semuanya berarti "tunggu"), dan
// NEEDS_REVIEW/REFUND_PENDING adalah antrean kerja INTERNAL kita — membocorkannya
// ke partner berarti mereka menulis cabang kode untuk keadaan yang cuma bisa
// diselesaikan admin kita.
export type PartnerTrxStatus = "Sukses" | "Pending" | "Gagal";

// Satu-satunya tempat OrderStatus internal diterjemahkan ke status partner.
// Kalau ada status order baru ditambahkan, dia akan jatuh ke "Pending" di sini —
// pilihan default yang disengaja: menganggap sesuatu yang belum dikenal sebagai
// "Gagal" akan membuat partner merefund customer-nya untuk transaksi yang
// sebenarnya masih berjalan.
export function toPartnerStatus(status: string): PartnerTrxStatus {
  if (status === "COMPLETED") return "Sukses";
  if (status === "FAILED" || status === "EXPIRED" || status === "REFUNDED") return "Gagal";
  return "Pending";
}

export function rcForStatus(status: PartnerTrxStatus): PartnerRc {
  if (status === "Sukses") return PARTNER_RC.SUCCESS;
  if (status === "Gagal") return PARTNER_RC.FAILED;
  return PARTNER_RC.PENDING;
}

export function partnerJson(data: Record<string, unknown>, httpStatus = 200): NextResponse {
  return NextResponse.json({ data }, { status: httpStatus, headers: { "Cache-Control": "no-store" } });
}

export function partnerError(rc: PartnerRc, message: string, httpStatus: number, extra?: Record<string, unknown>) {
  return partnerJson({ rc, message, ...extra }, httpStatus);
}
