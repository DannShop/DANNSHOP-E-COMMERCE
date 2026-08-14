import { db } from "@/lib/db";
import { encryptJson, decryptJson } from "@/lib/crypto";
import { renderPlainTemplate } from "@/lib/notify/template";

// Cek ID / nickname akun game sebelum pembeli menyelesaikan checkout.
//
// Digiflazz TIDAK menyediakan ini - API mereka hanya punya inquiry untuk
// pascabayar/PLN, bukan validasi akun game. Jadi sumbernya wajib pihak ketiga,
// dan penyedianya berganti-ganti (yang gratis sering mati). Karena itu yang
// dibangun di sini adalah ADAPTER GENERIK yang dikonfigurasi admin lewat panel:
// URL, header, dan letak nickname di dalam respons JSON semuanya diisi admin.
// Ganti penyedia = ganti isian, bukan ganti kode.
//
// Konfigurasinya disimpan TERENKRIPSI karena bisa memuat API key di header -
// pola sama dengan lib/notify/email-config.ts dan telegram-config.ts.

export interface IdCheckHeader {
  name: string;
  value: string;
}

/**
 * Sumber data cek ID.
 *
 * - `http` — adapter HTTP generik yang dikonfigurasi admin (perilaku lama, tetap
 *   jadi default supaya konfigurasi yang sudah ada tidak berubah artinya).
 * - `okeconnect` — memakai produk CEK* milik OkeConnect lewat kredensial provider
 *   yang sudah tersimpan di /admin/providers. Tidak perlu berlangganan API pihak
 *   ketiga, dan cakupannya bukan cuma game: `CEKPLN` untuk nama pemilik token
 *   PLN, `CEKD`/`CEKGJK`/`CEKSHP`/`CEKOVO` untuk e-wallet.
 */
export type IdCheckProvider = "http" | "okeconnect";

export interface IdCheckConfig {
  /** Saklar induk. Mati = tombol cek ID tidak muncul di produk mana pun. */
  enabled: boolean;
  provider: IdCheckProvider;
  urlTemplate: string;
  method: "GET" | "POST";
  /** Badan request untuk POST (JSON, boleh memuat placeholder). */
  bodyTemplate: string;
  headers: IdCheckHeader[];
  /** Letak nickname di respons, notasi titik: "data.username". */
  nicknamePath: string;
  /** Letak pesan error di respons, dipakai kalau nickname tidak ditemukan. */
  errorPath: string;
  timeoutMs: number;
}

const KEY = "id_check_config";

const DEFAULTS: IdCheckConfig = {
  enabled: false,
  // Default "http" (bukan "okeconnect") supaya konfigurasi yang sudah tersimpan
  // sebelum pilihan ini ada tetap berperilaku persis seperti sebelumnya.
  provider: "http",
  urlTemplate: "",
  method: "GET",
  bodyTemplate: "",
  headers: [],
  nicknamePath: "data.username",
  errorPath: "message",
  timeoutMs: 8000,
};

export async function getIdCheckConfig(): Promise<IdCheckConfig> {
  const row = await db.siteSetting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULTS;
  try {
    const parsed = decryptJson<Partial<IdCheckConfig>>(row.value);
    return {
      enabled: parsed.enabled === true,
      provider: parsed.provider === "okeconnect" ? "okeconnect" : "http",
      urlTemplate: parsed.urlTemplate ?? "",
      method: parsed.method === "POST" ? "POST" : "GET",
      bodyTemplate: parsed.bodyTemplate ?? "",
      headers: Array.isArray(parsed.headers) ? parsed.headers : [],
      nicknamePath: parsed.nicknamePath || DEFAULTS.nicknamePath,
      errorPath: parsed.errorPath ?? DEFAULTS.errorPath,
      timeoutMs: typeof parsed.timeoutMs === "number" ? parsed.timeoutMs : DEFAULTS.timeoutMs,
    };
  } catch (e) {
    console.error("getIdCheckConfig: gagal decrypt", e instanceof Error ? e.message : String(e));
    return DEFAULTS;
  }
}

export async function saveIdCheckConfig(config: IdCheckConfig): Promise<void> {
  await db.siteSetting.upsert({
    where: { key: KEY },
    update: { value: encryptJson(config) },
    create: { key: KEY, value: encryptJson(config) },
  });
}

export interface IdCheckStatus {
  configured: boolean;
  enabled: boolean;
  provider: IdCheckProvider;
  urlTemplate: string;
  method: "GET" | "POST";
  bodyTemplate: string;
  /** Nama header saja - NILAINYA tidak pernah dikirim ke browser (bisa API key). */
  headerNames: string[];
  nicknamePath: string;
  errorPath: string;
  timeoutMs: number;
}

