import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractCronSecret, isAuthorizedCron } from "@/lib/jobs/cron-auth";

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
