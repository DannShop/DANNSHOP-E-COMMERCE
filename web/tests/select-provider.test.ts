import { describe, expect, it } from "vitest";
import type { ProviderKey } from "@prisma/client";
import {
  compareFulfillmentSku,
  selectFulfillmentSku,
  type CandidateSku,
} from "@/lib/order/select-provider";

const AKTIF = new Set<ProviderKey>(["DIGIFLAZZ", "OKECONNECT", "QIOSPAY"]);

function sku(o: Partial<CandidateSku> & { provider: ProviderKey; costPrice: bigint }): CandidateSku {
  return {
    providerSkuCode: `${o.provider}-SKU`,
    status: "ACTIVE",
    ...o,
  };
}

describe("selectFulfillmentSku — kelayakan", () => {
  const item = { sellingPrice: 10_000n };

  it("menolak kalau tidak ada SKU sama sekali", () => {
    expect(selectFulfillmentSku(item, [], AKTIF)).toEqual({ ok: false, reason: "no_provider" });
  });

  it("mengabaikan SKU yang statusnya bukan ACTIVE", () => {
    const skus = [sku({ provider: "DIGIFLAZZ", costPrice: 8_000n, status: "UNAVAILABLE" })];
    expect(selectFulfillmentSku(item, skus, AKTIF)).toMatchObject({ reason: "no_provider" });
  });

  it("membedakan provider yang dimatikan admin dari tidak ada SKU", () => {
    // Dibedakan supaya pesan ke admin menunjuk sebab yang benar - "belum
    // dipetakan" dan "kamu sendiri yang mematikannya" butuh tindakan berbeda.
    const skus = [sku({ provider: "SERPUL", costPrice: 8_000n })];
    expect(selectFulfillmentSku(item, skus, AKTIF)).toMatchObject({ reason: "provider_inactive" });
  });

  // PENJAGA UANGNYA. Modal provider bisa naik kapan saja di antara dua sync, dan
  // tanpa gerbang ini setiap order item tersebut rugi diam-diam - tidak ada yang
  // error, cuma selisihnya keluar dari kantong sendiri.
  it("menolak SKU yang modalnya di atas harga jual", () => {
    const skus = [sku({ provider: "DIGIFLAZZ", costPrice: 11_000n })];
    expect(selectFulfillmentSku(item, skus, AKTIF)).toMatchObject({ reason: "price_increased" });
  });

  it("menerima SKU yang modalnya PAS sama dengan harga jual", () => {
    // Batas tepatnya <=, bukan <: nol margin bukan kerugian, dan menolaknya akan
    // mematikan item yang sebenarnya masih sah dijual.
    const skus = [sku({ provider: "DIGIFLAZZ", costPrice: 10_000n })];
    expect(selectFulfillmentSku(item, skus, AKTIF)).toMatchObject({ ok: true });
  });

  it("mengecualikan provider yang sudah dicoba (jalur failover)", () => {
    const skus = [
      sku({ provider: "DIGIFLAZZ", costPrice: 8_000n }),
      sku({ provider: "OKECONNECT", costPrice: 9_000n }),
    ];
    const hasil = selectFulfillmentSku(item, skus, AKTIF, new Set<ProviderKey>(["DIGIFLAZZ"]));
    expect(hasil).toMatchObject({ ok: true, sku: { provider: "OKECONNECT" } });
  });
});

describe("selectFulfillmentSku — urutan pemakaian", () => {
  const item = { sellingPrice: 10_000n };

  it("mengikuti urutan admin walau ada yang lebih murah", () => {
    // Keputusan "produk ini dari provider mana" itu keputusan bisnis (langganan,
    // keandalan, dukungan CS) - selisih beberapa rupiah tidak boleh mengambil
    // alihnya secara otomatis.
    const skus = [
      sku({ provider: "OKECONNECT", costPrice: 7_000n, priority: 50 }),
      sku({ provider: "DIGIFLAZZ", costPrice: 9_000n, priority: 10 }),
    ];
    expect(selectFulfillmentSku(item, skus, AKTIF)).toMatchObject({
      ok: true,
      sku: { provider: "DIGIFLAZZ" },
    });
  });

  it("memakai harga modal sebagai pemecah seri", () => {
    const skus = [
      sku({ provider: "OKECONNECT", costPrice: 9_000n, priority: 10 }),
      sku({ provider: "DIGIFLAZZ", costPrice: 7_000n, priority: 10 }),
    ];
    expect(selectFulfillmentSku(item, skus, AKTIF)).toMatchObject({ sku: { provider: "DIGIFLAZZ" } });
  });
});

describe("compareFulfillmentSku", () => {
  // Diekspor supaya panel admin memakai pembanding yang SAMA untuk menandai
  // mapping "Utama". Panel itu dulu menyalin aturannya, dan salinan yang
  // menyimpang bikin label "Utama" menunjuk provider yang berbeda dari yang
  // benar-benar dipakai mesin fulfillment - tanpa error apa pun.
  it("urutannya sama dengan yang dipakai selectFulfillmentSku", () => {
    const skus = [
      sku({ provider: "OKECONNECT", costPrice: 7_000n, priority: 50 }),
      sku({ provider: "DIGIFLAZZ", costPrice: 9_000n, priority: 10 }),
      sku({ provider: "QIOSPAY", costPrice: 8_000n, priority: 20 }),
    ];
    const teratas = [...skus].sort(compareFulfillmentSku)[0];
    const dipilih = selectFulfillmentSku({ sellingPrice: 10_000n }, skus, AKTIF);
    expect(dipilih).toMatchObject({ ok: true, sku: { provider: teratas.provider } });
  });

  it("deterministik saat prioritas & modal identik", () => {
    // Tanpa pemecah seri nama provider, urutan baris dari DB yang menentukan -
    // dan order yang sama bisa lari ke provider berbeda saat di-retry.
    const a = sku({ provider: "OKECONNECT", costPrice: 8_000n, priority: 10 });
    const b = sku({ provider: "DIGIFLAZZ", costPrice: 8_000n, priority: 10 });
    expect([a, b].sort(compareFulfillmentSku)[0].provider).toBe("DIGIFLAZZ");
    expect([b, a].sort(compareFulfillmentSku)[0].provider).toBe("DIGIFLAZZ");
  });

  it("memperlakukan SKU tanpa priority sebagai nilai bawaan", () => {
    // Baris lama dari sebelum migrasi priority tidak boleh mendadak menang atau
    // kalah hanya karena kolomnya kosong.
    const tanpa = sku({ provider: "OKECONNECT", costPrice: 8_000n });
    const dengan = sku({ provider: "DIGIFLAZZ", costPrice: 8_000n, priority: 100 });
    expect([tanpa, dengan].sort(compareFulfillmentSku)[0].provider).toBe("DIGIFLAZZ");
  });
});
