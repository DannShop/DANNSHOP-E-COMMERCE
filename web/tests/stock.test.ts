import { describe, expect, it } from "vitest";
import { hasStock, remainingStock, STOCK_RELEASING_STATUSES } from "@/lib/catalog/stock";
import { VOUCHER_RELEASING_STATUSES } from "@/lib/voucher/usage";
import { maskOrderTarget } from "@/lib/order/customer-no";
import { productItemSchema } from "@/lib/validation/catalog";

describe("remainingStock", () => {
  it("null berarti TAK TERBATAS, bukan nol", () => {
    // Bedanya menentukan apakah item bisa dibeli sama sekali. Menyamakan
    // keduanya jadi 0 akan mematikan seluruh katalog yang tidak memakai stok.
    expect(remainingStock(null, 0)).toBeNull();
    expect(remainingStock(null, 999)).toBeNull();
  });

  it("mengurangi jatah yang sedang dipegang order berjalan", () => {
    expect(remainingStock(10, 3)).toBe(7);
  });

  it("dijepit di nol, tidak pernah minus", () => {
    // Bisa terjadi kalau admin menurunkan stok di bawah jumlah order yang
    // sedang berjalan. Angka minus di layar tidak memberi tahu apa pun yang
    // belum tersampaikan oleh "habis".
    expect(remainingStock(2, 5)).toBe(0);
  });
});

describe("hasStock", () => {
  it("item tanpa batas selalu boleh dibeli", () => {
    expect(hasStock(null, 1_000_000)).toBe(true);
  });

  it("boleh saat sisa PAS satu", () => {
    expect(hasStock(5, 4)).toBe(true);
  });

  it("ditolak saat jatah sudah habis terpakai", () => {
    expect(hasStock(5, 5)).toBe(false);
  });

  it("stok 0 berarti habis, bukan tak terbatas", () => {
    // Penjaga paling penting di berkas ini: kalau 0 sampai diperlakukan seperti
    // null, item yang sengaja dihabiskan admin justru jadi bisa dibeli tanpa batas.
    expect(hasStock(0, 0)).toBe(false);
  });
});

describe("daftar status pelepas", () => {
  it("stok dan voucher melepas pada status yang SAMA", () => {
    // Keduanya menjawab pertanyaan yang sama: "order ini jadi atau tidak".
    // Kalau menyimpang, akan ada order yang melepas kuota vouchernya tapi
    // menahan stok selamanya (atau sebaliknya) - dan tidak ada error apa pun
    // yang muncul, cuma angka yang perlahan salah.
    expect([...STOCK_RELEASING_STATUSES].sort()).toEqual([...VOUCHER_RELEASING_STATUSES].sort());
  });

  it("NEEDS_REVIEW & REFUND_PENDING TIDAK melepas - uangnya sudah masuk", () => {
    expect(STOCK_RELEASING_STATUSES).not.toContain("NEEDS_REVIEW");
    expect(STOCK_RELEASING_STATUSES).not.toContain("REFUND_PENDING");
  });

  it("EXPIRED melepas — inilah yang membuat pembatalan mengembalikan stok", () => {
    // cancelPendingOrder() menandai order sebagai EXPIRED. Kalau status itu
    // hilang dari daftar ini, setiap pembatalan akan menahan stok selamanya.
    expect(STOCK_RELEASING_STATUSES).toContain("EXPIRED");
  });
});

describe("maskOrderTarget", () => {
  it("menyamarkan tengah nomor HP, menyisakan ujungnya", () => {
    expect(maskOrderTarget({ phone_number: "081234567890" })).toBe("08••••••90");
  });

  it("membiarkan angka pendek apa adanya", () => {
    // Zone ID / nomor server tidak mengidentifikasi siapa pun, dan
    // menyamarkannya cuma membuat daftar sulit dibaca.
    expect(maskOrderTarget({ user_id: "1234", zone_id: "22" })).toBe("1234 · 22");
  });

  it("menyamarkan tiap bagian pada tujuan gabungan", () => {
    const hasil = maskOrderTarget({ user_id: "123456789", zone_id: "2201" });
    expect(hasil).toContain("2201");
    expect(hasil).not.toContain("123456789");
  });

  it("tujuan kosong tetap menghasilkan string kosong", () => {
    expect(maskOrderTarget(null)).toBe("");
  });
});

describe("productItemSchema — field baru", () => {
  const dasar = { productId: "p1", name: "86 Diamond", sellingPrice: "22000", memberPrice: "21000" };

  it("stok kosong = tak terbatas (null), BUKAN nol", () => {
    const hasil = productItemSchema.safeParse({ ...dasar, stock: "" });
    expect(hasil.success).toBe(true);
    expect(hasil.data?.stock).toBeNull();
  });

  it("stok \"0\" tersimpan sebagai nol, bukan dianggap kosong", () => {
    const hasil = productItemSchema.safeParse({ ...dasar, stock: "0" });
    expect(hasil.data?.stock).toBe(0);
  });

  it("menolak stok negatif dan pecahan", () => {
    expect(productItemSchema.safeParse({ ...dasar, stock: "-1" }).success).toBe(false);
    expect(productItemSchema.safeParse({ ...dasar, stock: "1.5" }).success).toBe(false);
  });

  it("deskripsi & kode SKU kosong jadi null, terisi dirapikan", () => {
    const kosong = productItemSchema.safeParse({ ...dasar, description: "  ", manualSkuCode: "" });
    expect(kosong.data?.description).toBeNull();
    expect(kosong.data?.manualSkuCode).toBeNull();

    const isi = productItemSchema.safeParse({
      ...dasar,
      description: "  Proses instan  ",
      manualSkuCode: " NETFLIX-1B ",
    });
    expect(isi.data?.description).toBe("Proses instan");
    expect(isi.data?.manualSkuCode).toBe("NETFLIX-1B");
  });

  it("menolak deskripsi di atas 500 karakter", () => {
    expect(productItemSchema.safeParse({ ...dasar, description: "x".repeat(501) }).success).toBe(false);
  });
});
