import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "@/lib/validation/auth";

describe("loginSchema", () => {
  it("menerima input valid", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "12345678" }).success
    ).toBe(true);
  });

  it("menolak email invalid", () => {
    expect(
      loginSchema.safeParse({ email: "bukan-email", password: "12345678" }).success
    ).toBe(false);
  });

  it("menolak password pendek", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "123" }).success
    ).toBe(false);
  });
});

describe("registerSchema", () => {
  it("menerima input valid", () => {
    expect(
      registerSchema.safeParse({
        name: "Wildan",
        email: "a@b.com",
        password: "12345678",
      }).success
    ).toBe(true);
  });

  it("menolak nama terlalu pendek", () => {
    expect(
      registerSchema.safeParse({ name: "W", email: "a@b.com", password: "12345678" })
        .success
    ).toBe(false);
  });
});
