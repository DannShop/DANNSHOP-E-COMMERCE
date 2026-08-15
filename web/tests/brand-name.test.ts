import { describe, expect, it } from "vitest";
import { normalizeBrandName } from "@/lib/catalog/brand-name";

// SEMUA contoh di bawah adalah nama brand SUNGGUHAN dari price list OkeConnect
// (diambil 2026-08-15), bukan karangan. Aturannya diturunkan dari data, bukan
// dari tebakan tentang data.
describe("normalizeBrandName", () => {
  it("membuang awalan internal pemasok yang tidak berarti bagi pembeli", () => {
    // "TPG" dan "H2H" adalah penanda lini pasokan di sisi OkeConnect. Pembeli
    // yang mencari "Mobile Legends" tidak akan pernah mengetik "TPG".
    expect(normalizeBrandName("TPG Diamond Mobile Legends")).toBe("Diamond Mobile Legends");
    expect(normalizeBrandName("H2H Token PLN Promo")).toBe("Token PLN Promo");
  });

  it("membakukan singkatan yang datanya sendiri tidak konsisten", () => {
    // Di price list yang sama: Tsel 65x vs Telkomsel 12x, Isat 28x vs Indosat
    // 24x, Vcr 40x vs Voucher 124x. Dibiarkan, satu toko punya dua nama untuk
    // operator yang sama dan pencarian pembeli meleset separuh waktu.
    expect(normalizeBrandName("Tsel Data Mini Harian")).toBe("Telkomsel Data Mini Harian");
    expect(normalizeBrandName("Isat Internet Yellow")).toBe("Indosat Internet Yellow");
    expect(normalizeBrandName("Berlangganan Vcr Wifi ID")).toBe("Berlangganan Voucher Wifi ID");
  });

  it("memperbaiki salah ketik milik provider", () => {
    // Empat ejaan beredar di price list yang sama: Freedom (37x, benar),
    // Freedoom (9x), Fredom (1x), Fredoom (1x).
    expect(normalizeBrandName("Mini Freedoom Sumatra")).toBe("Mini Freedom Sumatera");
    expect(normalizeBrandName("Isat Cetak Voucher Fredom")).toBe("Indosat Cetak Voucher Freedom");
    expect(normalizeBrandName("Isat Cetak Voucher Fredoom")).toBe("Indosat Cetak Voucher Freedom");
    expect(normalizeBrandName("Freedom Internet")).toBe("Freedom Internet");
  });

  it("membuang tanda baca di awal nama", () => {
    expect(normalizeBrandName("+Masa Aktif Tri")).toBe("Masa Aktif Tri");
  });

  it("membuang catatan internal di akhir nama", () => {
    expect(normalizeBrandName("Top Up Saldo Shopee belum Admin")).toBe("Top Up Saldo Shopee");
  });

  it("menggabung beberapa aturan sekaligus", () => {
    expect(normalizeBrandName("Isat Cetak Vcr Freedom Mini North Sumatra")).toBe(
      "Indosat Cetak Voucher Freedom Mini North Sumatera",
    );
  });

  it("merapikan spasi berlebih", () => {
    expect(normalizeBrandName("  Tsel   Data   Mini  ")).toBe("Telkomsel Data Mini");
  });

  it("nama yang sudah rapi dikembalikan apa adanya", () => {
    // Aturan ini tidak boleh "merapikan" yang sudah benar — mengubah nama yang
    // sudah bagus cuma bikin admin kehilangan kepercayaan pada saran otomatisnya.
    for (const clean of ["Telkomsel", "Mobile Legends", "Top Up Saldo Gopay Customer", "Free Fire"]) {
      expect(normalizeBrandName(clean)).toBe(clean);
    }
  });

  it("hanya mengganti KATA UTUH, bukan potongan kata", () => {
    // "Vcr" di dalam kata lain tidak boleh ikut terganti, dan nama yang
    // kebetulan memuat "Isat" sebagai bagian kata harus aman.
    expect(normalizeBrandName("Visat Data")).toBe("Visat Data");
    expect(normalizeBrandName("Tselular")).toBe("Tselular");
  });

  it("tidak pernah mengembalikan string kosong", () => {
    // Kalau seluruh isinya kebetulan tersapu aturan, nama aslinya dipertahankan —
    // produk tanpa nama jauh lebih buruk daripada produk bernama berantakan.
    expect(normalizeBrandName("TPG")).toBe("TPG");
    expect(normalizeBrandName("+++")).toBe("+++");
    expect(normalizeBrandName("   ")).toBe("   ");
  });
});
