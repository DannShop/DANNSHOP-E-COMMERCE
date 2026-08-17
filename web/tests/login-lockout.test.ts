import { describe, expect, it } from "vitest";
import {
  LOGIN_FAIL_LIMIT,
  LOGIN_FAIL_WINDOW_MS,
  checkLoginLockout,
  clearLoginFailures,
  formatRetryAfter,
  recordLoginFailure,
} from "@/lib/rate-limit";

/**
 * Penguncian login setelah beberapa kali GAGAL.
 *
 * Yang diuji di sini bukan sekadar "5 kali lalu terkunci", melainkan tiga sifat
 * yang menentukan apakah fitur ini menolong atau justru mengunci orang yang benar:
 *
 *  1. Login berhasil MENGHAPUS hitungan. Tanpa ini, kegagalan menumpuk lintas
 *     hari dan orang yang sesekali salah ketik akan terkunci entah kapan.
 *  2. Kuncinya berdurasi PENUH dari kegagalan terakhir yang memicunya, bukan
 *     sampai batas jendela sejajar-jam yang kebetulan sudah hampir habis.
 *  3. Kuncinya membuka SENDIRI. Kunci permanen berarti siapa pun yang tahu email
 *     admin bisa mematikan panel kapan saja.
 */

function fakeDb() {
  const rows = new Map<string, { windowStart: Date; count: number }>();
  return {
    rows,
    rateLimit: {
      findUnique: async ({ where }: { where: { key: string } }) => rows.get(where.key) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { key: string };
        create: { key: string; windowStart: Date; count: number };
        update: { windowStart: Date; count: number };
      }) => {
        if (rows.has(where.key)) rows.set(where.key, { ...update });
        else rows.set(where.key, { windowStart: create.windowStart, count: create.count });
        return {};
      },
      deleteMany: async ({ where }: { where: { key: string } }) => {
        const existed = rows.delete(where.key);
        return { count: existed ? 1 : 0 };
      },
    },
  };
}

