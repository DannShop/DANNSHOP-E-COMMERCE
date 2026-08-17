import { describe, expect, it } from "vitest";
import { canUpgradeTo, quoteUpgrade } from "@/lib/reseller/upgrade";

/**
 * Aturan harga upgrade paket reseller.
 *
 * Ini jalur UANG, dan angkanya dipakai dua kali: sekali untuk ditampilkan ke
 * pembeli, sekali untuk menagihnya. Tes di sini mengunci sifat-sifat yang kalau
 * bergeser tidak akan menimbulkan error di mana pun — cuma tagihan yang salah.
 */

const rp = (n: number) => BigInt(n);

describe("quoteUpgrade", () => {
  it("pembeli paket pertama membayar penuh", () => {
    expect(quoteUpgrade({ tierPrice: rp(150_000), paidForCurrentTier: 0n })).toEqual({
      tierPrice: rp(150_000),
      credit: 0n,
      payable: rp(150_000),
    });
  });

  it("upgrade membayar SELISIHNYA saja", () => {
    // Contoh Wildan: Gold 100rb -> Platinum 150rb = bayar 50rb.
    expect(quoteUpgrade({ tierPrice: rp(150_000), paidForCurrentTier: rp(100_000) }).payable).toBe(rp(50_000));
  });

  it("harga tujuan yang naik menaikkan selisihnya, bukan mengubah kreditnya", () => {
    // Platinum naik jadi 175rb: kredit tetap 100rb (uang yang sudah masuk),
    // yang bertambah tagihannya.
    const q = quoteUpgrade({ tierPrice: rp(175_000), paidForCurrentTier: rp(100_000) });
    expect(q.credit).toBe(rp(100_000));
    expect(q.payable).toBe(rp(75_000));
  });

  // INI pembeda aturan "yang dibayar" vs "harga paket lama hari ini". Kalau
  // suatu saat kreditnya dihitung dari harga tier lama, tes ini yang jatuh.
  it("kreditnya sebesar uang yang benar-benar dibayar, bukan harga paket lama sekarang", () => {
    // Orang ini membayar 100rb untuk Gold. Gold belakangan diturunkan jadi 80rb.
    // Kreditnya tetap 100rb — dia tidak dihukum karena promo yang tak dinikmatinya.
    expect(quoteUpgrade({ tierPrice: rp(150_000), paidForCurrentTier: rp(100_000) }).credit).toBe(rp(100_000));
  });

  // Tagihan negatif di jalur pembayaran mana pun = uang mengalir ke arah salah.
  it("tidak pernah menghasilkan tagihan negatif", () => {
    const q = quoteUpgrade({ tierPrice: rp(50_000), paidForCurrentTier: rp(200_000) });
    expect(q.payable).toBe(0n);
    expect(q.credit).toBe(rp(50_000));
  });

  it("angkanya selalu menjumlah: harga - kredit = bayar", () => {
    const kasus = [
      [150_000, 0],
      [150_000, 100_000],
      [50_000, 200_000],
      [100_000, 100_000],
    ] as const;
    for (const [price, paid] of kasus) {
      const q = quoteUpgrade({ tierPrice: rp(price), paidForCurrentTier: rp(paid) });
      expect(q.tierPrice - q.credit).toBe(q.payable);
    }
  });

  it("nilai bayar rusak (negatif) diperlakukan sebagai nol kredit", () => {
    expect(quoteUpgrade({ tierPrice: rp(100_000), paidForCurrentTier: rp(-5) }).payable).toBe(rp(100_000));
  });
});

describe("canUpgradeTo", () => {
  const base = {
    targetTierId: "platinum",
    targetPrice: rp(150_000),
    targetIsActive: true,
    currentTierId: "gold",
    paidForCurrentTier: rp(100_000),
  };

  it("mengizinkan naik ke paket yang lebih mahal", () => {
    expect(canUpgradeTo(base).ok).toBe(true);
  });

  it("menolak paket yang sedang tidak dijual", () => {
    expect(canUpgradeTo({ ...base, targetIsActive: false }).ok).toBe(false);
  });

  // Paketnya seumur hidup, jadi membeli ulang paket yang sama tidak menambah
  // apa pun - kecuali tagihan.
  it("menolak membeli ulang paket yang sedang dipakai", () => {
    expect(canUpgradeTo({ ...base, targetTierId: "gold" }).ok).toBe(false);
  });

  it("menolak turun paket", () => {
    expect(canUpgradeTo({ ...base, targetPrice: rp(80_000) }).ok).toBe(false);
  });

  // Batas persisnya: harga yang SAMA dengan yang sudah dibayar bukan kenaikan.
  it("menolak paket berbeda yang harganya sama dengan yang sudah dibayar", () => {
    expect(canUpgradeTo({ ...base, targetPrice: rp(100_000) }).ok).toBe(false);
    expect(canUpgradeTo({ ...base, targetPrice: rp(100_001) }).ok).toBe(true);
  });

  it("dari paket gratis, semua paket berbayar terbuka", () => {
    const gratis = { ...base, currentTierId: null, paidForCurrentTier: 0n };
    expect(canUpgradeTo(gratis).ok).toBe(true);
    expect(canUpgradeTo({ ...gratis, targetPrice: rp(1) }).ok).toBe(true);
  });

  it("selalu memberi alasan yang bisa dibaca saat menolak", () => {
    const blocked = canUpgradeTo({ ...base, targetPrice: rp(80_000) });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason.length).toBeGreaterThan(10);
  });
});
