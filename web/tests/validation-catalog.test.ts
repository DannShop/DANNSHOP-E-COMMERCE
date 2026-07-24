import { describe, expect, it } from "vitest";
import { productSchema, productItemSchema } from "@/lib/validation/catalog";

describe("productSchema", () => {
  const valid = {
    categoryId: "cat1", slug: "mobile-legends", name: "Mobile Legends",
    publisher: "Moonton", description: "",
    inputFields: '[{"name":"user_id","label":"User ID"},{"name":"zone_id","label":"Zone ID"}]',
    nicknameCheckKey: "",
  };

  it("input valid diterima, inputFields ter-parse jadi array", () => {
    const r = productSchema.parse(valid);
    expect(r.inputFields).toHaveLength(2);
    expect(r.description).toBeUndefined();
  });

  it("slug dengan huruf besar/spasi ditolak", () => {
    expect(productSchema.safeParse({ ...valid, slug: "Mobile Legends" }).success).toBe(false);
  });

  it("inputFields bukan JSON array → error dengan pesan contoh", () => {
    const r = productSchema.safeParse({ ...valid, inputFields: "{}" });
    expect(r.success).toBe(false);
  });
});

describe("productItemSchema", () => {
  it("harga dari string form di-coerce ke bigint", () => {
    const r = productItemSchema.parse({
      productId: "p1", name: "86 Diamonds", sellingPrice: "22000", memberPrice: "21500", sortOrder: "1",
    });
    expect(r.sellingPrice).toBe(22000n);
    expect(r.memberPrice).toBe(21500n);
  });

  it("harga 0 / negatif ditolak", () => {
    expect(
      productItemSchema.safeParse({ productId: "p1", name: "x", sellingPrice: "0", memberPrice: "1" }).success,
    ).toBe(false);
  });
});
