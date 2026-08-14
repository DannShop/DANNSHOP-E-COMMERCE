// Penerjemah respons OkeConnect: KALIMAT BAHASA INDONESIA → status terstruktur.
//
// KENAPA FILE TERPISAH: OkeConnect tidak membalas JSON. Semua endpoint-nya
// membalas satu kalimat ber-`Content-Type: text/html`, mis.
//
//   "T#210286229 R#113 Three 1.000 T1.089660522887 akan diproses. Saldo 279.655 ..."
//   "R#999 Three 5.000 T5.08980204060 sudah pernah jam 18:46, status Sukses. SN: R2504..."
//
// Beda mendasar dari Digiflazz yang punya `rc` ("00" sukses, "03" pending) di
// field tersendiri. Di sini status HARUS disimpulkan dari isi kalimat, dan
// kalimat provider bisa berubah sewaktu-waktu tanpa pemberitahuan. Dipisahkan
// dari adapter supaya seluruh perilakunya bisa dikunci tes tanpa jaringan.
//
// SATU ATURAN YANG TIDAK BOLEH DILANGGAR: kalimat yang tidak dikenali WAJIB
// jatuh ke "pending", bukan "failed" atau "success".
//   - salah tebak "success" → order ditandai selesai padahal barang tidak terkirim
//   - salah tebak "failed"  → order di-refund padahal barang SUDAH terkirim (rugi dobel)
//   - "pending" → job recheck-fulfillment yang memutuskan nanti, dan itu memang
//     jaring pengaman yang sudah selalu dijadwalkan untuk tiap transaksi.
// Menunda keputusan selalu bisa diperbaiki; salah memutuskan tidak.

import type { TrxStatus } from "./types";

export interface OkeConnectParsed {
  status: TrxStatus;
  /** Serial number / token, kalau kalimatnya memuat. */
  sn: string | null;
  /** Nomor transaksi OkeConnect (`T#…`), kalau ada. Berguna untuk lacak manual. */
  trxId: string | null;
  /** refID yang dipantulkan provider (`R#…`), kalau ada. */
  refId: string | null;
  /** Harga yang dikenakan (`Hrg 6.487` atau selisih saldo), kalau terbaca. */
  costPrice: bigint | null;
  /** true = provider menyatakan tidak punya catatan transaksi ini sama sekali. */
  notFound: boolean;
  /** Kalimat asli, apa adanya. */
  message: string;
}

/** Angka gaya Indonesia ("1.321", "43.928.256") → bigint. */
function parseIdNumber(raw: string): bigint | null {
  const digits = raw.replace(/\./g, "").trim();
  if (!/^\d+$/.test(digits)) return null;
  try {
    return BigInt(digits);
  } catch {
    return null;
  }
}

// Urutan pengujian ini PENTING dan tidak boleh diacak.
//
// "TIDAK ADA transaksi" harus diuji sebelum pola gagal mana pun: kalimatnya memuat
// kata "Tidak ada data" yang bisa tertangkap pola lain, padahal artinya sama sekali
// berbeda — bukan "transaksi gagal", melainkan "provider belum pernah melihat
// transaksi ini". Membedakan keduanya menentukan: yang pertama boleh dikirim ulang,
// yang kedua tidak boleh disimpulkan apa-apa.
const NOT_FOUND = /tidak ada transaksi|tidak ada data/i;

// Pending harus diuji SEBELUM sukses/gagal. Kalimat "Mhn tunggu trx sblmnya
// selesai: T#… status Menunggu Jawaban" memuat kata "status" yang juga dipakai
// kalimat final, dan menebaknya sebagai final akan menutup order yang masih hidup.
const PENDING = /menunggu jawaban|mhn tunggu|mohon tunggu|sedang diproses|akan diproses|dalam proses/i;

// "SUKSES." pada balasan callback, "status Sukses" pada balasan cek status.
const SUCCESS = /\bsukses\b/i;

// "GAGAL." / "status Gagal".
const FAILED = /\bgagal\b/i;

/**
 * Terjemahkan satu kalimat OkeConnect jadi status terstruktur.
 *
 * Dipakai untuk KETIGA jalur sekaligus (balasan transaksi, balasan cek status,
 * dan isi callback) karena ketiganya memakai tata bahasa yang sama.
 */
export function parseOkeConnectMessage(rawMessage: string): OkeConnectParsed {
  const message = (rawMessage ?? "").trim();

  const trxId = message.match(/T#(\w+)/)?.[1] ?? null;
  const refId = message.match(/R#(\S+?)(?=[\s,.]|$)/)?.[1] ?? null;

  // SN muncul sebagai "SN: xxx" atau "SN/Ref: xxx". Berhenti di spasi/titik akhir
  // kalimat — SN token PLN sendiri memakai tanda hubung, jadi tidak boleh dipotong
  // di situ.
  const snRaw = message.match(/SN(?:\/Ref)?\s*:\s*([^\s]+)/i)?.[1] ?? null;
  const sn = snRaw ? snRaw.replace(/[.,]+$/, "") : null;

  // Harga: "Hrg 6.487" (balasan cek status) atau bentuk pengurangan saldo
  // "Saldo 279.655 - 1.321 = 278.334" (balasan transaksi).
  const hrg = message.match(/\bHrg\s+([\d.]+)/i)?.[1];
  const selisih = message.match(/Saldo\s+[\d.]+\s*-\s*([\d.]+)\s*=/i)?.[1];
  const costPrice = hrg ? parseIdNumber(hrg) : selisih ? parseIdNumber(selisih) : null;

  const base = { sn, trxId, refId, costPrice, message };

  if (NOT_FOUND.test(message)) {
    // BUKAN "failed". Provider tidak punya catatan transaksi ini — bisa berarti
    // request kita tidak pernah sampai, ATAU sampai tapi belum terindeks. Menyebutnya
    // gagal akan memicu refund untuk transaksi yang mungkin masih akan jalan.
    return { ...base, status: "pending", notFound: true, sn: null, costPrice: null };
  }
  if (PENDING.test(message)) return { ...base, status: "pending", notFound: false };
  if (SUCCESS.test(message)) return { ...base, status: "success", notFound: false };
  if (FAILED.test(message)) return { ...base, status: "failed", notFound: false };

  // Tidak dikenali → pending. Lihat catatan di kepala file: ini keputusan yang
  // disengaja, bukan kelalaian menangani kasus lain.
  return { ...base, status: "pending", notFound: false };
}

/**
 * Apakah balasan ini penolakan di tingkat kredensial/akses, bukan hasil transaksi?
 *
 * Contoh: "Pin Salah", "R#0 T1.089… GAGAL. Pin Salah". Perlu dibedakan karena
 * penolakan seperti ini TIDAK ADA hubungannya dengan produk atau nomor tujuan —
 * dia menandakan konfigurasi kita yang salah, dan akan menggagalkan SEMUA order
 * berikutnya juga, bukan cuma yang ini.
 */
export function isOkeConnectAuthRejection(message: string): boolean {
  return /pin salah|password salah|member.*(tidak|belum) (terdaftar|dikenal)|ip .*(tidak|belum) (terdaftar|dikenali)|akses ditolak/i.test(
    message ?? "",
  );
}

/** Saldo dari balasan `/trx/balance` ("Saldo 284.939"). null kalau tidak terbaca. */
export function parseOkeConnectBalance(rawMessage: string): bigint | null {
  const m = (rawMessage ?? "").match(/Saldo\s+([\d.]+)/i);
  return m ? parseIdNumber(m[1]) : null;
}
