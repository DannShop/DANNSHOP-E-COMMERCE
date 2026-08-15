import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@prisma/client";
import { ORDER_STATUSES_BLOCKING_DELETE, describeDeleteBlock } from "@/lib/catalog/delete-guard";

// Penjaga ini menjawab satu pertanyaan uang: boleh tidak item/produk ini dihapus
// sekarang. Jawabannya BUKAN soal kerapian data — lib/order/fulfillment.ts membaca
// ulang ProductItem dengan findUniqueOrThrow saat mengirim order, jadi menghapus
// item yang ordernya belum tuntas membuat job-nya melempar, habis 5 percobaan,
// lalu mati: pembeli sudah bayar, barang tidak terkirim.
const order = (orderNumber: string, status: OrderStatus) => ({ orderNumber, status });

describe("ORDER_STATUSES_BLOCKING_DELETE", () => {
  it("memblokir semua status yang uangnya masih bergerak", () => {
    expect([...ORDER_STATUSES_BLOCKING_DELETE].sort()).toEqual(
      ["NEEDS_REVIEW", "PAID", "PENDING_PAYMENT", "PROCESSING", "REFUND_PENDING"].sort(),
    );
  });

  it("TIDAK memblokir status yang sudah tuntas", () => {
    // Riwayatnya aman tanpa ProductItem: Order menyimpan snapshot productName,
    // itemName, sellingPrice, dan fulfillmentMode. Memblokir status ini berarti
    // produk yang pernah laku sekali tidak akan pernah bisa dibersihkan.
    for (const s of ["COMPLETED", "EXPIRED", "FAILED", "REFUNDED"] as OrderStatus[]) {
      expect(ORDER_STATUSES_BLOCKING_DELETE).not.toContain(s);
    }
  });
});

describe("describeDeleteBlock", () => {
  it("tidak ada order yang menghalangi → null (boleh dihapus)", () => {
    expect(describeDeleteBlock([])).toBeNull();
  });

  it("menyebut nomor ordernya, bukan cuma menolak", () => {
    // Admin harus bisa langsung membuka order yang dimaksud. "Tidak bisa dihapus"
    // tanpa nomor memaksa dia menebak-nebak di halaman Orders.
    const msg = describeDeleteBlock([order("INV-20260815-0007", "PAID")]);
    expect(msg).toContain("INV-20260815-0007");
    expect(msg).toContain("1");
  });

  it("banyak order → beberapa disebut, sisanya diringkas", () => {
    const msg = describeDeleteBlock([
      order("INV-1", "PAID"),
      order("INV-2", "PROCESSING"),
      order("INV-3", "NEEDS_REVIEW"),
      order("INV-4", "PENDING_PAYMENT"),
      order("INV-5", "REFUND_PENDING"),
    ]);
    expect(msg).toContain("INV-1");
    expect(msg).toContain("5");
    // Tidak menempelkan kelima nomor mentah-mentah ke satu kalimat.
    expect(msg).not.toContain("INV-5");
    expect(msg).toContain("lainnya");
  });
});
