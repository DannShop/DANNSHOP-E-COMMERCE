import { describe, expect, it } from "vitest";
import {
  checkNewEmail,
  tokenState,
  EMAIL_CHANGE_TTL_MS,
} from "@/lib/account/email-change-rules";
import { changeEmailSchema, changeNameSchema } from "@/lib/validation/auth";
import {
  EMAIL_TEMPLATE_KEYS,
  EMAIL_TEMPLATE_META,
  defaultTemplate,
} from "@/lib/notify/email-templates";

describe("checkNewEmail", () => {
  it("menerima alamat yang benar-benar berbeda", () => {
    expect(checkNewEmail({ current: "lama@toko.com", requested: "baru@toko.com" })).toEqual({ ok: true });
  });

  it("menolak alamat yang sama persis", () => {
    const hasil = checkNewEmail({ current: "sama@toko.com", requested: "sama@toko.com" });
    expect(hasil).toMatchObject({ ok: false });
  });

  it("menganggap beda huruf besar/kecil sebagai alamat yang SAMA", () => {
    // emailField sudah menormalkan ke huruf kecil, jadi menerimanya sebagai
    // "perubahan" cuma akan mengirim link konfirmasi untuk sesuatu yang tidak
    // mengubah apa pun.
    const hasil = checkNewEmail({ current: "budi@toko.com", requested: "Budi@Toko.COM" });
    expect(hasil).toMatchObject({ ok: false });
  });

  it("mengabaikan spasi di ujung saat membandingkan", () => {
    const hasil = checkNewEmail({ current: "budi@toko.com", requested: "  budi@toko.com  " });
    expect(hasil).toMatchObject({ ok: false });
  });

  it("menolak alamat kosong", () => {
    expect(checkNewEmail({ current: "budi@toko.com", requested: "   " })).toMatchObject({ ok: false });
  });
});

describe("tokenState", () => {
  const now = new Date("2026-08-16T10:00:00Z");
  const nanti = new Date(now.getTime() + EMAIL_CHANGE_TTL_MS);

  it("token segar yang belum dipakai = valid", () => {
    expect(tokenState({ expiresAt: nanti, usedAt: null }, now)).toBe("valid");
  });

  it("token yang sudah ditukar = used", () => {
    expect(tokenState({ expiresAt: nanti, usedAt: new Date() }, now)).toBe("used");
  });

  it("token lewat masa berlaku = expired", () => {
    const kemarin = new Date(now.getTime() - 1);
    expect(tokenState({ expiresAt: kemarin, usedAt: null }, now)).toBe("expired");
  });

  it("kedaluwarsa TEPAT sekarang sudah tidak berlaku", () => {
    // Batasnya `<=`, bukan `<` - detik terakhir tidak diberi kelonggaran.
    expect(tokenState({ expiresAt: now, usedAt: null }, now)).toBe("expired");
  });

  it("token yang sudah dipakai TETAP terbaca used walau umurnya juga lewat", () => {
    // Penjamin sekali-pakai harus terlihat terpisah dari kedaluwarsa, supaya
    // urutan pemeriksaannya tidak diam-diam terbalik saat kode ini disunting.
    const kemarin = new Date(now.getTime() - 1);
    expect(tokenState({ expiresAt: kemarin, usedAt: new Date() }, now)).toBe("used");
  });
});

describe("changeEmailSchema", () => {
  it("menormalkan email ke huruf kecil dan membuang spasi", () => {
    const hasil = changeEmailSchema.safeParse({
      newEmail: "  Baru@Toko.COM ",
      currentPassword: "rahasia123",
    });
    expect(hasil.success).toBe(true);
    expect(hasil.data?.newEmail).toBe("baru@toko.com");
  });

  it("menolak email yang tidak valid", () => {
    const hasil = changeEmailSchema.safeParse({ newEmail: "bukan-email", currentPassword: "rahasia123" });
    expect(hasil.success).toBe(false);
  });

  it("menolak password kosong", () => {
    // Tanpa password saat ini, sesi yang terlanjur dibajak cukup untuk menukar
    // email lalu memicu reset password ke alamat penyerang.
    const hasil = changeEmailSchema.safeParse({ newEmail: "baru@toko.com", currentPassword: "" });
    expect(hasil.success).toBe(false);
  });
});

describe("changeNameSchema", () => {
  it("membuang spasi di ujung", () => {
    const hasil = changeNameSchema.safeParse({ name: "  Wildan Akbar  " });
    expect(hasil.success).toBe(true);
    expect(hasil.data?.name).toBe("Wildan Akbar");
  });

  it("menolak nama yang cuma spasi", () => {
    expect(changeNameSchema.safeParse({ name: "     " }).success).toBe(false);
  });

  it("menolak nama 1 karakter setelah dirapikan", () => {
    expect(changeNameSchema.safeParse({ name: "  a  " }).success).toBe(false);
  });

  it("menolak nama lebih dari 60 karakter", () => {
    expect(changeNameSchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
  });
});

describe("katalog template email", () => {
  // Menambah key baru TANPA subjek default menghasilkan subjek `undefined` yang
  // baru ketahuan saat email pertama terkirim ke pelanggan sungguhan. Tes ini
  // ikut memeriksa key yang ditambahkan besok tanpa berkas ini disentuh.
  it("setiap key punya meta dan subjek default yang terisi", () => {
    for (const key of EMAIL_TEMPLATE_KEYS) {
      expect(EMAIL_TEMPLATE_META[key], `meta ${key}`).toBeDefined();
      const template = defaultTemplate(key);
      expect(template.subject.trim(), `subjek ${key}`).not.toBe("");
      expect(template.body.trim(), `badan ${key}`).not.toBe("");
    }
  });

  it("template ganti email tersedia untuk alamat baru DAN alamat lama", () => {
    expect(EMAIL_TEMPLATE_KEYS).toContain("email_change_verify");
    expect(EMAIL_TEMPLATE_KEYS).toContain("email_change_notice");
  });

  it("pemberitahuan ke alamat lama TIDAK memuat tombol konfirmasi", () => {
    // Kalau alamat lama juga bisa menyetujui perpindahan, penyerang yang
    // membajak sesi tinggal menyetujuinya sendiri dan peringatan ini kehilangan
    // seluruh gunanya.
    expect(EMAIL_TEMPLATE_META.email_change_notice.blocks).toHaveLength(0);
    expect(defaultTemplate("email_change_notice").body).not.toContain("confirm_url");
  });
});
