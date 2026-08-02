import { describe, expect, it } from "vitest";
import { extractTargetFromFormData, checkoutSchema } from "@/lib/validation/checkout";

describe("extractTargetFromFormData", () => {
  it("ambil semua field target.* dari FormData, buang prefix", () => {
    const fd = new FormData();
    fd.set("productItemId", "item-1");
    fd.set("target.user_id", "123456789");
    fd.set("target.zone_id", "1234");
    fd.set("buyerEmail", "a@b.com");

    expect(extractTargetFromFormData(fd)).toEqual({ user_id: "123456789", zone_id: "1234" });
  });
});

describe("checkoutSchema", () => {
  it("valid kalau productItemId ada, email valid, target minimal 1 field", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target: { user_id: "123456789" },
      paymentMethod: "qris",
    });
    expect(result.success).toBe(true);
  });

  it("gagal kalau email tidak valid", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "bukan-email",
      target: { user_id: "123" },
    });
    expect(result.success).toBe(false);
  });

  it("gagal kalau ada field target kosong", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target: { user_id: "" },
    });
    expect(result.success).toBe(false);
  });

  it("target kosong lolos di level schema (validasi kecocokan dgn inputFields dilakukan terpisah di createCheckoutOrder)", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target: {},
      paymentMethod: "qris",
    });
    expect(result.success).toBe(true); // schema sendiri memang tidak tahu inputFields produk - itu tugas createCheckoutOrder
  });

  it("gagal kalau value field lebih dari 255 karakter", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target: { user_id: "x".repeat(256) },
    });
    expect(result.success).toBe(false);
  });

  it("gagal kalau field lebih dari 10", () => {
    const target: Record<string, string> = {};
    for (let i = 0; i < 11; i++) target[`field${i}`] = "v";
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target,
    });
    expect(result.success).toBe(false);
  });

  it("lolos kalau tepat 10 field, masing-masing 255 karakter", () => {
    const target: Record<string, string> = {};
    for (let i = 0; i < 10; i++) target[`field${i}`] = "x".repeat(255);
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target,
      paymentMethod: "qris",
    });
    expect(result.success).toBe(true);
  });
});

describe("checkoutSchema paymentMethod", () => {
  // Metode sekarang dinamis dari tabel PaymentMethodConfig, bukan literal
  // tetap - skema Zod cuma memastikan field-nya string non-kosong. Validasi
  // keberadaan & status aktif kode metode dilakukan di server action
  // (createCheckoutOrder), bukan di sini.
  it("gagal kalau paymentMethod kosong", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target: { user_id: "123" },
      paymentMethod: "",
    });
    expect(result.success).toBe(false);
  });

  it("terima 'balance' eksplisit", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target: { user_id: "123" },
      paymentMethod: "balance",
    });
    expect(result.success).toBe(true);
  });

  it("terima kode metode apa pun yang non-kosong (keberadaan/status aktifnya dicek di server action, bukan skema)", () => {
    const result = checkoutSchema.safeParse({
      productItemId: "item-1",
      buyerEmail: "a@b.com",
      target: { user_id: "123" },
      paymentMethod: "va_bca",
    });
    expect(result.success).toBe(true);
  });
});