export async function getIdCheckStatus(): Promise<IdCheckStatus> {
  const config = await getIdCheckConfig();
  return {
    // Jalur OkeConnect tidak memakai urlTemplate sama sekali - kesiapannya
    // ditentukan kredensial provider di /admin/providers, bukan di sini.
    configured: config.provider === "okeconnect" ? true : config.urlTemplate !== "",
    enabled: config.enabled,
    provider: config.provider,
    urlTemplate: config.urlTemplate,
    method: config.method,
    bodyTemplate: config.bodyTemplate,
    headerNames: config.headers.map((h) => h.name),
    nicknamePath: config.nicknamePath,
    errorPath: config.errorPath,
    timeoutMs: config.timeoutMs,
  };
}

// Host yang TIDAK BOLEH dituju. URL-nya diisi admin dan di-fetch oleh server
// kita, jadi tanpa penyaring ini panel admin berubah jadi alat untuk memindai
// jaringan internal tempat aplikasi berjalan (SSRF) - termasuk endpoint metadata
// penyedia cloud yang menyimpan kredensial. Admin memang tepercaya, tapi
// akun admin yang jebol seharusnya tidak sekalian memberi akses jaringan dalam.
const BLOCKED_HOST = /^(localhost$|127\.|0\.0\.0\.0$|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;

export function validateIdCheckUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "URL tidak valid.";
  }
  if (parsed.protocol !== "https:") return "URL harus memakai https://";
  if (BLOCKED_HOST.test(parsed.hostname)) return "Host lokal/jaringan internal tidak diizinkan.";
  return null;
}

/** Mengambil nilai bersarang lewat notasi titik, mis. "data.user.nickname". */
function readPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, source);
}

export type IdCheckResult =
  | { ok: true; nickname: string; raw?: string }
  | { ok: false; error: string; raw?: string };

export interface IdCheckParams {
  config: IdCheckConfig;
  /** Kode produk di sisi penyedia (Product.nicknameCheckKey). */
  gameCode: string;
  /** Nilai field yang diisi pembeli - masing-masing jadi placeholder namanya sendiri. */
  target: Record<string, string>;
}

/**
 * Pintu masuk tunggal cek ID. Memilih jalur sesuai `config.provider`.
 *
 * `raw` pada hasilnya HANYA untuk halaman tes admin — jangan pernah ditampilkan
 * ke pembeli. Isinya balasan mentah penyedia yang bisa memuat keterangan internal
 * (saldo kita, kode produk, nomor transaksi).
 */
export async function performIdCheck(params: IdCheckParams): Promise<IdCheckResult> {
  if (params.config.provider === "okeconnect") return performOkeConnectIdCheck(params);
  return performHttpIdCheck(params);
}

/**
 * Cek ID lewat produk CEK* OkeConnect (CEKPLN, CEKD, CEKGJK, CEKML, …).
 *
 * `gameCode` di sini berarti KODE PRODUK CEK, bukan slug permainan. Nomor tujuan
 * dirangkai dari nilai target berurutan tanpa pemisah — aturan yang sama dengan
 * buildCustomerNo() untuk transaksi, supaya cek dan pembelian tidak pernah
 * memakai bentuk tujuan yang berbeda.
 */
async function performOkeConnectIdCheck(params: IdCheckParams): Promise<IdCheckResult> {
  const productCode = params.gameCode.trim();
  if (!productCode) {
    return { ok: false, error: "Produk ini belum diisi kode cek ID-nya." };
  }
  const dest = Object.values(params.target)
    .map((v) => v.trim())
    .filter(Boolean)
    .join("");
  if (!dest) return { ok: false, error: "Isi dulu data akunmu." };

  // Import dinamis: modul provider menarik registry + Prisma, dan file ini juga
  // dipakai jalur publik yang tidak selalu membutuhkannya.
  const { getAdapter } = await import("@/lib/providers/registry");
  const { OkeConnectAdapter } = await import("@/lib/providers/okeconnect");
  const { generateRefId } = await import("@/lib/order/order-number");

  try {
    const adapter = await getAdapter("OKECONNECT");
    if (!(adapter instanceof OkeConnectAdapter)) {
      return { ok: false, error: "Provider OkeConnect belum siap dipakai untuk cek ID." };
    }
    const { name, raw } = await adapter.checkCustomerName({
      productCode,
      dest,
      refId: generateRefId("CEK", new Date()),
    });
    if (!name) {
      // Balasan diterima tapi namanya tidak terbaca. Sengaja TIDAK menampilkan
      // balasan mentah ke pembeli — lihat catatan `raw` di performIdCheck.
      return { ok: false, error: "Nama pemilik tidak ditemukan. Periksa lagi nomor/ID-nya.", raw };
    }
    return { ok: true, nickname: name, raw };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("performOkeConnectIdCheck: gagal", { productCode, error: message });
    return { ok: false, error: "Layanan cek ID sedang tidak bisa dihubungi.", raw: message };
  }
}

