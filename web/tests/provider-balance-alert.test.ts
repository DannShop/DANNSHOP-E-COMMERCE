import { describe, expect, it } from "vitest";
import { decideBalanceAlertTransition } from "@/lib/providers/balance-alert";

describe("decideBalanceAlertTransition", () => {
  it("saldo di bawah ambang, status sebelumnya OK → transisi ke LOW, alert low", () => {
    const result = decideBalanceAlertTransition(500_000n, 1_000_000n, "OK");
    expect(result).toEqual({ newStatus: "LOW", alert: "low" });
  });

  it("saldo di atas ambang, status sebelumnya LOW → transisi ke OK, alert recovered", () => {
    const result = decideBalanceAlertTransition(1_500_000n, 1_000_000n, "LOW");
    expect(result).toEqual({ newStatus: "OK", alert: "recovered" });
  });

  it("saldo di atas ambang, status sebelumnya OK → tetap OK, tidak ada alert", () => {
    const result = decideBalanceAlertTransition(1_500_000n, 1_000_000n, "OK");
    expect(result).toEqual({ newStatus: "OK", alert: "none" });
  });

  it("saldo di bawah ambang, status sebelumnya LOW → tetap LOW, tidak ada alert (tidak berulang)", () => {
    const result = decideBalanceAlertTransition(500_000n, 1_000_000n, "LOW");
    expect(result).toEqual({ newStatus: "LOW", alert: "none" });
  });

  it("saldo tepat di ambang batas, status OK → dianggap TIDAK menipis (>= threshold), tetap OK", () => {
    const result = decideBalanceAlertTransition(1_000_000n, 1_000_000n, "OK");
    expect(result).toEqual({ newStatus: "OK", alert: "none" });
  });

  it("saldo tepat di ambang batas, status LOW → dianggap pulih (>= threshold), transisi ke OK", () => {
    const result = decideBalanceAlertTransition(1_000_000n, 1_000_000n, "LOW");
    expect(result).toEqual({ newStatus: "OK", alert: "recovered" });
  });
});

// ===================================================================
// Regresi: status alert harus dievaluasi di SEMUA jalur, bukan cuma cron.
// ===================================================================
// Kejadian nyata 14 Agu 2026: saldo Digiflazz Rp 73, admin menyetel ambang
// Rp 10.000, dan layar tetap menampilkan "Sehat". Sebabnya dua hal yang saling
// memperparah — tombol "Cek Saldo" tidak pernah mengevaluasi status, dan
// menyimpan ambang justru MERESET status ke "OK". Akibatnya keadaan yang salah
// bertahan sampai cron per-jam berjalan.
//
// Tes di bawah mengunci perilaku yang benar pada tingkat keputusannya.
describe("regresi: ambang batas baru langsung dievaluasi terhadap saldo tersimpan", () => {
  it("saldo di bawah ambang yang baru disetel → LOW, bukan tetap OK", () => {
    // Persis kasus yang dilaporkan: 73 vs 10.000. Sebelum perbaikan, status
    // di-reset ke "OK" lalu dibiarkan begitu.
    const t = decideBalanceAlertTransition(73n, 10_000n, "OK");
    expect(t.newStatus).toBe("LOW");
    expect(t.alert).toBe("low");
  });

  it("menaikkan ambang di atas saldo tetap memicu LOW", () => {
    expect(decideBalanceAlertTransition(50_000n, 100_000n, "OK").newStatus).toBe("LOW");
  });

  it("menurunkan ambang di bawah saldo memulihkan status", () => {
    expect(decideBalanceAlertTransition(50_000n, 10_000n, "LOW")).toEqual({
      newStatus: "OK",
      alert: "recovered",
    });
  });
});

describe("regresi: alert tidak boleh hilang karena status dipindahkan diam-diam", () => {
  it("begitu status sudah LOW, evaluasi berikutnya TIDAK mengirim alert lagi", () => {
    // Inilah alasan applyBalanceAlert WAJIB mengirim Telegram setiap kali status
    // berubah, termasuk di jalur yang dipicu admin. Kalau tombol manual
    // memindahkan OK→LOW tanpa mengirim apa pun, cron berikutnya akan melihat
    // kondisi ini — "tidak ada transisi" — dan alertnya hilang selamanya.
    expect(decideBalanceAlertTransition(73n, 10_000n, "LOW").alert).toBe("none");
  });
});
