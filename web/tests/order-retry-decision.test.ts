import { describe, expect, it } from "vitest";
import { decideFulfillmentRetry } from "@/lib/order/retry-decision";

describe("decideFulfillmentRetry", () => {
  it("belum ada attempt sama sekali → send_fresh attempt 1", () => {
    expect(decideFulfillmentRetry([])).toEqual({ action: "send_fresh", nextAttemptNo: 1 });
  });

  it("attempt terakhir SENT (masih dikirim, belum ada hasil) → recheck_status", () => {
    const result = decideFulfillmentRetry([{ id: "f1", attemptNo: 1, status: "SENT" }]);
    expect(result).toEqual({ action: "recheck_status", fulfillmentId: "f1" });
  });

  it("attempt terakhir PROCESSING → recheck_status", () => {
    const result = decideFulfillmentRetry([{ id: "f1", attemptNo: 1, status: "PROCESSING" }]);
    expect(result).toEqual({ action: "recheck_status", fulfillmentId: "f1" });
  });

  it("attempt terakhir FAILED → send_fresh dengan attemptNo berikutnya", () => {
    const result = decideFulfillmentRetry([{ id: "f1", attemptNo: 1, status: "FAILED" }]);
    expect(result).toEqual({ action: "send_fresh", nextAttemptNo: 2 });
  });

  it("attempt terakhir SUCCESS → not_eligible (order sudah selesai)", () => {
    const result = decideFulfillmentRetry([{ id: "f1", attemptNo: 1, status: "SUCCESS" }]);
    expect(result).toEqual({ action: "not_eligible", reason: "Order sudah selesai (SN sudah terbit)." });
  });

  it("banyak attempt tidak berurutan → pilih attemptNo tertinggi, bukan urutan array", () => {
    const result = decideFulfillmentRetry([
      { id: "f2", attemptNo: 2, status: "FAILED" },
      { id: "f1", attemptNo: 1, status: "FAILED" },
    ]);
    expect(result).toEqual({ action: "send_fresh", nextAttemptNo: 3 });
  });
});
