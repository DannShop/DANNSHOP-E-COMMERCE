// Adapter OkeConnect (lengan H2H OrderKuota). Riset lengkap: docs/providers/okeconnect.md
//
// TIGA HAL YANG BEDA TOTAL DARI DIGIFLAZZ — jangan pakai digiflazz.ts sebagai
// cetakan tanpa membaca ini dulu:
//
//  1. Semua operasi HTTP GET dengan kredensial di QUERY STRING, bukan POST JSON.
//     Karena itu `providerHttpGet` mengirim query sebagai objek terpisah, dan
//     `endpoint` yang dicatat ke log tidak pernah memuat query string
//     (sanitizeEndpointForLog di api-log.ts). PIN dan password tidak boleh
//     tersimpan di ProviderApiLog.
//  2. Respons berupa KALIMAT bahasa Indonesia, bukan JSON ber-rc. Seluruh
//     penafsirannya ada di okeconnect-parse.ts, yang default-nya "pending" untuk
//     kalimat tak dikenal.
//  3. Callback TIDAK punya signature/secret apa pun. `verified` SELALU false —
//     lihat catatan di parseCallback.

import { z } from "zod";
import {
  noopProviderApiLogger, redactProviderRequest, type ProviderApiLogger, type ProviderApiOutcome,
} from "./api-log";
import { providerHttpGet } from "./relay";
import {
  parseOkeConnectBalance, parseOkeConnectMessage,
} from "./okeconnect-parse";
import type {
  CallbackResult, CreateTrxInput, ProviderCallContext, ProviderSkuPrice, ProviderTrxResult,
  TopupProviderAdapter,
} from "./types";

export interface OkeConnectCredentials {
  /** Kode user, mis. "OK307834". Dikirim sebagai parameter `memberID`. */
  memberID: string;
  /** PIN transaksi (didapat saat pendaftaran). */
  pin: string;
  /** Password transaksi H2H — BUKAN password login web okeconnect.com. */
  password: string;
  /**
   * Token daftar harga (`id=` pada okeconnect.com/harga/json).
   *
   * BUKAN rahasia dan BUKAN per-member: sudah diverifikasi bahwa token di akun
   * DannShop sama persis dengan yang beredar di dokumentasi publik, dan datanya
   * identik dengan pengambilan tanpa login (docs/providers/okeconnect.md §1.6).
   * Tetap dibuat bisa diisi supaya kalau OkeConnect mengganti tokennya, cukup
   * diubah dari halaman admin — tidak perlu deploy ulang.
   */
  priceListId?: string;
  /**
   * Segmen acak pada URL callback: `/api/webhooks/okeconnect/<callbackSecret>`.
   *
   * BUKAN pengganti verifikasi tanda tangan — OkeConnect tidak menyediakannya sama
   * sekali, dan tidak ada nilai rahasia yang ikut dikirim di dalam callback yang
   * bisa dicocokkan. Ini semata memperkecil permukaan: tanpa segmen acak, URL
   * callback bisa ditebak siapa pun yang tahu domain kita, dan mereka bisa
   * membanjiri endpoint itu dengan refid karangan.
   *
   * Yang benar-benar menjaga kebenaran status adalah pola "callback cuma pemicu,
   * checkStatus yang memutuskan" di route callback-nya.
   *
   * Kosong = endpoint callback menolak semua request (fail-closed), sama seperti
   * webhookSecret Digiflazz yang belum diisi.
   */
  callbackSecret?: string;
}

const TRX_BASE_URL = "https://h2h.okeconnect.com";
// Host BERBEDA dari host transaksi, dan TIDAK butuh whitelist IP — karena itu
// price list sengaja tidak lewat relay (lihat ALLOWED_HOSTS di relay PHP).
const PRICELIST_BASE_URL = "https://okeconnect.com";
const DEFAULT_PRICELIST_ID = "905ccd028329b0a";

/**
 * Kategori yang TIDAK disinkronkan.
 *
 * Kategori tagihan/pascabayar memuat harga NEGATIF — angkanya bukan harga modal
 * melainkan komisi, karena nominal tagihan sesungguhnya baru diketahui saat
 * inquiry. Dua alasan kenapa harus disaring, bukan sekadar diabaikan:
 *
 *  - Guard anti-jual-rugi `costPrice > sellingPrice` di selectFulfillmentSku
 *    SELALU lolos kalau costPrice negatif, jadi jaring pengamannya lumpuh.
 *  - API OkeConnect tidak punya endpoint inquiry sama sekali (cuma /trx,
 *    /trx/balance, dan check=1), jadi alur pascabayar memang belum terlayani.
 *
 * NOMINAL BEBAS (open denom) ikut disaring untuk alasan berbeda: produk itu
 * mewajibkan parameter `qty`, sementara CreateTrxInput belum membawanya.
 * Menyinkronkannya berarti membiarkan SKU yang PASTI gagal saat dikirim bisa
 * dipetakan admin ke produk.
 */
