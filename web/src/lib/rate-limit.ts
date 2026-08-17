import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

/** Berapa kali GAGAL berturut-turut sebelum sebuah akun dikunci sementara. */
export const LOGIN_FAIL_LIMIT = 5;
/** Lama kunci, sekaligus lama sebuah rentetan kegagalan dianggap masih nyambung. */
export const LOGIN_FAIL_WINDOW_MS = 15 * 60_000;

type DbLike = {
  rateLimit: {
    create: (args: { data: { key: string; windowStart: Date; count: number } }) => Promise<unknown>;
    updateMany: (args: {
      where: { key: string; count: { lt: number } };
      data: { count: { increment: number } };
    }) => Promise<{ count: number }>;
  };
};

/** Bentuk yang dibutuhkan penguncian login - baris yang sama, tapi dibaca & ditulis utuh. */
type LockoutDbLike = {
  rateLimit: {
    findUnique: (args: { where: { key: string } }) => Promise<{ windowStart: Date; count: number } | null>;
    upsert: (args: {
      where: { key: string };
      create: { key: string; windowStart: Date; count: number };
      update: { windowStart: Date; count: number };
    }) => Promise<unknown>;
    deleteMany: (args: { where: { key: string } }) => Promise<{ count: number }>;
  };
};

export function computeWindowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

// Ambil entry TERAKHIR dari X-Forwarded-For (hop paling dekat ke server kita), bukan yang
// pertama - di belakang reverse proxy (target deploy Hostinger, satu hop), header datang sebagai
// "<klaim-caller>, <ip-klien-asli>". Entry pertama bisa diisi bebas oleh caller (header apa pun
// bisa dikirim client), jadi mengandalkannya bikin SEMUA rate limit berbasis IP (login, register,
// checkout-guest, order-status, webhook, cron-tick) trivial dilewati dengan memutar-mutar header
// itu, plus bisa dipakai memaksa key IP tertentu (mis. "unknown") supaya bucket-nya habis untuk
// pemanggil asli lain.
export function extractIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}

// Fixed-window rate limiter berbasis tabel RateLimit (bukan in-memory) supaya
// tidak "reset" begitu proses Node restart (deploy/crash/PM2 respawn di
// shared hosting) - spec Fase 7c §H-1.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: Date = new Date(),
  dbClient: DbLike = db as unknown as DbLike,
): Promise<RateLimitResult> {
  const windowStart = computeWindowStart(now, windowMs);
  const fullKey = `${key}:${windowStart.getTime()}`;
  const retryAfterMs = windowStart.getTime() + windowMs - now.getTime();

  try {
    await dbClient.rateLimit.create({ data: { key: fullKey, windowStart, count: 1 } });
    return { allowed: true };
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") {
      // DB error selain race unique-constraint - fail-open, jangan sampai
      // DB bermasalah mengunci seluruh app (spec §6).
      console.error("checkRateLimit: gagal cek limit, fail-open", { key, error: e });
      return { allowed: true };
    }
    // race: request lain di window sama barusan insert row-nya duluan - lanjut ke klaim atomik di bawah
  }

  try {
    const claimed = await dbClient.rateLimit.updateMany({
      where: { key: fullKey, count: { lt: limit } },
      data: { count: { increment: 1 } },
    });
    if (claimed.count === 0) return { allowed: false, retryAfterMs };
    return { allowed: true };
  } catch (e) {
    // DB error pada race recovery path - fail-open juga, jangan sampai updateMany
    // yang dijalankan di hampir setiap request under traffic (setelah P2002 pada create)
    // mengunci app
    console.error("checkRateLimit: gagal update on race, fail-open", { key, error: e });
    return { allowed: true };
  }
}

// ===== Penguncian login setelah beberapa kali GAGAL =====
//
// Beda tujuan dengan checkRateLimit di atas, dan perbedaannya penting:
//
//   checkRateLimit  menghitung SETIAP ketukan pintu (berhasil maupun gagal).
//                   Cocok menahan banjir permintaan, tapi salah alat untuk ini -
//                   orang yang login berkali-kali dengan password benar ikut
//                   dihukum, dan sejak login jadi dua langkah satu login akun
//                   ber-2FA memakan DUA jatah sekaligus.
//   penguncian ini  hanya menghitung KEGAGALAN, dan hitungannya dihapus begitu
//                   satu login berhasil.
//
// Disimpan di tabel RateLimit yang sudah ada, BUKAN di kolom baru pada `User`.
// Itu bukan penghematan migrasi: menulis apa pun ke tabel `User` menaikkan
// `updatedAt`, dan proxy.ts membandingkan kolom itu dengan JWT lalu menendang
// sesinya - jadi satu salah ketik password oleh orang lain akan melempar keluar
// semua sesi yang sedang berjalan. Lihat catatan di lib/auth/two-factor.ts.
//
// `windowStart` di sini berarti "kapan rentetan ini dimulai", dan disetel ULANG
// ke saat kegagalan ke-5 supaya kuncinya benar-benar berdurasi penuh. Kalau
// dibiarkan memakai jendela sejajar-jam seperti checkRateLimit, kegagalan ke-5
// yang kebetulan jatuh di menit ke-14 hanya akan mengunci selama satu menit.
//
// Kuncinya SEMENTARA dengan sengaja. Kunci permanen berarti siapa pun yang tahu
// email adminmu bisa mematikan panelmu kapan saja hanya dengan sengaja salah
// password lima kali - jalan keluarnya cuma reset lewat email atau edit database.

