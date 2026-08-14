import { describe, expect, it } from "vitest";
import {
  decideFailover,
  FAILOVER_SAFE_CATEGORIES,
  MAX_FULFILLMENT_ATTEMPTS,
} from "@/lib/order/failover-decision";
import type { FailureCategory } from "@/lib/order/failure-reason";

describe("decideFailover — kategori yang aman", () => {
  it.each(FAILOVER_SAFE_CATEGORIES.map((c) => [c]))(
    "%s → boleh failover (kegagalan terjadi sebelum provider menyentuh produk)",
    (category) => {
      expect(decideFailover({ category, attemptsSoFar: 1 })).toEqual({ failover: true });
    },
  );
});

describe("decideFailover — kategori yang TIDAK boleh di-failover", () => {
  // Tes ini menjaga invariant uang paling penting di fitur multi-provider.
  // Kalau seseorang kelak menambahkan salah satu kategori ini ke daftar aman,
  // di sinilah harus berhenti — bukan di code review.
  const berbahaya: [FailureCategory, string][] = [
    ["duplicate", "provider bilang refID sudah pernah dipakai — transaksi sebelumnya mungkin BERHASIL"],
    ["unknown", "kita tidak tahu barang sudah terkirim atau belum"],
    ["invalid_target", "nomor tujuan salah — provider lain pasti menolak juga"],
  ];

  it.each(berbahaya)("%s → tidak boleh failover (%s)", (category) => {
    expect(decideFailover({ category, attemptsSoFar: 1 })).toEqual({
      failover: false,
      reason: "category_not_safe",
    });
  });
});

describe("decideFailover — batas percobaan", () => {
  it("berhenti setelah mencapai batas, walau kategorinya aman", () => {
    expect(
      decideFailover({ category: "product_issue", attemptsSoFar: MAX_FULFILLMENT_ATTEMPTS }),
    ).toEqual({ failover: false, reason: "attempts_exhausted" });
  });

  it("percobaan di bawah batas masih boleh", () => {
    expect(
      decideFailover({ category: "product_issue", attemptsSoFar: MAX_FULFILLMENT_ATTEMPTS - 1 }),
    ).toEqual({ failover: true });
  });

  it("kategori tidak aman ditolak lebih dulu daripada batas percobaan", () => {
    // Urutan pengecekan penting untuk pesan yang benar di log/histori order.
    expect(decideFailover({ category: "unknown", attemptsSoFar: 0 })).toEqual({
      failover: false,
      reason: "category_not_safe",
    });
  });
});