export const OKECONNECT_EXCLUDED_CATEGORIES = new Set([
  "TAGIHAN",
  "TAGIHAN PBB",
  "AIR PDAM",
  "FINANCE",
  "PASCABAYAR",
  "NOMINAL BEBAS",
]);

const priceRowSchema = z.object({
  kode: z.string(),
  keterangan: z.string(),
  produk: z.string(),
  kategori: z.string(),
  harga: z.string(),
  status: z.string(),
});
const priceListSchema = z.array(priceRowSchema);

/**
 * Menarik nama pemilik dari kalimat balasan produk CEK*.
 *
 * Bersifat SEMENTARA sampai formatnya terlihat dari tes sungguhan (lihat
 * checkCustomerName). Ditulis sebagai daftar pola bermarkah eksplisit, BUKAN
 * tebakan longgar seperti "ambil kata kapital terpanjang": salah menarik nama
 * berarti pembeli melihat nama orang lain lalu meyakini nomornya sudah benar —
 * kegagalan yang jauh lebih merugikan daripada sekadar "nama tidak ditemukan".
 *
 * Karena itu kalau tidak ada markah yang cocok, jawabannya null.
 */
export function extractCustomerName(message: string): string | null {
  const text = (message ?? "").trim();
  if (!text) return null;

  // Kegagalan eksplisit tidak boleh dikorek namanya sama sekali.
  if (/\bgagal\b|tidak ditemukan|tidak valid|salah\b/i.test(text)) return null;

  const patterns = [
    /\bNAMA\s*[:=]\s*([^\n.|]+)/i,
    /\bNAME\s*[:=]\s*([^\n.|]+)/i,
    /\bAN\s*[:.]\s*([^\n.|]+)/i, // "AN: BUDI" / "AN. BUDI"
    /\ba\/n\s*[:.]?\s*([^\n.|]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const name = m[1].trim().replace(/\s{2,}/g, " ");
      // Batas atas mencegah pola yang kelewat rakus menelan sisa kalimat
      // (termasuk angka saldo) dan menampilkannya ke pembeli sebagai "nama".
      if (name && name.length <= 60) return name;
    }
  }
  return null;
}

export class OkeConnectAdapter implements TopupProviderAdapter {
  readonly key = "okeconnect" as const;

  private trxBaseUrl: string;
  private priceListBaseUrl: string;
  private log: ProviderApiLogger;

  constructor(
    private creds: OkeConnectCredentials,
    options?: { trxBaseUrl?: string; priceListBaseUrl?: string; log?: ProviderApiLogger },
  ) {
    this.trxBaseUrl = options?.trxBaseUrl ?? TRX_BASE_URL;
    this.priceListBaseUrl = options?.priceListBaseUrl ?? PRICELIST_BASE_URL;
    this.log = options?.log ?? noopProviderApiLogger;
  }

  /** Parameter autentikasi yang menempel di SETIAP panggilan transaksi. */
  private authParams(): Record<string, string> {
    return { memberID: this.creds.memberID, pin: this.creds.pin, password: this.creds.password };
  }

  private async get(
    path: string,
    query: Record<string, string>,
    meta: {
      operation: string;
      context?: ProviderCallContext;
      baseUrl?: string;
      bypassRelay?: boolean;
      timeoutMs?: number;
    },
  ): Promise<string> {
    const startedAt = Date.now();
    const endpoint = `${meta.baseUrl ?? this.trxBaseUrl}${path}`;
    let httpStatus: number | null = null;
    let responseText: string | null = null;
    let outcome: ProviderApiOutcome = "TRANSPORT_ERROR";
    let message: string | null = null;
    let errorMessage: string | null = null;
    let viaRelay = false;

    try {
      const res = await providerHttpGet({
        url: endpoint,
        query,
        timeoutMs: meta.timeoutMs ?? 15_000,
        bypassRelay: meta.bypassRelay,
      });
      viaRelay = res.viaRelay;
      httpStatus = res.status;
      responseText = res.text;

      // Status HTTP TIDAK menentukan — OkeConnect membalas 200 untuk penolakan
      // ("Pin Salah") sama seperti untuk keberhasilan. Yang menentukan isi kalimatnya.
      if (res.status >= 400) {
        outcome = "INVALID_RESPONSE";
        errorMessage = `HTTP ${res.status}`;
        throw new Error(`OkeConnect ${meta.operation}: HTTP ${res.status} — ${res.text.slice(0, 200)}`);
      }
      if (res.text.trim() === "") {
        outcome = "INVALID_RESPONSE";
        errorMessage = "Respons kosong";
        throw new Error(`OkeConnect ${meta.operation}: respons kosong.`);
      }

      message = res.text.slice(0, 500);
      outcome = "SUCCESS"; // penilaian per-operasi disempurnakan pemanggil
      return res.text;
    } catch (e) {
      errorMessage ??= e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      await this.log({
        provider: "OKECONNECT",
        operation: meta.operation,
        // Query TIDAK ditempel ke endpoint: di sinilah pin & password berada.
        endpoint,
        outcome,
        httpStatus,
        durationMs: Date.now() - startedAt,
        // Objek, bukan string URL — supaya pin/password kena redactProviderRequest.
        requestBody: redactProviderRequest(query),
        responseText,
        message,
        errorMessage,
        viaRelay,
        context: meta.context,
      });
    }
  }

