import { describeMidtransFailure, type MidtransFailure } from "@/lib/midtrans/client";

// Satu tempat penanganan charge Midtrans yang gagal, dipakai checkout DAN
// deposit. Dulu keduanya punya catch-nya sendiri yang isinya sama persis:
// console.error lalu `return { error: "Gagal membuat pembayaran, silakan coba
// lagi." }`. Akibatnya dua hal yang sama-sama merugikan:
//
//   1. Alasan sebenarnya (mis. HTTP 401 "Unknown Merchant server_key/id" -
//      key sandbox dipakai saat Mode Production dicentang) cuma mendarat di
//      log runtime yang fana, terpotong 200 karakter, dan tidak pernah
//      tersimpan - padahal kolom rawResponse sudah ada di kedua tabel.
//   2. Customer disuruh "coba lagi" untuk kegagalan yang MUSTAHIL sembuh
//      dengan dicoba lagi. Mereka mengulang belasan kali, tiap kali
//      meninggalkan satu order FAILED, dan admin tidak pernah tahu kenapa.

export interface ChargeFailureReport {
  /** Aman disimpan ke kolom Json - tidak pernah memuat server key. */
  failure: MidtransFailure;
  /** Pesan untuk pembeli. Menyuruh "coba lagi" HANYA kalau memang bisa sembuh. */
  buyerMessage: string;
}

const BUYER_MESSAGE: Record<MidtransFailure["kind"], string> = {
  // Salah key / salah mode / channel belum diaktifkan Midtrans. Mengulang tidak
  // akan menolong sampai admin membetulkannya, jadi jangan menjanjikan itu.
  config:
    "Metode pembayaran ini sedang tidak bisa diproses. Silakan pilih metode lain atau hubungi CS kami.",
  // Payload kita ditolak gateway - bug di sisi kita. Sama-sama tidak sembuh
  // dengan mengulang.
  request:
    "Pembayaran tidak bisa diproses untuk saat ini. Silakan pilih metode lain atau hubungi CS kami.",
  transient: "Gagal membuat pembayaran, silakan coba lagi.",
};

export function reportChargeFailure(
  // "tier-purchase" = pembelian paket reseller. Ditambahkan ke union yang sama,
  // bukan diberi pelaporan sendiri: ketiga jalur uang harus terbaca serupa di
  // log & Telegram, kalau tidak yang paling baru selalu jadi yang paling sulit
  // didiagnosis saat gateway bermasalah.
  context: { scope: "checkout" | "deposit" | "tier-purchase"; refId: string; method: string },
  e: unknown,
): ChargeFailureReport {
  const failure = describeMidtransFailure(e);

  // console.error TETAP dipertahankan (alerting/log Vercel), tapi sekarang
  // sebagai pelengkap - bukan lagi satu-satunya jejak yang ada.
  console.error(`${context.scope}: charge Midtrans gagal`, {
    refId: context.refId,
    method: context.method,
    kind: failure.kind,
    httpStatus: failure.httpStatus,
    statusCode: failure.statusCode,
    statusMessage: failure.statusMessage,
    errorMessages: failure.errorMessages,
  });

  return { failure, buyerMessage: BUYER_MESSAGE[failure.kind] };
}
