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
    });
    expect(result.success).toBe(true); // schema sendiri memang tidak tahu inputFields produk - itu tugas createCheckoutOrder
  });
});