const EMAIL = "admin@dannshop.id";
const T0 = new Date("2026-08-17T10:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

async function failTimes(db: ReturnType<typeof fakeDb>, times: number, from = T0) {
  for (let i = 0; i < times; i++) {
    await recordLoginFailure(EMAIL, new Date(from.getTime() + i * 1000), db as never);
  }
}

describe("penguncian login", () => {
  it("belum terkunci sebelum mencapai batas", async () => {
    const db = fakeDb();
    await failTimes(db, LOGIN_FAIL_LIMIT - 1);
    expect(await checkLoginLockout(EMAIL, at(10_000), db as never)).toEqual({
      locked: false,
      retryAfterMs: 0,
    });
  });

  it("terkunci tepat pada kegagalan ke-5", async () => {
    const db = fakeDb();
    await failTimes(db, LOGIN_FAIL_LIMIT);
    const state = await checkLoginLockout(EMAIL, at(10_000), db as never);
    expect(state.locked).toBe(true);
    expect(state.retryAfterMs).toBeGreaterThan(0);
  });

  // Kalau jam kunci dimulai dari kegagalan PERTAMA, rentetan yang berlangsung
  // 14 menit hanya menghasilkan kunci semenit - praktis tidak menahan apa pun.
  it("menghitung kunci dari kegagalan yang MEMICU, bukan dari yang pertama", async () => {
    const db = fakeDb();
    // Empat kegagalan pertama tersebar hampir sepanjang jendela.
    for (let i = 0; i < LOGIN_FAIL_LIMIT - 1; i++) {
      await recordLoginFailure(EMAIL, at(i * 3 * 60_000), db as never);
    }
    const trigger = at(13 * 60_000);
    await recordLoginFailure(EMAIL, trigger, db as never);

    const state = await checkLoginLockout(EMAIL, trigger, db as never);
    expect(state.locked).toBe(true);
    expect(state.retryAfterMs).toBe(LOGIN_FAIL_WINDOW_MS);
  });

  it("membuka sendiri setelah jendelanya lewat", async () => {
    const db = fakeDb();
    // Jam kunci mulai dari kegagalan PEMICU, jadi patokannya harus kegagalan
    // terakhir - bukan kegagalan pertama. Semua kegagalan ditaruh di satu titik
    // waktu supaya tenggatnya tidak bergeser oleh jarak antar percobaan.
    for (let i = 0; i < LOGIN_FAIL_LIMIT; i++) {
      await recordLoginFailure(EMAIL, T0, db as never);
    }

    const stillLocked = await checkLoginLockout(EMAIL, at(LOGIN_FAIL_WINDOW_MS - 1000), db as never);
    expect(stillLocked.locked).toBe(true);

    const opened = await checkLoginLockout(EMAIL, at(LOGIN_FAIL_WINDOW_MS + 1), db as never);
    expect(opened.locked).toBe(false);
  });

  it("login berhasil menghapus rentetan kegagalan", async () => {
    const db = fakeDb();
    await failTimes(db, LOGIN_FAIL_LIMIT - 1);
    await clearLoginFailures(EMAIL, db as never);

    // Setelah dibersihkan, jatahnya utuh lagi - bukan tinggal satu.
    await failTimes(db, LOGIN_FAIL_LIMIT - 1, at(60_000));
    expect((await checkLoginLockout(EMAIL, at(70_000), db as never)).locked).toBe(false);
  });

  it("kegagalan lama tidak menumpuk ke rentetan baru", async () => {
    const db = fakeDb();
    await failTimes(db, LOGIN_FAIL_LIMIT - 1);

    // Empat kegagalan tadi sudah kedaluwarsa; yang ini memulai hitungan dari 1,
    // bukan menjadi yang kelima dan langsung mengunci.
    const later = at(LOGIN_FAIL_WINDOW_MS + 60_000);
    await recordLoginFailure(EMAIL, later, db as never);
    expect((await checkLoginLockout(EMAIL, later, db as never)).locked).toBe(false);
  });

  it("mengunci per akun, bukan seluruh pengunjung", async () => {
    const db = fakeDb();
    await failTimes(db, LOGIN_FAIL_LIMIT);
    expect((await checkLoginLockout(EMAIL, at(10_000), db as never)).locked).toBe(true);
    expect((await checkLoginLockout("orang.lain@toko.id", at(10_000), db as never)).locked).toBe(false);
  });

  it("email yang sama dengan huruf/spasi berbeda tetap satu hitungan", async () => {
    const db = fakeDb();
    await failTimes(db, LOGIN_FAIL_LIMIT - 1);
    await recordLoginFailure("  ADMIN@DannShop.id  ", at(5000), db as never);
    expect((await checkLoginLockout(EMAIL, at(6000), db as never)).locked).toBe(true);
  });

  it("email kosong tidak pernah menulis baris apa pun", async () => {
    const db = fakeDb();
    await recordLoginFailure("", T0, db as never);
    expect(db.rows.size).toBe(0);
    expect((await checkLoginLockout("", T0, db as never)).locked).toBe(false);
  });

  // Database bermasalah tidak boleh berubah jadi seluruh orang terkunci di luar
  // akunnya sendiri - sikap yang sama sudah dipakai checkRateLimit.
  it("fail-open kalau database bermasalah", async () => {
    const brokenDb = {
      rateLimit: {
        findUnique: async () => {
          throw new Error("db mati");
        },
        upsert: async () => {
          throw new Error("db mati");
        },
        deleteMany: async () => {
          throw new Error("db mati");
        },
      },
    };
    expect((await checkLoginLockout(EMAIL, T0, brokenDb as never)).locked).toBe(false);
    // Tidak melempar keluar - kegagalan mencatat tidak boleh menjatuhkan login.
    await expect(recordLoginFailure(EMAIL, T0, brokenDb as never)).resolves.toBeUndefined();
    await expect(clearLoginFailures(EMAIL, brokenDb as never)).resolves.toBeUndefined();
  });
});

describe("formatRetryAfter", () => {
  it("dibulatkan KE ATAS supaya tidak menyuruh orang mencoba terlalu cepat", () => {
    expect(formatRetryAfter(LOGIN_FAIL_WINDOW_MS)).toBe("15 menit");
    expect(formatRetryAfter(61_000)).toBe("2 menit");
    expect(formatRetryAfter(1_000)).toBe("1 menit");
  });
});
