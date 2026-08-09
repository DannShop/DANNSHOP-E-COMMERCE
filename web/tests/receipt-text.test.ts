import { describe, expect, it } from "vitest";
import { buildReceiptText, RECEIPT_WIDTH, type ReceiptData } from "@/lib/invoice/receipt-text";

// Struk termal dicetak dengan font monospasi berlebar tetap, jadi perataan
// kolomnya sepenuhnya bergantung pada jumlah karakter per baris. Satu baris
// yang melewati batas akan dipotong printer - dan yang paling sering terpotong
// justru kolom nominal di ujung kanan.

const SAMPLE: ReceiptData = {
  brandName: "DannShop",
  tagline: "Topup Game & PPOB",
  addressLines: ["Jl. Contoh No. 1, Jakarta"],
  supportLines: ["WhatsApp: 6281234567890"],
  footerText: "Terima kasih sudah berbelanja di toko kami ya kak.",
  orderNumber: "INV-20260809-0042",
  createdAt: new Date("2026-08-09T10:30:00Z"),
  statusLabel: "Berhasil",
  productName: "Mobile Legends Bang Bang Indonesia",
  itemName: "86 Diamonds",
  target: "123456789 · 1234",
  paymentMethod: "qris",
  sellingPrice: 20_000n,
  fee: 1_000n,
  uniqueCode: 137,
  total: 21_137n,
  sn: "SN-CONTOH-9F2K1P",
  invoiceUrl: "https://dannshop.test/invoice/abc123",
};

describe("buildReceiptText", () => {
  it("lebar 58mm = 32 kolom, tidak ada baris yang melewatinya", () => {
    const lines = buildReceiptText(SAMPLE, "58").split("\n");
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(RECEIPT_WIDTH["58"]);
    }
  });

  it("lebar 80mm = 48 kolom, tidak ada baris yang melewatinya", () => {
    const lines = buildReceiptText(SAMPLE, "80").split("\n");
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(RECEIPT_WIDTH["80"]);
    }
  });

  it("memuat nomor order, total, dan SN", () => {
    const text = buildReceiptText(SAMPLE, "80");
    expect(text).toContain("INV-20260809-0042");
    expect(text).toContain("Rp21.137");
    expect(text).toContain("SN-CONTOH-9F2K1P");
  });

  it("nominal dirata-kanan sampai kolom terakhir", () => {
    const line = buildReceiptText(SAMPLE, "58")
      .split("\n")
      .find((l) => l.startsWith("TOTAL"));
    expect(line).toBeDefined();
    expect(line!).toHaveLength(RECEIPT_WIDTH["58"]);
    expect(line!.endsWith("Rp21.137")).toBe(true);
  });

  it("baris opsional tidak muncul kalau nilainya nol", () => {
    const text = buildReceiptText({ ...SAMPLE, fee: 0n, uniqueCode: 0, sn: null }, "58");
    expect(text).not.toContain("Biaya admin");
    expect(text).not.toContain("Kode unik");
    expect(text).not.toContain("SN / KODE");
  });

  it("teks panjang dipotong jadi beberapa baris, bukan dibuang", () => {
    // Nama produk contoh (34 karakter) lebih lebar dari kertas 58mm.
    const text = buildReceiptText(SAMPLE, "58");
    expect(text).toContain("Mobile Legends");
    expect(text).toContain("Indonesia");
  });
});