function loginFailKey(email: string): string {
  return `login:fail:${email.trim().toLowerCase()}`;
}

export interface LoginLockout {
  locked: boolean;
  /** Sisa waktu kunci dalam milidetik. 0 kalau tidak terkunci. */
  retryAfterMs: number;
}

const NOT_LOCKED: LoginLockout = { locked: false, retryAfterMs: 0 };

/** Baca-saja: apakah akun ini sedang terkunci? Tidak menambah hitungan apa pun. */
export async function checkLoginLockout(
  email: string,
  now: Date = new Date(),
  dbClient: LockoutDbLike = db as unknown as LockoutDbLike,
): Promise<LoginLockout> {
  if (!email) return NOT_LOCKED;
  try {
    const row = await dbClient.rateLimit.findUnique({ where: { key: loginFailKey(email) } });
    if (!row || row.count < LOGIN_FAIL_LIMIT) return NOT_LOCKED;

    const unlockAt = row.windowStart.getTime() + LOGIN_FAIL_WINDOW_MS;
    const retryAfterMs = unlockAt - now.getTime();
    return retryAfterMs > 0 ? { locked: true, retryAfterMs } : NOT_LOCKED;
  } catch (e) {
    // Fail-open, sikap yang sama dengan checkRateLimit: database bermasalah
    // tidak boleh berubah jadi seluruh orang terkunci di luar akunnya sendiri.
    console.error("checkLoginLockout: gagal baca, fail-open", { error: e });
    return NOT_LOCKED;
  }
}

/**
 * Catat satu kegagalan.
 *
 * Balapan antara dua kegagalan bersamaan bisa membuat satu hitungan terlewat.
 * Itu diterima: taruhannya paling banter satu percobaan ekstra per 15 menit,
 * sementara membuatnya benar-benar atomik menuntut transaksi pada jalur yang
 * dijalankan tiap kali orang salah ketik password.
 */
export async function recordLoginFailure(
  email: string,
  now: Date = new Date(),
  dbClient: LockoutDbLike = db as unknown as LockoutDbLike,
): Promise<void> {
  if (!email) return;
  const key = loginFailKey(email);
  try {
    const row = await dbClient.rateLimit.findUnique({ where: { key } });

    // Rentetan sebelumnya sudah kedaluwarsa (termasuk kunci yang sudah lewat) -
    // mulai hitungan baru dari nol, bukan menumpuk di atas yang lama.
    const expired = row !== null && now.getTime() - row.windowStart.getTime() >= LOGIN_FAIL_WINDOW_MS;
    const count = !row || expired ? 1 : row.count + 1;

    // Saat mencapai batas, jam kunci dimulai DARI SINI. Sebelum itu, windowStart
    // tetap menandai kegagalan pertama dalam rentetan.
    const windowStart = !row || expired || count === LOGIN_FAIL_LIMIT ? now : row.windowStart;

    await dbClient.rateLimit.upsert({
      where: { key },
      create: { key, windowStart: now, count: 1 },
      update: { windowStart, count },
    });
  } catch (e) {
    console.error("recordLoginFailure: gagal mencatat", { error: e });
  }
}

/** Login berhasil - hapus rentetan kegagalan supaya tidak menumpuk lintas sesi. */
export async function clearLoginFailures(
  email: string,
  dbClient: LockoutDbLike = db as unknown as LockoutDbLike,
): Promise<void> {
  if (!email) return;
  try {
    await dbClient.rateLimit.deleteMany({ where: { key: loginFailKey(email) } });
  } catch (e) {
    console.error("clearLoginFailures: gagal membersihkan", { error: e });
  }
}

/** "15 menit" / "1 menit" - dipakai pesan galat supaya orang tahu harus menunggu berapa lama. */
export function formatRetryAfter(retryAfterMs: number): string {
  const minutes = Math.ceil(retryAfterMs / 60_000);
  return `${minutes} menit`;
}