async function performHttpIdCheck(params: IdCheckParams): Promise<IdCheckResult> {
  const { config } = params;
  if (!config.urlTemplate) return { ok: false, error: "Cek ID belum dikonfigurasi admin." };

  // Nilai disandikan untuk URL SEBELUM disubstitusikan: input pembeli bisa
  // memuat "&" atau spasi, yang tanpa encoding akan memecah query string dan
  // mengirim parameter yang bukan kita maksud ke penyedia.
  const urlVars: Record<string, string> = { game: encodeURIComponent(params.gameCode) };
  const rawVars: Record<string, string> = { game: params.gameCode };
  for (const [k, v] of Object.entries(params.target)) {
    urlVars[k] = encodeURIComponent(v);
    rawVars[k] = v;
  }

  const url = renderPlainTemplate(config.urlTemplate, urlVars);
  const urlError = validateIdCheckUrl(url);
  if (urlError) return { ok: false, error: urlError };

  const headers: Record<string, string> = {};
  for (const h of config.headers) {
    if (h.name.trim()) headers[h.name.trim()] = renderPlainTemplate(h.value, rawVars);
  }

  let body: string | undefined;
  if (config.method === "POST") {
    headers["content-type"] ??= "application/json";
    // JSON.stringify per nilai, bukan penyisipan mentah - nilai yang memuat
    // tanda kutip akan merusak JSON-nya dan request-nya ditolak penyedia.
    body = renderPlainTemplate(
      config.bodyTemplate,
      Object.fromEntries(Object.entries(rawVars).map(([k, v]) => [k, JSON.stringify(v).slice(1, -1)])),
    );
  }

  let json: unknown;
  try {
    const res = await fetch(url, {
      method: config.method,
      headers,
      body,
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: "no-store",
      // redirect "manual", BUKAN default "follow".
      //
      // validateIdCheckUrl() hanya memeriksa URL AWAL. Dengan "follow", host
      // publik yang lolos pemeriksaan bisa membalas 302 ke
      // http://169.254.169.254/... dan fetch akan mengikutinya tanpa pemeriksaan
      // ulang - membatalkan seluruh tujuan penyaring host di atas.
      //
      // Ini standar yang sudah dipakai di relay ber-IP tetap kita
      // (CURLOPT_FOLLOWLOCATION => false di relay/digiflazz-relay.php); jalur ini
      // yang tertinggal. Penyedia cek ID tidak pernah butuh redirect, jadi
      // menolaknya tidak menghilangkan kemampuan apa pun.
      redirect: "manual",
    });

    // Dengan redirect "manual", respons 3xx sampai ke sini apa adanya. Dijadikan
    // kegagalan yang menyebut sebabnya, supaya admin yang salah mengisi URL
    // (mis. lupa /api, lalu penyedia meredirect) tahu harus memperbaiki apa -
    // bukan sekadar "respons bukan JSON".
    if (res.status >= 300 && res.status < 400) {
      return {
        ok: false,
        error:
          "Penyedia membalas redirect, dan redirect tidak diikuti demi keamanan. " +
          "Isi URL tujuan akhirnya langsung di Admin → Cek ID Game.",
      };
    }

    const text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: `Respons penyedia bukan JSON (status ${res.status}).` };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Query string dibuang sebelum dicatat: banyak penyedia cek ID menaruh API
    // key sebagai parameter URL, dan log ini masuk ke log runtime yang dibaca
    // lebih banyak orang daripada isi panel admin. Prinsip yang sama dengan
    // sanitizeEndpointForLog() di lib/providers/api-log.ts.
    console.error("performIdCheck: panggilan penyedia gagal", {
      url: url.split(/[?#]/)[0],
      error: message,
    });
    return { ok: false, error: "Layanan cek ID sedang tidak bisa dihubungi." };
  }

  const nickname = readPath(json, config.nicknamePath);
  if (typeof nickname === "string" && nickname.trim() !== "") {
    return { ok: true, nickname: nickname.trim() };
  }
  if (typeof nickname === "number") return { ok: true, nickname: String(nickname) };

  const providerError = config.errorPath ? readPath(json, config.errorPath) : undefined;
  return {
    ok: false,
    error:
      typeof providerError === "string" && providerError.trim() !== ""
        ? providerError.trim()
        : "ID tidak ditemukan. Periksa lagi data yang kamu masukkan.",
  };
}
