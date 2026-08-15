import { describe, expect, it } from "vitest";
import { markupBasisCost } from "@/lib/catalog/bulk-markup";

// computeBulkMarkup menyentuh DB, jadi keputusan yang bisa salah secara diam-diam
// dipisahkan ke fungsi murni ini: modal MANA yang jadi dasar markup ketika satu
// item dipetakan ke lebih dari satu provider.
describe("markupBasisCost", () => {
  const sku = (provider: string, costPrice: bigint) => ({ provider, costPrice });

  it("satu provider → modalnya itu yang dipakai", () => {
    expect(markupBasisCost([sku("OKECONNECT", 5089n)])).toBe(5089n);
  });

  it("provider mana pun dihitung, bukan cuma Digiflazz", () => {
    // Bug yang diperbaiki: query-nya dulu menyaring `provider: "DIGIFLAZZ"`, jadi
    // item yang hanya dipetakan ke OkeConnect punya nol SKU di sini dan DILEWATI
    // markup massal tanpa satu pun keterangan di layar.
    expect(markupBasisCost([sku("OKECONNECT", 5089n)])).toBe(5089n);
    expect(markupBasisCost([sku("QIOSPAY", 1200n)])).toBe(1200n);
  });

  it("beberapa provider → modal TERMAHAL yang jadi dasar", () => {
    // Arahnya menentukan uang. Markup dari modal termurah bisa menghasilkan harga
    // jual yang berada DI BAWAH modal provider lain di item yang sama; begitu
    // provider murah gagal dan order jatuh ke cadangan, guard anti-jual-rugi
    // menolaknya dan order gagal. Dari yang termahal, semua provider tetap untung.
    expect(markupBasisCost([sku("DIGIFLAZZ", 5000n), sku("OKECONNECT", 5300n)])).toBe(5300n);
    expect(markupBasisCost([sku("OKECONNECT", 5300n), sku("DIGIFLAZZ", 5000n)])).toBe(5300n);
  });

  it("tanpa mapping → null (item dilewati)", () => {
    expect(markupBasisCost([])).toBeNull();
  });
});
