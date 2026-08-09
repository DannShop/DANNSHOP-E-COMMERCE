import { describe, expect, it } from "vitest";
import {
  buildVisitorHash,
  detectDevice,
  isLikelyBot,
  normalizePath,
  referrerHost,
} from "@/lib/analytics/track";

describe("detectDevice", () => {
  it("mengenali ponsel", () => {
    expect(detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Mobile")).toBe("mobile");
    expect(detectDevice("Mozilla/5.0 (Linux; Android 14; SM-G991B) Mobile Safari")).toBe("mobile");
  });

  it("mengenali tablet SEBELUM ponsel - UA tablet Android juga memuat kata 'mobile'", () => {
    expect(detectDevice("Mozilla/5.0 (iPad; CPU OS 17_0) AppleWebKit")).toBe("tablet");
    expect(detectDevice("Mozilla/5.0 (Linux; Android 14; SM-X200) Safari")).toBe("tablet");
  });

  it("sisanya desktop", () => {
    expect(detectDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120")).toBe("desktop");
  });
});

describe("isLikelyBot", () => {
  it("menyaring perayap & pemantau yang paling umum", () => {
    expect(isLikelyBot("Googlebot/2.1")).toBe(true);
    expect(isLikelyBot("facebookexternalhit/1.1")).toBe(true);
    expect(isLikelyBot("curl/8.4.0")).toBe(true);
    expect(isLikelyBot("python-requests/2.31")).toBe(true);
  });

  it("user agent kosong dianggap bot", () => {
    expect(isLikelyBot("")).toBe(true);
  });

  it("browser sungguhan lolos", () => {
    expect(isLikelyBot("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36")).toBe(false);
  });
});

describe("normalizePath", () => {
  it("membuang query string dan fragment", () => {
    expect(normalizePath("/mobile-legends?ref=abc#nominal")).toBe("/mobile-legends");
  });

  it("menormalkan token invoice supaya laporan tidak pecah jadi ribuan baris unik", () => {
    expect(normalizePath("/invoice/clx8s9ab000")).toBe("/invoice/:token");
    expect(normalizePath("/invoice/clx8s9ab000/struk")).toBe("/invoice/:token/struk");
  });

  it("menormalkan id deposit", () => {
    expect(normalizePath("/account/deposit/clx123")).toBe("/account/deposit/:id");
  });

  it("path kosong jadi root", () => {
    expect(normalizePath("")).toBe("/");
  });
});

describe("referrerHost", () => {
  it("mengembalikan hostname saja, membuang path & query yang bisa membawa data pribadi", () => {
    expect(referrerHost("https://www.google.com/search?q=rahasia+banget", "dannshop.test")).toBe("www.google.com");
  });

  it("perpindahan halaman di dalam situs sendiri BUKAN rujukan", () => {
    // Kalau ikut dihitung, domain sendiri selalu jadi sumber trafik nomor satu
    // dan menenggelamkan sumber yang benar-benar berguna.
    expect(referrerHost("https://dannshop.test/mobile-legends", "dannshop.test")).toBeNull();
  });

  it("null untuk kunjungan langsung dan referrer yang tidak bisa di-parse", () => {
    expect(referrerHost(null, "dannshop.test")).toBeNull();
    expect(referrerHost("bukan-url", "dannshop.test")).toBeNull();
  });
});

describe("buildVisitorHash", () => {
  it("stabil untuk pengunjung yang sama di hari yang sama", () => {
    const day = new Date("2026-08-09T03:00:00Z");
    const a = buildVisitorHash("1.2.3.4", "UA", day);
    const b = buildVisitorHash("1.2.3.4", "UA", new Date("2026-08-09T21:00:00Z"));
    expect(a).toBe(b);
  });

  it("BERBEDA di hari berikutnya - inilah yang membuatnya tidak bisa melacak orang antar-hari", () => {
    const a = buildVisitorHash("1.2.3.4", "UA", new Date("2026-08-09T12:00:00Z"));
    const b = buildVisitorHash("1.2.3.4", "UA", new Date("2026-08-10T12:00:00Z"));
    expect(a).not.toBe(b);
  });

  it("berbeda untuk IP berbeda", () => {
    const day = new Date("2026-08-09T12:00:00Z");
    expect(buildVisitorHash("1.2.3.4", "UA", day)).not.toBe(buildVisitorHash("5.6.7.8", "UA", day));
  });

  it("tidak memuat alamat IP dalam bentuk apa pun", () => {
    const hash = buildVisitorHash("192.168.1.77", "UA", new Date("2026-08-09T12:00:00Z"));
    expect(hash).not.toContain("192.168");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
