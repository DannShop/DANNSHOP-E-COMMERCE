import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import {
  computeSign,
  isIpAllowed,
  parseCustomerNo,
  signCallbackBody,
  signatureMatches,
  SIGN_SALT_BALANCE,
  SIGN_SALT_PRICE_LIST,
} from "@/lib/partner/signature";
import { PARTNER_RC, rcForStatus, toPartnerStatus } from "@/lib/partner/response";

describe("computeSign", () => {
  it("menghasilkan md5(username + apiKey + salt)", () => {
    const expected = createHash("md5").update("tokoabckey123TRX-001").digest("hex");
    expect(computeSign("tokoabc", "key123", "TRX-001")).toBe(expected);
  });

  it("berbeda per salt — tanda tangan cek saldo tidak bisa dipakai ulang untuk price list", () => {
    const balance = computeSign("tokoabc", "key123", SIGN_SALT_BALANCE);
    const priceList = computeSign("tokoabc", "key123", SIGN_SALT_PRICE_LIST);
    expect(balance).not.toBe(priceList);
  });

  it("berbeda per ref_id — tanda tangan satu transaksi tidak berlaku untuk transaksi lain", () => {
    expect(computeSign("a", "k", "TRX-001")).not.toBe(computeSign("a", "k", "TRX-002"));
  });
});

describe("signatureMatches", () => {
  const sign = computeSign("tokoabc", "key123", "TRX-001");

  it("menerima tanda tangan yang benar", () => {
    expect(signatureMatches(sign, sign)).toBe(true);
  });

  it("menerima huruf besar — partner memakai bahasa yang berbeda-beda casing hex-nya", () => {
    expect(signatureMatches(sign, sign.toUpperCase())).toBe(true);
  });

  it("menolak tanda tangan yang salah", () => {
    expect(signatureMatches(sign, computeSign("tokoabc", "keySALAH", "TRX-001"))).toBe(false);
  });

  it("menolak string berpanjang apa pun tanpa melempar", () => {
    expect(signatureMatches(sign, "")).toBe(false);
    expect(signatureMatches(sign, "x".repeat(5000))).toBe(false);
  });
});

describe("isIpAllowed", () => {
  it("mengizinkan semua IP kalau whitelist kosong/null", () => {
    expect(isIpAllowed(null, "1.2.3.4")).toBe(true);
    expect(isIpAllowed("", "1.2.3.4")).toBe(true);
    expect(isIpAllowed("   ", "1.2.3.4")).toBe(true);
  });

  it("mengizinkan IP yang terdaftar, menolak yang tidak", () => {
    expect(isIpAllowed("1.2.3.4, 5.6.7.8", "5.6.7.8")).toBe(true);
    expect(isIpAllowed("1.2.3.4, 5.6.7.8", "9.9.9.9")).toBe(false);
  });

  it("tahan terhadap spasi berlebih di daftar yang diketik admin", () => {
    expect(isIpAllowed("  1.2.3.4 ,   5.6.7.8  ", "1.2.3.4")).toBe(true);
  });
});

describe("parseCustomerNo", () => {
  const ml = [
    { name: "user_id", label: "User ID" },
    { name: "zone_id", label: "Zone ID" },
  ];
  const pulsa = [{ name: "phone_number", label: "Nomor HP" }];

  it("memetakan bagian pipe ke nama field sesuai urutan inputFields", () => {
    const r = parseCustomerNo(ml, "12345678|2201");
    expect(r.ok).toBe(true);
    expect(r.target).toEqual({ user_id: "12345678", zone_id: "2201" });
  });

  it("produk berfield tunggal tidak butuh pipe", () => {
    const r = parseCustomerNo(pulsa, "081234567890");
    expect(r.ok).toBe(true);
    expect(r.target).toEqual({ phone_number: "081234567890" });
  });

  it("menolak jumlah bagian yang tidak cocok, dengan pesan yang menyebut urutannya", () => {
    const r = parseCustomerNo(ml, "12345678");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("User ID|Zone ID");
  });

  it("menolak bagian kosong — '12345678|' tidak boleh lolos jadi zone kosong", () => {
    const r = parseCustomerNo(ml, "12345678|");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Zone ID");
  });

  it("membuang spasi di sekitar tiap bagian", () => {
    const r = parseCustomerNo(ml, " 12345678 | 2201 ");
    expect(r.target).toEqual({ user_id: "12345678", zone_id: "2201" });
  });
});

describe("toPartnerStatus", () => {
  it("memetakan seluruh status antara ke Pending", () => {
    for (const s of ["PENDING_PAYMENT", "PAID", "PROCESSING", "NEEDS_REVIEW", "REFUND_PENDING"]) {
      expect(toPartnerStatus(s)).toBe("Pending");
    }
  });

  it("hanya COMPLETED yang berarti Sukses", () => {
    expect(toPartnerStatus("COMPLETED")).toBe("Sukses");
  });

  it("FAILED/EXPIRED/REFUNDED berarti Gagal", () => {
    expect(toPartnerStatus("FAILED")).toBe("Gagal");
    expect(toPartnerStatus("EXPIRED")).toBe("Gagal");
    expect(toPartnerStatus("REFUNDED")).toBe("Gagal");
  });

  it("status yang belum dikenal jatuh ke Pending, BUKAN Gagal", () => {
    // Kalau suatu hari OrderStatus bertambah, partner tidak boleh mendadak
    // merefund customer-nya untuk transaksi yang sebenarnya masih berjalan.
    expect(toPartnerStatus("STATUS_BARU_YANG_BELUM_ADA")).toBe("Pending");
  });
});

describe("rcForStatus", () => {
  it("memetakan status partner ke rc yang benar", () => {
    expect(rcForStatus("Sukses")).toBe(PARTNER_RC.SUCCESS);
    expect(rcForStatus("Pending")).toBe(PARTNER_RC.PENDING);
    expect(rcForStatus("Gagal")).toBe(PARTNER_RC.FAILED);
  });
});

describe("signCallbackBody", () => {
  it("menghasilkan HMAC-SHA256 hex atas body mentah", () => {
    const body = '{"ref_id":"TRX-001","status":"Sukses"}';
    const expected = createHmac("sha256", "rahasia").update(body).digest("hex");
    expect(signCallbackBody(body, "rahasia")).toBe(expected);
  });

  it("berubah kalau satu karakter body berubah", () => {
    const a = signCallbackBody('{"price":10000}', "s");
    const b = signCallbackBody('{"price":10001}', "s");
    expect(a).not.toBe(b);
  });
});
