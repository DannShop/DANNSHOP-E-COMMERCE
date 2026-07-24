import { describe, expect, it } from "vitest";
import { digiflazzCredentialsSchema } from "@/app/actions/providers";

describe("digiflazzCredentialsSchema", () => {
  it("username + apiKey wajib, webhookSecret opsional", () => {
    expect(digiflazzCredentialsSchema.safeParse({ username: "u", apiKey: "k" }).success).toBe(true);
    expect(
      digiflazzCredentialsSchema.safeParse({ username: "u", apiKey: "k", webhookSecret: "s" }).success,
    ).toBe(true);
  });

  it("field kosong ditolak dengan pesan Indonesia", () => {
    const r = digiflazzCredentialsSchema.safeParse({ username: "", apiKey: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/wajib/i);
  });

  it("webhookSecret string kosong dinormalisasi jadi undefined", () => {
    const r = digiflazzCredentialsSchema.parse({ username: "u", apiKey: "k", webhookSecret: "" });
    expect(r.webhookSecret).toBeUndefined();
  });
});
