import { describe, expect, it } from "vitest";
import {
  isOkeConnectAuthRejection,
  parseOkeConnectBalance,
  parseOkeConnectMessage,
} from "@/lib/providers/okeconnect-parse";

// Kalimat di bawah ini disalin APA ADANYA dari dokumentasi resmi OkeConnect
// (koleksi Postman "API H2H Okeconnect", publishedId 2s93ecv9cE) dan dari
// docs/providers/okeconnect.md. Jangan "dirapikan" — nilainya justru pada
// kesamaan persis dengan yang dikirim provider. Kalau provider suatu saat
// mengubah tata kalimatnya, tes inilah yang harus gagal lebih dulu.

describe("parseOkeConnectMessage — balasan transaksi", () => {
  it("membaca 'akan diproses' sebagai pending, bukan sukses", () => {
    const r = parseOkeConnectMessage(
      "T#210286229 R#113 Three 1.000 T1.089660522887 akan diproses. Saldo 279.655 - 1.321 = 278.334 @19:08",
    );
    // "akan diproses" = provider MENERIMA, hasil akhirnya belum ada. Menyebutnya
    // sukses di sini akan menutup order sebelum barang benar-benar terkirim.
    expect(r.status).toBe("pending");
    expect(r.trxId).toBe("210286229");
    expect(r.refId).toBe("113");
    expect(r.costPrice).toBe(1321n);
  });

  it("membaca transaksi open denom yang diterima", () => {
    const r = parseOkeConnectMessage(
      "T#762261897 R#7777 H2H DANA Topup (Bebas Nominal) BBSDN.085736044280 , QTY : 12345 akan diproses. Saldo 43.928.256 - 12.516 = 43.915.740 @19:14",
    );
    expect(r.status).toBe("pending");
    expect(r.refId).toBe("7777");
    expect(r.costPrice).toBe(12516n);
  });

  it("membaca penolakan PIN sebagai gagal", () => {
    const r = parseOkeConnectMessage("R#0 T1.089660522887 GAGAL. Pin Salah");
    expect(r.status).toBe("failed");
    expect(isOkeConnectAuthRejection(r.message)).toBe(true);
  });
});

describe("parseOkeConnectMessage — balasan cek status (check=1)", () => {
  it("sukses + serial number", () => {
    const r = parseOkeConnectMessage(
      "R#113 Three 1.000 T1.089660522887 sudah pernah jam 19:08, status Sukses. SN: R230512.1908.2000FE. Hrg 1.321 Trx ke-2 gunakan format yang benar. Saldo 278.334",
    );
    expect(r.status).toBe("success");
    expect(r.sn).toBe("R230512.1908.2000FE");
    expect(r.costPrice).toBe(1321n);
  });

  it("gagal", () => {
    const r = parseOkeConnectMessage(
      "R#999 Three 5.000 T5.08980204060 sudah pernah jam 18:46, status Gagal. Mohon diperiksa kembali No tujuan sebelum di ulang. Hrg 6.487 Trx ke-2 gunakan format yang benar. Saldo 43.941.230",
    );
    expect(r.status).toBe("failed");
    expect(r.costPrice).toBe(6487n);
  });

  it("pending — 'Menunggu Jawaban' menang atas kata 'status' di kalimat yang sama", () => {
    const r = parseOkeConnectMessage(
      "Mhn tunggu trx sblmnya selesai: T#762221212 R#999 T5.08980204060 @18:46, status Menunggu Jawaban. Saldo 43.941.230",
    );
    expect(r.status).toBe("pending");
    expect(r.notFound).toBe(false);
  });

  it("'TIDAK ADA transaksi' = pending + notFound, BUKAN failed", () => {
    const r = parseOkeConnectMessage(
      "TIDAK ADA transaksi Tujuan 08980204060 pada tgl 22/04/2025. Tidak ada data. Saldo 43.934.743",
    );
    // Kalau ini disimpulkan "failed", order akan di-refund padahal provider cuma
    // belum punya catatannya — transaksinya bisa saja masih dalam perjalanan.
    expect(r.status).toBe("pending");
    expect(r.notFound).toBe(true);
  });
});

describe("parseOkeConnectMessage — callback", () => {
  it("callback sukses + SN", () => {
    const r = parseOkeConnectMessage(
      "T#210288912 R#114 Three 1.000 T1.089660522887 SUKSES. SN: R230512.1911.2100F1. Saldo 278.334 - 1.321 = 277.013 @12/05 19:11",
    );
    expect(r.status).toBe("success");
    expect(r.sn).toBe("R230512.1911.2100F1");
    expect(r.refId).toBe("114");
  });

  it("callback sukses dengan format 'SN/Ref:'", () => {
    const r = parseOkeConnectMessage(
      "T#41168891 R#1234 Telkomsel 5.000 S5.082280004280 SUKSES. SN/Ref: R210630.2203.210045. Saldo 10.795.667 - 1.275 = 10.794.392 @30/06 22:03",
    );
    expect(r.status).toBe("success");
    expect(r.sn).toBe("R210630.2203.210045");
  });

  it("callback gagal", () => {
    const r = parseOkeConnectMessage(
      "T#41169572 R#1235 Telkomsel 5.000 S5.082280004280 GAGAL. Nomor tujuan salah. Saldo 10.795.667 @22:15",
    );
    expect(r.status).toBe("failed");
    expect(r.refId).toBe("1235");
  });
});

describe("parseOkeConnectMessage — default aman", () => {
  // Inti keputusan desain di kepala okeconnect-parse.ts. Kalau seseorang kelak
  // mengubah default jadi "failed" demi "biar order tidak menggantung", tes ini
  // yang harus menghentikannya.
  it.each([
    ["kalimat yang belum pernah dilihat", "Sistem sedang pemeliharaan, silakan coba beberapa saat lagi"],
    ["kosong", ""],
    ["hanya spasi", "   "],
    ["kata acak", "asdfghjkl"],
  ])("%s → pending", (_label, input) => {
    expect(parseOkeConnectMessage(input).status).toBe("pending");
  });
});

describe("parseOkeConnectBalance", () => {
  it("membaca saldo", () => {
    expect(parseOkeConnectBalance("Saldo 284.939")).toBe(284939n);
  });

  it("null kalau bukan kalimat saldo", () => {
    expect(parseOkeConnectBalance("Pin Salah")).toBeNull();
  });
});

describe("isOkeConnectAuthRejection", () => {
  it.each([["Pin Salah"], ["GAGAL. Password Salah"]])("%s → true", (msg) => {
    expect(isOkeConnectAuthRejection(msg)).toBe(true);
  });

  it("kegagalan produk biasa bukan penolakan kredensial", () => {
    expect(isOkeConnectAuthRejection("GAGAL. Nomor tujuan salah")).toBe(false);
  });
});
