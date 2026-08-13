import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkCronAuth, extractCronSecret, isAuthorizedCron } from "@/lib/jobs/cron-auth";
import { CRON_STALE_MINUTES, evaluateCronHealth } from "@/lib/jobs/heartbeat";

const ORIGINAL = process.env.CRON_SECRET;
const SECRET = "rahasia-cron-yang-panjang-sekali";

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
});

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("extractCronSecret", () => {
  it("membaca skema proyek ini: x-cron-secret", () => {
    expect(extractCronSecret(headers({ "x-cron-secret": "abc" }))).toBe("abc");
  });

  it("membaca skema Vercel Cron: Authorization: Bearer", () => {
    expect(extractCronSecret(headers({ authorization: "Bearer abc" }))).toBe("abc");
  });

  it("prefix bearer case-insensitive (sah menurut RFC 6750)", () => {
    expect(extractCronSecret(headers({ authorization: "bearer abc" }))).toBe("abc");
    expect(extractCronSecret(headers({ authorization: "BEARER abc" }))).toBe("abc");
  });

  it("Authorization non-Bearer diabaikan, bukan dipakai apa adanya", () => {
    expect(extractCronSecret(headers({ authorization: "Basic abc" }))).toBeNull();
  });

  it("tanpa header apa pun = null", () => {
    expect(extractCronSecret(headers({}))).toBeNull();
  });
});

describe("isAuthorizedCron", () => {
  it("menerima cron eksternal (x-cron-secret) dan cron Vercel (Bearer) dengan secret yang sama", () => {
    expect(isAuthorizedCron(headers({ "x-cron-secret": SECRET }))).toBe(true);
    expect(isAuthorizedCron(headers({ authorization: `Bearer ${SECRET}` }))).toBe(true);
  });

  it("menolak secret yang salah, termasuk yang cuma beda panjang", () => {
    expect(isAuthorizedCron(headers({ "x-cron-secret": "salah" }))).toBe(false);
    expect(isAuthorizedCron(headers({ authorization: `Bearer ${SECRET}x` }))).toBe(false);
  });

  it("TERTUTUP kalau CRON_SECRET tidak terpasang - env hilang tidak boleh membuka endpoint", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCron(headers({ "x-cron-secret": SECRET }))).toBe(false);
    expect(isAuthorizedCron(headers({ authorization: `Bearer ${SECRET}` }))).toBe(false);
    // Termasuk saat pemanggil ikut mengirim string kosong yang "cocok" dgn env kosong.
    expect(isAuthorizedCron(headers({ "x-cron-secret": "" }))).toBe(false);
  });
});

// Sebelum ini, KETIGA keadaan di bawah membalas 401 yang identik — dan itulah
// yang membuat cron mati selama empat hari tidak bisa didiagnosis dari luar:
// memanggil endpoint tanpa secret selalu 401, apa pun sebab sebenarnya.
describe("checkCronAuth — membedakan sebab penolakan", () => {
  it("membedakan CRON_SECRET belum terpasang dari secret yang salah", () => {
    delete process.env.CRON_SECRET;
    const notConfigured = checkCronAuth(headers({ "x-cron-secret": SECRET }));
    expect(notConfigured.ok).toBe(false);
    if (notConfigured.ok) return;
    expect(notConfigured.reason).toBe("secret_not_configured");

    process.env.CRON_SECRET = SECRET;
    const mismatch = checkCronAuth(headers({ "x-cron-secret": "salah" }));
    expect(mismatch.ok).toBe(false);
    if (mismatch.ok) return;
    expect(mismatch.reason).toBe("secret_mismatch");
  });

  it("membedakan 'tidak mengirim secret sama sekali' dari 'secret salah'", () => {
    const none = checkCronAuth(headers({}));
    expect(none.ok).toBe(false);
    if (none.ok) return;
    expect(none.reason).toBe("no_secret_sent");
  });

  it("selalu menyertakan pesan yang bisa ditindaklanjuti, bukan reason mentah saja", () => {
    delete process.env.CRON_SECRET;
    const result = checkCronAuth(headers({}));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/CRON_SECRET/);
    // Menyebut redeploy secara eksplisit: env baru di Vercel TIDAK berlaku untuk
    // deployment yang sudah jalan, dan itu jebakan yang sudah nyata di proyek ini.
    expect(result.message.toLowerCase()).toContain("redeploy");
  });

  // Diagnosis tidak boleh dibayar dengan kebocoran.
  it("tidak pernah membocorkan nilai CRON_SECRET di pesan mana pun", () => {
    process.env.CRON_SECRET = SECRET;
    for (const h of [headers({}), headers({ "x-cron-secret": "salah" })]) {
      const result = checkCronAuth(h);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.message).not.toContain(SECRET);
    }
  });

  it("konsisten dengan isAuthorizedCron", () => {
    process.env.CRON_SECRET = SECRET;
    expect(checkCronAuth(headers({ "x-cron-secret": SECRET })).ok).toBe(isAuthorizedCron(headers({ "x-cron-secret": SECRET })));
    expect(checkCronAuth(headers({})).ok).toBe(isAuthorizedCron(headers({})));
  });
});

describe("evaluateCronHealth", () => {
  const NOW = new Date("2026-08-13T12:00:00Z");

  it("menganggap sehat kalau detaknya masih baru", () => {
    const health = evaluateCronHealth(new Date(NOW.getTime() - 2 * 60_000), NOW);
    expect(health.stale).toBe(false);
    expect(health.minutesSinceLastTick).toBe(2);
  });

  it("menganggap mati begitu melewati ambang", () => {
    const health = evaluateCronHealth(new Date(NOW.getTime() - CRON_STALE_MINUTES * 60_000), NOW);
    expect(health.stale).toBe(true);
  });

  it("masih sehat satu menit sebelum ambang — cron eksternal yang telat sedikit tidak boleh memicu alarm", () => {
    const health = evaluateCronHealth(new Date(NOW.getTime() - (CRON_STALE_MINUTES - 1) * 60_000), NOW);
    expect(health.stale).toBe(false);
  });

  // Keadaan terburuk (cron tidak pernah tersambung sama sekali) justru yang paling
  // sunyi kalau "belum ada data" dianggap sehat.
  it("menganggap 'belum pernah ada detak' sebagai MATI, bukan sebagai belum ada data", () => {
    const health = evaluateCronHealth(null, NOW);
    expect(health.stale).toBe(true);
    expect(health.neverSeen).toBe(true);
    expect(health.minutesSinceLastTick).toBeNull();
  });

  it("melaporkan usia detak dalam menit penuh untuk ditampilkan admin", () => {
    const health = evaluateCronHealth(new Date(NOW.getTime() - 4 * 24 * 60 * 60_000), NOW);
    expect(health.minutesSinceLastTick).toBe(4 * 24 * 60);
    expect(health.stale).toBe(true);
  });
});
