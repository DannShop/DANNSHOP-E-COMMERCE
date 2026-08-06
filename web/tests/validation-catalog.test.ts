import { describe, expect, it } from "vitest";
import { productSchema, productItemSchema, productItemGroupSchema } from "@/lib/validation/catalog";

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

  const base = { productId: "p1", name: "86 Diamonds", sellingPrice: "10000", memberPrice: "9000" };

  it("flash sale kosong semua (tidak diisi) → diterima, null semua", () => {
    const r = productItemSchema.parse(base);
    expect(r.flashPrice).toBeNull();
    expect(r.flashStartAt).toBeNull();
    expect(r.flashEndAt).toBeNull();
    expect(r.groupId).toBeNull();
  });

  it("flash sale diisi lengkap & valid → diterima", () => {
    const r = productItemSchema.parse({
      ...base,
      flashPrice: "7000",
      flashStartAt: "2026-08-06T09:00",
      flashEndAt: "2026-08-06T11:00",
    });
    expect(r.flashPrice).toBe(7000n);
    expect(r.flashStartAt).toBeInstanceOf(Date);
    expect(r.flashEndAt).toBeInstanceOf(Date);
  });

  it("flash sale diisi sebagian (cuma harga, tanpa jadwal) → ditolak", () => {
    expect(productItemSchema.safeParse({ ...base, flashPrice: "7000" }).success).toBe(false);
  });

  it("harga flash >= harga jual → ditolak", () => {
    expect(
      productItemSchema.safeParse({
        ...base,
        flashPrice: "10000",
        flashStartAt: "2026-08-06T09:00",
        flashEndAt: "2026-08-06T11:00",
      }).success,
    ).toBe(false);
  });

  it("jadwal selesai sebelum/sama dengan jadwal mulai → ditolak", () => {
    expect(
      productItemSchema.safeParse({
        ...base,
        flashPrice: "7000",
        flashStartAt: "2026-08-06T11:00",
        flashEndAt: "2026-08-06T09:00",
      }).success,
    ).toBe(false);
  });

  it("groupId kosong → null (tanpa grup)", () => {
    expect(productItemSchema.parse({ ...base, groupId: "" }).groupId).toBeNull();
  });

  it("groupId diisi → dipertahankan", () => {
    expect(productItemSchema.parse({ ...base, groupId: "group-1" }).groupId).toBe("group-1");
  });
});

describe("productItemGroupSchema", () => {
  it("input valid diterima", () => {
    const r = productItemGroupSchema.parse({ productId: "p1", name: "Diamond", sortOrder: "1" });
    expect(r.name).toBe("Diamond");
    expect(r.sortOrder).toBe(1);
  });

  it("nama kosong ditolak", () => {
    expect(productItemGroupSchema.safeParse({ productId: "p1", name: "" }).success).toBe(false);
  });
});
