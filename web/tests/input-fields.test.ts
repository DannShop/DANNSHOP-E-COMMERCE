import { describe, expect, it } from "vitest";
import { productSchema } from "@/lib/validation/catalog";
import {
  normalizeFieldName,
  presetForCategorySlug,
} from "@/lib/catalog/input-field-presets";

// Bentuk minimal yang lolos productSchema, supaya tiap tes di bawah cuma
// mengubah `inputFields` dan tidak ikut gagal karena field lain.
function baseProduct(inputFields: string) {
  return {
    categoryId: "cat_1",
    slug: "produk-uji",
    name: "Produk Uji",
    inputFields,
    fulfillmentMode: "AUTO" as const,
  };
}

describe("productSchema.inputFields — bentuk yang sah", () => {
  it("menerima daftar field yang benar dan merapikan spasi", () => {
    const parsed = productSchema.safeParse(
      baseProduct(JSON.stringify([{ name: " user_id ", label: "  User ID  " }])),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.inputFields).toEqual([{ name: "user_id", label: "User ID" }]);
    }
  });

  it("menerima daftar kosong — produk manual tidak meminta data tujuan apa pun", () => {
    const parsed = productSchema.safeParse(baseProduct("[]"));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.inputFields).toEqual([]);
  });

  it("mempertahankan URUTAN field", () => {
    // Urutan menentukan bentuk nomor tujuan: buildCustomerNo() merangkai nilainya
    // berurutan tanpa pemisah. Tertukar = terkirim ke akun yang salah.
    const parsed = productSchema.safeParse(
      baseProduct(
        JSON.stringify([
          { name: "user_id", label: "User ID" },
          { name: "zone_id", label: "Zone ID" },
        ]),
      ),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.inputFields.map((f) => f.name)).toEqual(["user_id", "zone_id"]);
    }
  });
});

describe("productSchema.inputFields — bentuk yang HARUS ditolak", () => {
  // Semua kasus di bawah dulu lolos (validasinya cuma "harus array"), dan
  // akibatnya baru terlihat di halaman pembeli sebagai produk yang tidak bisa
  // dibeli sama sekali — jauh dari tempat kesalahannya dibuat.
  it.each([
    ["bukan JSON", "bukan-json"],
    ["bukan array", JSON.stringify({ name: "user_id", label: "User ID" })],
    ["baris bukan objek", JSON.stringify(["user_id"])],
    ["name bukan string", JSON.stringify([{ name: 1, label: "User ID" }])],
    ["label hilang", JSON.stringify([{ name: "user_id" }])],
    ["name kosong", JSON.stringify([{ name: "   ", label: "User ID" }])],
    ["label kosong", JSON.stringify([{ name: "user_id", label: "  " }])],
    ["name ada spasi", JSON.stringify([{ name: "user id", label: "User ID" }])],
    ["name huruf besar", JSON.stringify([{ name: "userId", label: "User ID" }])],
    [
      "name kembar",
      JSON.stringify([
        { name: "user_id", label: "User ID" },
        { name: "user_id", label: "ID Lain" },
      ]),
    ],
  ])("tolak: %s", (_label, inputFields) => {
    expect(productSchema.safeParse(baseProduct(inputFields)).success).toBe(false);
  });
});

describe("presetForCategorySlug", () => {
  it("games mulai dengan User ID", () => {
    expect(presetForCategorySlug("games")).toEqual([{ name: "user_id", label: "User ID" }]);
  });

  it("token listrik minta nomor meter, bukan nomor HP", () => {
    expect(presetForCategorySlug("pln")[0].name).toBe("no_meter");
  });

  it("kategori buatan admin (slug tak dikenal) jatuh ke preset umum", () => {
    expect(presetForCategorySlug("kategori-karangan-sendiri")).toEqual([
      { name: "tujuan", label: "Nomor Tujuan" },
    ]);
    expect(presetForCategorySlug(undefined)).toEqual([{ name: "tujuan", label: "Nomor Tujuan" }]);
  });

  it("mengembalikan salinan baru, bukan rujukan ke konstanta modul", () => {
    // Kalau ini rujukan bersama, menyunting field di satu produk akan mengubah
    // preset untuk produk berikutnya yang dibuka di sesi yang sama.
    const a = presetForCategorySlug("games");
    a[0].label = "Diubah";
    expect(presetForCategorySlug("games")[0].label).toBe("User ID");
  });

  it("setiap preset menghasilkan nama teknis yang lolos validasi server", () => {
    // Menjaga agar preset dan aturan di productSchema tidak pernah berselisih —
    // preset yang ditolak server-nya sendiri adalah jebakan yang paling
    // membingungkan buat admin.
    for (const slug of ["games", "pulsa-data", "pln", "e-money", "tagihan", "tidak-dikenal"]) {
      for (const f of presetForCategorySlug(slug)) {
        expect(f.name).toMatch(/^[a-z0-9_]+$/);
        expect(f.label.trim()).not.toBe("");
      }
    }
  });
});

describe("normalizeFieldName", () => {
  it.each([
    ["User ID", "user_id"],
    ["Zone ID  ", "zone_id"],
    ["Nomor Meter / ID Pelanggan", "nomor_meter_id_pelanggan"],
    ["  ", ""],
    ["e-mail", "e_mail"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeFieldName(input)).toBe(expected);
  });
});
