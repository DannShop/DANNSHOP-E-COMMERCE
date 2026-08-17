import { describe, expect, it } from "vitest";
import { computeProfit, initialOrderCostPrice } from "@/lib/order/cost-snapshot";

const rp = (n: number) => BigInt(n);

/**
 * Pencatatan modal & perhitungan laba.
 *
 * Ini angka yang dibaca pemilik toko untuk memutuskan harga. Sifat yang dikunci
 * di sini semuanya punya satu ciri sama: kalau bergeser, tidak ada error yang
 * muncul di mana pun — cuma angka laba yang salah dan terlihat meyakinkan.
 */

describe("initialOrderCostPrice", () => {
  it("MANUAL memakai modal item, dicatat sejak checkout", () => {
    expect(initialOrderCostPrice("MANUAL", rp(15_000))).toBe(rp(15_000));
  });

  it("MANUAL tanpa modal tetap null, bukan nol", () => {
    // Nol berarti "gratis, labanya 100%". Null berarti "tidak tahu". Keduanya
    // sangat berbeda di laporan, dan hanya satu yang jujur.
    expect(initialOrderCostPrice("MANUAL", null)).toBeNull();
  });

  // Modal AUTO baru pasti SETELAH pengiriman berhasil: failover bisa memindahkan
  // order ke provider lain dengan modal berbeda. Mengisinya saat checkout berarti
  // membukukan modal provider yang ternyata tidak pernah memproses apa pun.
  it("AUTO selalu null saat checkout, walau itemnya kebetulan punya modal", () => {
    expect(initialOrderCostPrice("AUTO", rp(15_000))).toBeNull();
    expect(initialOrderCostPrice("AUTO", null)).toBeNull();
  });
});

describe("computeProfit", () => {
  it("menghitung laba dari selisih total dan modal", () => {
    const r = computeProfit([
      { total: rp(20_000), costPrice: rp(15_000) },
      { total: rp(10_000), costPrice: rp(8_000) },
    ]);
    expect(r.revenueWithCost).toBe(rp(30_000));
    expect(r.cost).toBe(rp(23_000));
    expect(r.profit).toBe(rp(7_000));
    expect(r.ordersWithoutCost).toBe(0);
  });

  // INI penjaga utamanya. Menganggap modal null sebagai nol membuat laba
  // terbaca 100% - angka yang terlihat hebat dan sepenuhnya bohong.
  it("order tanpa modal DIKELUARKAN dari perhitungan, bukan dianggap bermodal nol", () => {
    const r = computeProfit([
      { total: rp(20_000), costPrice: rp(15_000) },
      { total: rp(50_000), costPrice: null },
    ]);
    expect(r.profit).toBe(rp(5_000));
    expect(r.revenueWithCost).toBe(rp(20_000));
    expect(r.revenueWithoutCost).toBe(rp(50_000));
    expect(r.ordersWithoutCost).toBe(1);
  });

  it("melaporkan berapa banyak yang dikeluarkan, supaya angkanya bisa dinilai", () => {
    const r = computeProfit([
      { total: rp(1_000), costPrice: null },
      { total: rp(2_000), costPrice: null },
      { total: rp(3_000), costPrice: rp(1_000) },
    ]);
    expect(r.ordersWithoutCost).toBe(2);
    expect(r.revenueWithoutCost).toBe(rp(3_000));
  });

  // Rugi harus TERLIHAT, bukan dijepit ke nol. Laba negatif adalah sinyal
  // paling penting yang bisa diberikan laporan ini.
  it("laba negatif dibiarkan negatif", () => {
    const r = computeProfit([{ total: rp(10_000), costPrice: rp(12_000) }]);
    expect(r.profit).toBe(rp(-2_000));
  });

  it("daftar kosong menghasilkan nol di semua sisi", () => {
    const r = computeProfit([]);
    expect(r).toEqual({
      revenueWithCost: 0n,
      cost: 0n,
      profit: 0n,
      revenueWithoutCost: 0n,
      ordersWithoutCost: 0,
    });
  });

  it("modal nol yang MEMANG nol tetap dihitung sebagai tercatat", () => {
    // Barang hadiah/promo bermodal nol itu sah, dan berbeda dari "belum diisi".
    const r = computeProfit([{ total: rp(5_000), costPrice: 0n }]);
    expect(r.profit).toBe(rp(5_000));
    expect(r.ordersWithoutCost).toBe(0);
  });

  it("omzet bermodal + omzet tanpa modal = seluruh uang masuk", () => {
    const orders = [
      { total: rp(20_000), costPrice: rp(15_000) },
      { total: rp(50_000), costPrice: null },
      { total: rp(7_500), costPrice: rp(7_000) },
    ];
    const r = computeProfit(orders);
    const semua = orders.reduce((sum, o) => sum + o.total, 0n);
    expect(r.revenueWithCost + r.revenueWithoutCost).toBe(semua);
  });
});