  async fetchPriceList(): Promise<ProviderSkuPrice[]> {
    const text = await this.get(
      "/harga/json",
      { id: this.creds.priceListId || DEFAULT_PRICELIST_ID },
      // bypassRelay: price list TIDAK butuh IP terdaftar (host-nya pun berbeda dari
      // host transaksi), dan host ini sengaja tidak ada di ALLOWED_HOSTS relay.
      // Tanpa ini, sync harga gagal dengan "Host tujuan tidak diizinkan" begitu
      // relay dikonfigurasi.
      //
      // Timeout DILEBARKAN khusus di sini, dan bukan karena berjaga-jaga: respons
      // endpoint ini ~1,2 MB (8.153 baris), dan pada pengukuran 2026-08-15 waktu
      // totalnya berayun jauh — 0,2 dtk saat kena cache Cloudflare sampai 20 dtk
      // saat harus menarik dari origin. Dengan batas 15 dtk yang dipakai operasi
      // lain, sync akan gagal SESEKALI tanpa pola yang jelas, dan gejalanya
      // ("aborted"/timeout) tidak menyebut ukuran respons sama sekali. Operasi
      // transaksi tetap 15 dtk: di sana menunggu lama justru berbahaya.
      { operation: "price-list", baseUrl: this.priceListBaseUrl, bypassRelay: true, timeoutMs: 45_000 },
    );

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error(`OkeConnect price-list: respons bukan JSON — ${text.slice(0, 200)}`);
    }
    const parsed = priceListSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`OkeConnect price-list: bentuk data tidak dikenali — ${JSON.stringify(raw).slice(0, 200)}`);
    }

    const out: ProviderSkuPrice[] = [];
    for (const r of parsed.data) {
      if (OKECONNECT_EXCLUDED_CATEGORIES.has(r.kategori)) continue;
      const harga = Number(r.harga);
      // Harga <= 0 disaring walau kategorinya lolos: produk cek-ID berharga 0, dan
      // baris berharga negatif yang muncul di kategori tak terduga tidak boleh
      // sampai lolos ke guard anti-jual-rugi yang mengasumsikan angka positif.
      if (!Number.isFinite(harga) || harga <= 0) continue;
      out.push({
        skuCode: r.kode,
        productName: r.keterangan,
        category: r.kategori,
        brand: r.produk,
        costPrice: BigInt(Math.round(harga)),
        available: r.status === "1",
      });
    }
    return out;
  }

  async fetchBalance(): Promise<bigint> {
    const text = await this.get("/trx/balance", this.authParams(), { operation: "cek-saldo" });
    const saldo = parseOkeConnectBalance(text);
    if (saldo === null) {
      // "Pin Salah" mendarat di sini — kalimatnya diteruskan apa adanya karena
      // itulah satu-satunya keterangan yang provider berikan.
      throw new Error(`OkeConnect cek-saldo ditolak: ${text.trim().slice(0, 200)}`);
    }
    return saldo;
  }

  async createTransaction(input: CreateTrxInput): Promise<ProviderTrxResult> {
    return this.sendTrx(input, "transaction", false);
  }

  /**
   * Cek status = endpoint yang SAMA dengan transaksi, ditambah `check=1`.
   * Sesuai deviasi yang sudah tercatat di TopupProviderAdapter.checkStatus:
   * butuh input lengkap (produk + tujuan), bukan cuma refId.
   */
  async checkStatus(input: CreateTrxInput): Promise<ProviderTrxResult> {
    return this.sendTrx(input, "check-status", true);
  }

  private async sendTrx(
    input: CreateTrxInput,
    operation: "transaction" | "check-status",
    check: boolean,
  ): Promise<ProviderTrxResult> {
    const query: Record<string, string> = {
      product: input.skuCode,
      dest: input.target,
      refID: input.refId,
      ...this.authParams(),
    };
    if (check) query.check = "1";

    const text = await this.get("/trx", query, {
      operation,
      context: { ourRefId: input.refId, ...input.context },
    });

    const parsed = parseOkeConnectMessage(text);

    // PENJAGA refID. Panjang & karakter refID yang diterima OkeConnect tidak
    // terdokumentasi, sementara refID kita panjang dan memakai tanda hubung
    // (mis. "FUL-20260814123045-AB12CD"). Kalau provider diam-diam memotongnya,
    // gejalanya TIDAK terlihat sebagai error: cek status berikutnya tidak akan
    // pernah cocok, dan itu bisa berujung kirim dua kali. Ketidakcocokan diangkat
    // ke permukaan lewat pesan supaya terbaca di ProviderApiLog & halaman order,
    // bukan dibiarkan senyap.
    const echoed = parsed.refId;
    const refIdMismatch = echoed !== null && echoed !== input.refId;
    const message = refIdMismatch
      ? `[refID tidak cocok: kita kirim "${input.refId}", provider memantulkan "${echoed}"] ${parsed.message}`
      : parsed.message;

    return {
      // Selalu refId KITA — itu kunci pencocokan di seluruh sistem. Nilai yang
      // dipantulkan provider hanya dipakai sebagai sinyal peringatan di atas.
      refId: input.refId,
      status: parsed.status,
      sn: parsed.sn,
      message,
      costPrice: parsed.costPrice,
      raw: { text, parsed, refIdMismatch },
    };
  }

  /**
   * Cek nama pemilik akun/nomor lewat produk CEK* OkeConnect.
   *
   * OkeConnect menjual ini sebagai PRODUK biasa berharga 0 — `CEKPLN` (nama
   * pemilik token PLN), `CEKD` (Dana), `CEKGJK` (Gopay), `CEKSHP` (ShopeePay),
   * `CEKOVO`, `CEKLINK`, `CEKML`, `CEKFF`, dst — jadi jalurnya endpoint `/trx`
   * yang sama, bukan endpoint tersendiri.
   *
   * ⚠️ FORMAT RESPONSNYA BELUM TERDOKUMENTASI dan belum pernah diuji dengan
   * kredensial sungguhan. Karena itu fungsi ini mengembalikan `raw` APA ADANYA
   * di samping `name` hasil tebakan: halaman tes di /admin/id-check menampilkan
   * `raw` supaya formatnya bisa dilihat langsung, lalu extractCustomerName()
   * disesuaikan. Sampai itu terjadi, `name` bisa saja null walau providernya
   * sebenarnya menjawab dengan benar — dan itu ditangani sebagai "tidak
   * ketemu", bukan ditebak-tebak.
   */
  async checkCustomerName(input: {
    productCode: string;
    dest: string;
    refId: string;
    context?: ProviderCallContext;
  }): Promise<{ name: string | null; raw: string }> {
    const text = await this.get(
      "/trx",
      { product: input.productCode, dest: input.dest, refID: input.refId, ...this.authParams() },
      { operation: "cek-nama", context: { ourRefId: input.refId, ...input.context } },
    );
    return { name: extractCustomerName(text), raw: text };
  }

  /**
   * Callback OkeConnect: `GET {url_callback}?refid=…&message=…`
   *
   * `verified` SELALU false, dan itu bukan kelalaian — OkeConnect tidak
   * menandatangani callback-nya sama sekali (tidak ada signature, secret, maupun
   * token), berbeda dari Digiflazz yang memakai HMAC-SHA1. Siapa pun yang tahu
   * URL callback kita bisa mengarang kalimat "SUKSES".
   *
   * Karena itu hasil fungsi ini TIDAK BOLEH dipakai untuk menetapkan status order.
   * Pemanggil wajib memperlakukannya sebagai PEMICU saja, lalu memanggil
   * checkStatus() untuk keputusan sesungguhnya — pola yang sama seperti webhook
   * Midtrans yang selalu dikonfirmasi ulang lewat GET status.
   */
  parseCallback(input: { rawBody: string; headers: Record<string, string> }): CallbackResult | null {
    // Callback datang lewat GET, jadi "rawBody" di sini adalah query string-nya
    // (dengan atau tanpa "?" di depan). Diterima juga dalam bentuk URL utuh.
    const raw = input.rawBody ?? "";
    const qs = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : raw;
    const params = new URLSearchParams(qs);

    const refid = params.get("refid") ?? params.get("refID");
    const messageRaw = params.get("message");
    if (!refid || messageRaw === null) return null;

    const parsed = parseOkeConnectMessage(messageRaw);
    return {
      refId: refid,
      status: parsed.status,
      sn: parsed.sn,
      message: parsed.message,
      verified: false, // lihat catatan di atas — tidak ada cara memverifikasi.
      raw: { refid, message: messageRaw, parsed },
    };
  }
}
