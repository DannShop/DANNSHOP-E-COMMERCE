import { describe, expect, it } from "vitest";
import { mapMidtransStatus } from "@/lib/midtrans/status-mapping";

describe("mapMidtransStatus", () => {
  it("settlement → paid", () => expect(mapMidtransStatus("settlement")).toBe("paid"));
  it("capture + fraud accept → paid", () => expect(mapMidtransStatus("capture", "accept")).toBe("paid"));
  it("capture + fraud challenge/deny → failed", () => expect(mapMidtransStatus("capture", "challenge")).toBe("failed"));
  it("pending → pending", () => expect(mapMidtransStatus("pending")).toBe("pending"));
  it("expire → expired", () => expect(mapMidtransStatus("expire")).toBe("expired"));
  it("cancel → failed", () => expect(mapMidtransStatus("cancel")).toBe("failed"));
  it("deny → failed", () => expect(mapMidtransStatus("deny")).toBe("failed"));
});
