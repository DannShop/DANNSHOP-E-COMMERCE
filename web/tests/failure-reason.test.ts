import { describe, expect, it } from "vitest";
import { diagnoseFailure } from "@/lib/order/failure-reason";

describe("diagnoseFailure", () => {
  it("mengenali IP belum di-whitelist (kasus nyata 2026-08-08)", () => {
    const d = diagnoseFailure("IP Anda tidak kami kenali: 18.138.233.188");
    expect(d.category).toBe("ip_not_whitelisted");
    expect(d.actionable).toBe(true);
    // Wajib menyebut sifat IP Vercel yang berubah-ubah - tanpa itu admin
    // whitelist satu IP lalu mengira selesai, dan gagal lagi beberapa hari
    // kemudian tanpa tahu kenapa.
    expect(d.action).toMatch(/berubah-ubah|tetap/i);
  });

  it("membedakan saldo provider kurang dari sebab lain", () => {
    expect(diagnoseFailure("Saldo tidak cukup").category).toBe("insufficient_balance");
    expect(diagnoseFailure("Saldo Anda tidak mencukupi untuk transaksi ini").category).toBe("insufficient_balance");
  });

  it("mengenali gangguan produk di sisi provider", () => {
    expect(diagnoseFailure("Produk sedang gangguan").category).toBe("product_issue");
  });

  it("mengenali tujuan tidak valid", () => {
    expect(diagnoseFailure("Nomor tujuan salah").category).toBe("invalid_target");
  });

  it("duplikat ref id tidak menyarankan retry buta", () => {
    const d = diagnoseFailure("Ref ID sudah digunakan");
    expect(d.category).toBe("duplicate");
    expect(d.action).toMatch(/jangan retry buta|cek dulu/i);
  });

  it("pesan asing mengaku tidak tahu, bukan menebak", () => {
    const d = diagnoseFailure("Kode galat 9xz tidak terdokumentasi");
    expect(d.category).toBe("unknown");
    expect(d.actionable).toBe(false);
  });

  it("pesan kosong/null tidak melempar", () => {
    expect(diagnoseFailure(null).category).toBe("unknown");
    expect(diagnoseFailure("").category).toBe("unknown");
    expect(diagnoseFailure(undefined).category).toBe("unknown");
  });
});
