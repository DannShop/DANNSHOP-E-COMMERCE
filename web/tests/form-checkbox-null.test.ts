import { describe, expect, it } from "vitest";
import { productSchema } from "@/lib/validation/catalog";

// Regresi: checkbox HTML yang TIDAK dicentang sama sekali tidak ikut terkirim
// di form submission, sehingga formData.get("namaField") mengembalikan `null`
// (bukan `undefined`, bukan string kosong). Skema Zod yang memakai
// `.optional()` HANYA menerima `undefined`, jadi setiap form dengan checkbox
// tak tercentang gagal validasi dengan pesan yang menyesatkan:
// "Invalid input: expected string, received null".
//
// Gejalanya menipu karena form terasa "kadang bisa kadang tidak": selama
// checkbox-nya tercentang, nilainya "on" dan validasi lolos - error baru
// muncul begitu user melepas centang lalu menyimpan.
//
// Perbaikannya dilakukan di level SKEMA (`.nullish()` = optional + nullable),
// bukan menormalkan `null` di tiap call site, supaya call site baru tidak bisa
// menghidupkan ulang bug ini karena lupa. Test ini mengunci perilaku tersebut.
//
// productSchema dipakai sebagai wakil karena dia satu-satunya skema checkbox
// yang diekspor dari lib/ (skema di actions/* tidak bisa diekspor: file
// ber-directive "use server" hanya boleh mengekspor async function). Skema
// setara di actions/payment-config.ts, banners.ts, payment-methods.ts,
// admin-membership.ts, dan settings.ts memakai pola `.nullish()` yang sama.

describe("skema checkbox menerima null (checkbox tidak dicentang)", () => {
  const base = {
    categoryId: "cat1",
    slug: "mobile-legends",
    name: "Mobile Legends",
    publisher: "Moonton",
    description: "",
    inputFields: '[{"name":"user_id","label":"User ID"}]',
    nicknameCheckKey: "",
  };

  it("isTrending null (tidak dicentang) diterima, bukan error validasi", () => {
    const r = productSchema.safeParse({ ...base, isTrending: null });
    expect(r.success).toBe(true);
  });

  it("isTrending undefined (field tidak ada sama sekali) tetap diterima", () => {
    const r = productSchema.safeParse({ ...base, isTrending: undefined });
    expect(r.success).toBe(true);
  });

  it("isTrending 'on' (dicentang) diterima dan nilainya dipertahankan", () => {
    const r = productSchema.safeParse({ ...base, isTrending: "on" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isTrending).toBe("on");
  });

  it("null dan 'on' menghasilkan boolean yang benar lewat perbandingan === 'on'", () => {
    const unchecked = productSchema.parse({ ...base, isTrending: null });
    const checked = productSchema.parse({ ...base, isTrending: "on" });
    expect(unchecked.isTrending === "on").toBe(false);
    expect(checked.isTrending === "on").toBe(true);
  });
});
