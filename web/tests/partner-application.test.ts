import { describe, expect, it } from "vitest";
import {
  isAcceptableCallbackUrl,
  MONTHLY_VOLUME_VALUES,
  normalizeIpList,
  parseIpList,
  partnerApplicationSchema,
  suggestPartnerUsername,
} from "@/lib/partner/application";

// Bentuk pengajuan yang sah — dipakai sebagai dasar lalu dirusak satu field per
// test, supaya yang diuji benar-benar field itu dan bukan kesalahan lain yang
// kebetulan ikut terbawa.
const VALID = {
  businessName: "Toko Pulsa Berkah",
  businessType: "PERORANGAN" as const,
  businessCity: "Sidoarjo",
  websiteUrl: "https://tokoberkah.id",
  picName: "Budi Santoso",
  picPhone: "081234567890",
  picRole: "Owner",
  platform: "sistem_sendiri",
  serverIps: "103.28.14.5, 103.28.14.6",
  callbackUrl: "https://tokoberkah.id/callback",
  monthlyVolume: "1000_5000",
  notes: "Fokus ke top up game.",
};

describe("partnerApplicationSchema", () => {
  it("menerima pengajuan yang lengkap dan wajar", () => {
    const parsed = partnerApplicationSchema.safeParse(VALID);
    expect(parsed.success).toBe(true);
  });

  it("mengubah field opsional yang kosong jadi null, bukan string kosong", () => {
    const parsed = partnerApplicationSchema.safeParse({
      ...VALID,
      websiteUrl: "",
      picRole: "",
      platform: "",
      serverIps: "",
      callbackUrl: "",
      notes: "",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.websiteUrl).toBeNull();
    expect(parsed.data.serverIps).toBeNull();
    expect(parsed.data.callbackUrl).toBeNull();
    expect(parsed.data.notes).toBeNull();
  });

  // Checkbox/field yang tidak dikirim datang sebagai `null` lewat formData.get(),
  // dan .optional() Zod hanya menerima `undefined` — pola yang sudah pernah
  // menggigit di repo ini (lihat tests/form-checkbox-null.test.ts).
  it("menerima null untuk field opsional yang tidak dikirim sama sekali", () => {
    const parsed = partnerApplicationSchema.safeParse({
      ...VALID,
      websiteUrl: null,
      picRole: null,
      platform: null,
      serverIps: null,
      callbackUrl: null,
      notes: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("menolak nama usaha yang terlalu pendek", () => {
    const parsed = partnerApplicationSchema.safeParse({ ...VALID, businessName: "AB" });
    expect(parsed.success).toBe(false);
  });

  it("menolak nomor WhatsApp yang berisi huruf", () => {
    const parsed = partnerApplicationSchema.safeParse({ ...VALID, picPhone: "0812ABCD5678" });
    expect(parsed.success).toBe(false);
  });

  it("menerima nomor WhatsApp berawalan +62", () => {
    const parsed = partnerApplicationSchema.safeParse({ ...VALID, picPhone: "+62 812-3456-7890" });
    expect(parsed.success).toBe(true);
  });

  it("menolak volume yang tidak ada di daftar pilihan", () => {
    const parsed = partnerApplicationSchema.safeParse({ ...VALID, monthlyVolume: "sejuta" });
    expect(parsed.success).toBe(false);
  });

  it("menerima semua nilai volume yang ditawarkan formnya", () => {
    for (const value of MONTHLY_VOLUME_VALUES) {
      expect(partnerApplicationSchema.safeParse({ ...VALID, monthlyVolume: value }).success).toBe(true);
    }
  });

  it("menolak platform yang tidak dikenal", () => {
    const parsed = partnerApplicationSchema.safeParse({ ...VALID, platform: "otomax-bajakan" });
    expect(parsed.success).toBe(false);
  });

  // Body callback membawa nomor tujuan customer; http polos berarti data itu
  // melintas terbuka.
  it("menolak URL callback http non-localhost", () => {
    const parsed = partnerApplicationSchema.safeParse({ ...VALID, callbackUrl: "http://tokoberkah.id/cb" });
    expect(parsed.success).toBe(false);
  });

  it("mengizinkan http untuk localhost supaya partner bisa mengetes", () => {
    const parsed = partnerApplicationSchema.safeParse({ ...VALID, callbackUrl: "http://localhost:3000/cb" });
    expect(parsed.success).toBe(true);
  });

  it("menolak daftar IP yang salah ketik", () => {
    expect(partnerApplicationSchema.safeParse({ ...VALID, serverIps: "103.28.14" }).success).toBe(false);
    expect(partnerApplicationSchema.safeParse({ ...VALID, serverIps: "103.28.14.256" }).success).toBe(false);
  });
});

describe("isAcceptableCallbackUrl", () => {
  it("menerima https apa pun", () => {
    expect(isAcceptableCallbackUrl("https://a.example.com/cb")).toBe(true);
  });

  it("menolak skema selain http/https", () => {
    expect(isAcceptableCallbackUrl("ftp://a.example.com/cb")).toBe(false);
    expect(isAcceptableCallbackUrl("bukan-url")).toBe(false);
  });

  it("hanya mengizinkan http untuk localhost/127.0.0.1", () => {
    expect(isAcceptableCallbackUrl("http://127.0.0.1:8080/cb")).toBe(true);
    expect(isAcceptableCallbackUrl("http://192.168.1.10/cb")).toBe(false);
  });
});

describe("parseIpList", () => {
  it("memisahkan koma dan baris baru sekaligus", () => {
    const result = parseIpList("103.28.14.5, 103.28.14.6\n103.28.14.7");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ips).toEqual(["103.28.14.5", "103.28.14.6", "103.28.14.7"]);
  });

  it("menolak lebih dari 10 alamat", () => {
    const many = Array.from({ length: 11 }, (_, i) => `10.0.0.${i + 1}`).join(",");
    expect(parseIpList(many).ok).toBe(false);
  });

  it("menolak oktet di atas 255", () => {
    expect(parseIpList("10.0.0.999").ok).toBe(false);
  });

  // IPv6 sah dan extractIp() bisa mengembalikannya; menolaknya akan mengunci
  // partner di luar tanpa alasan.
  it("membiarkan IPv6 lewat", () => {
    const result = parseIpList("2001:db8::1");
    expect(result.ok).toBe(true);
  });

  it("menganggap daftar kosong sebagai sah (berarti tidak dibatasi)", () => {
    const result = parseIpList("   ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ips).toEqual([]);
  });
});

describe("normalizeIpList", () => {
  it("merapikan spasi jadi bentuk kanonik yang disimpan", () => {
    expect(normalizeIpList("103.28.14.5,103.28.14.6")).toBe("103.28.14.5, 103.28.14.6");
  });

  it("mengubah daftar kosong jadi null — kolomnya berarti 'tidak dibatasi'", () => {
    expect(normalizeIpList("")).toBeNull();
    expect(normalizeIpList("  ,  ")).toBeNull();
    expect(normalizeIpList(null)).toBeNull();
  });
});

describe("suggestPartnerUsername", () => {
  it("mengubah nama usaha jadi slug yang lolos aturan username", () => {
    expect(suggestPartnerUsername("Toko Pulsa Berkah")).toBe("toko-pulsa-berkah");
    expect(suggestPartnerUsername("CV. Maju  Jaya!!")).toBe("cv-maju-jaya");
  });

  it("tidak pernah menyisakan strip di ujung", () => {
    expect(suggestPartnerUsername("Toko --- ")).not.toMatch(/-$/);
  });

  it("memotong di 40 karakter, batas yang sama dengan usernameSchema", () => {
    const suggestion = suggestPartnerUsername("A".repeat(80));
    expect(suggestion.length).toBeLessThanOrEqual(40);
  });

  // Usulan yang pasti ditolak lebih buruk daripada tidak ada usulan: admin akan
  // menekan Setujui, gagal, lalu harus menebak apa yang salah.
  it("mengembalikan string kosong kalau tidak ada yang bisa dijadikan username", () => {
    expect(suggestPartnerUsername("!!!")).toBe("");
    expect(suggestPartnerUsername("ab")).toBe("");
  });
});
