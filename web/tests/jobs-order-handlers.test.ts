import { describe, expect, it } from "vitest";
import { shouldEscalateRecheck } from "@/lib/jobs/runner";

describe("shouldEscalateRecheck", () => {
  it("attempt < 30 dan masih pending → belum eskalasi", () => {
    expect(shouldEscalateRecheck(29, "pending")).toBe(false);
  });
  it("attempt >= 30 dan masih pending → eskalasi", () => {
    expect(shouldEscalateRecheck(30, "pending")).toBe(true);
  });
  it("status sudah final (success/failed) → tidak pernah eskalasi (sudah selesai)", () => {
    expect(shouldEscalateRecheck(50, "success")).toBe(false);
    expect(shouldEscalateRecheck(50, "failed")).toBe(false);
  });
});
