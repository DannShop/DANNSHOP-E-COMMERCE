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

describe("emailField — perapian sebelum validasi", () => {
  // REGRESI. Dulu emailField memvalidasi DULU baru merapikan, jadi alamat yang
  // cuma kelebihan spasi di ujung ditolak dengan pesan "Email tidak valid" -
  // padahal alamatnya benar. Spasi ikut terbawa dari salin-tempel, saran papan
  // ketik HP, dan pengisi otomatis peramban, jadi ini kena di pintu masuk
  // aplikasi: orang tidak bisa login pakai alamat yang sudah benar.
  it("menerima email berspasi di ujung saat login", () => {
    const hasil = loginSchema.safeParse({ email: "  budi@toko.com  ", password: "12345678" });
    expect(hasil.success).toBe(true);
    expect(hasil.data?.email).toBe("budi@toko.com");
  });

  it("menormalkan huruf besar jadi kecil", () => {
    const hasil = loginSchema.safeParse({ email: "Budi@Toko.COM", password: "12345678" });
    expect(hasil.data?.email).toBe("budi@toko.com");
  });

  it("tetap menolak yang memang bukan email walau sudah dirapikan", () => {
    expect(loginSchema.safeParse({ email: "  bukan-email  ", password: "12345678" }).success).toBe(false);
  });

  it("berlaku di pendaftaran juga, bukan cuma login", () => {
    const hasil = registerSchema.safeParse({
      name: "Wildan",
      email: " Wildan@Toko.com ",
      password: "12345678",
    });
    expect(hasil.success).toBe(true);
    expect(hasil.data?.email).toBe("wildan@toko.com");
  });
});
