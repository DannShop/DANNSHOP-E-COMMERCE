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

export interface IdCheckConfig {
  /** Saklar induk. Mati = tombol cek ID tidak muncul di produk mana pun. */
  enabled: boolean;
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
    configured: config.urlTemplate !== "",
    enabled: config.enabled,
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
  | { ok: true; nickname: string }
  | { ok: false; error: string };

export async function performIdCheck(params: {
  config: IdCheckConfig;
  /** Kode game produk (Product.nicknameCheckKey) - mengisi placeholder {game}. */
  gameCode: string;
  /** Nilai field yang diisi pembeli - masing-masing jadi placeholder namanya sendiri. */
  target: Record<string, string>;
}): Promise<IdCheckResult> {
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
    });
    const text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: `Respons penyedia bukan JSON (status ${res.status}).` };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("performIdCheck: panggilan penyedia gagal", { url, error: message });
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
