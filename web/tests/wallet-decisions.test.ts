import { describe, expect, it } from "vitest";
import { hasSufficientBalance, decideRefundDestination } from "@/lib/wallet/decisions";

describe("hasSufficientBalance", () => {
  it("saldo >= total → true", () => {
    expect(hasSufficientBalance(50_000n, 50_000n)).toBe(true);
    expect(hasSufficientBalance(100_000n, 50_000n)).toBe(true);
  });

  it("saldo < total → false", () => {
    expect(hasSufficientBalance(10_000n, 50_000n)).toBe(false);
  });
});

describe("decideRefundDestination", () => {
  it("ada userId (member) → wallet", () => {
    expect(decideRefundDestination("user-1")).toBe("wallet");
  });

  it("tidak ada userId (guest) → queue", () => {
    expect(decideRefundDestination(null)).toBe("queue");
  });
});
