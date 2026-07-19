import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password", () => {
  it("hash lalu verify benar", async () => {
    const hash = await hashPassword("rahasia-banget-123");
    expect(hash).not.toBe("rahasia-banget-123");
    expect(await verifyPassword("rahasia-banget-123", hash)).toBe(true);
  });

  it("password salah ditolak", async () => {
    const hash = await hashPassword("rahasia-banget-123");
    expect(await verifyPassword("salah", hash)).toBe(false);
  });
});
