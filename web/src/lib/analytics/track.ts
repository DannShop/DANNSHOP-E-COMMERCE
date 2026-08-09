import { createHash } from "node:crypto";
import { db } from "@/lib/db";

// Pencatatan kunjungan halaman publik.
//
// TIDAK menyimpan alamat IP. Yang disimpan `visitorHash` = SHA-256 dari
// (IP + user agent + garam harian). Sifatnya:
//   - cukup untuk menghitung pengunjung unik DALAM satu hari
//   - tidak bisa dibalik jadi alamat IP
//   - otomatis berubah tiap hari, jadi tidak bisa dipakai merangkai jejak
//     seseorang antar-hari
//
// Garam harian diturunkan dari CREDENTIALS_ENCRYPTION_KEY yang sudah ada.
// Tanpa garam rahasia, hash IP bisa ditebak balik dengan mudah: ruang alamat
// IPv4 cuma 4 miliar, habis di-brute force dalam hitungan menit.

const MAX_PATH_LENGTH = 255;

export type Device = "mobile" | "tablet" | "desktop";

export function detectDevice(userAgent: string): Device {
  const ua = userAgent.toLowerCase();
  // "tablet" dicek DULUAN: hampir semua UA tablet Android juga memuat kata
  // "mobile", jadi urutan terbalik akan menggolongkan semua tablet jadi ponsel.
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(ua)) return "mobile";
  return "desktop";
}

export function dailySalt(now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `${day}:${process.env.CREDENTIALS_ENCRYPTION_KEY ?? "no-key"}`;
}

export function buildVisitorHash(ip: string, userAgent: string, now: Date = new Date()): string {
  return createHash("sha256").update(`${ip}|${userAgent}|${dailySalt(now)}`).digest("hex");
}

/**
 * Host asal rujukan saja, bukan URL penuh.
 *
 * URL rujukan lengkap sering memuat query string yang membawa data pribadi
 * (kata kunci pencarian, token kampanye, kadang bahkan ID sesi situs lain).
 * Untuk laporan "pengunjung datang dari mana", hostname sudah cukup.
 */
export function referrerHost(referrer: string | null, selfHost: string | null): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname;
    // Perpindahan halaman di dalam situs sendiri bukan "rujukan" - kalau ikut
    // dihitung, domain sendiri akan selalu jadi sumber trafik nomor satu dan
    // menenggelamkan sumber yang sebenarnya berguna.
    if (selfHost && host === selfHost) return null;
    return host.slice(0, 191);
  } catch {
    return null;
  }
}

// Path dinormalkan supaya laporan "halaman terpopuler" tidak pecah jadi ribuan
// baris unik. Query string dibuang, dan segmen yang jelas-jelas identitas
// (token invoice, ID) diganti placeholder.
export function normalizePath(rawPath: string): string {
  const path = rawPath.split("?")[0].split("#")[0] || "/";
  const normalized = path
    .replace(/^\/invoice\/[^/]+\/struk$/, "/invoice/:token/struk")
    .replace(/^\/invoice\/[^/]+$/, "/invoice/:token")
    .replace(/^\/account\/deposit\/[^/]+$/, "/account/deposit/:id");
  return normalized.slice(0, MAX_PATH_LENGTH);
}

export interface TrackInput {
  path: string;
  sessionId: string;
  referrer: string | null;
  ip: string;
  userAgent: string;
  selfHost: string | null;
  userId: string | null;
}

/**
 * Menulis satu baris kunjungan. TIDAK PERNAH melempar - halaman publik tidak
 * boleh gagal dimuat gara-gara statistik, dan pengunjung tidak boleh melihat
 * error apa pun dari jalur ini.
 */
export async function recordPageView(input: TrackInput): Promise<boolean> {
  try {
    await db.pageView.create({
      data: {
        path: normalizePath(input.path),
        visitorHash: buildVisitorHash(input.ip, input.userAgent, new Date()),
        sessionId: input.sessionId.slice(0, 64),
        referrerHost: referrerHost(input.referrer, input.selfHost),
        device: detectDevice(input.userAgent),
        userId: input.userId?.slice(0, 64) ?? null,
      },
    });
    return true;
  } catch (e) {
    console.error("recordPageView: gagal menulis", { error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

// Pola user agent robot yang paling umum. Bukan daftar lengkap - mustahil ada
// yang lengkap - tapi cukup menyingkirkan mayoritas perayap mesin pencari dan
// pemantau uptime yang kalau tidak disaring akan membuat grafik "pengunjung"
// naik terus tanpa satu pun manusia sungguhan di baliknya.
const BOT_PATTERN = /bot|crawler|spider|crawling|slurp|facebookexternalhit|preview|monitor|curl|wget|python-requests|headless/i;

export function isLikelyBot(userAgent: string): boolean {
  return userAgent === "" || BOT_PATTERN.test(userAgent);
}
