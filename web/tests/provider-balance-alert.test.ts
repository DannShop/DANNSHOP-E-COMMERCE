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
