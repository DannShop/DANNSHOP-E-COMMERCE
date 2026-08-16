import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const verifyPassword = vi.fn();
const verifySecondFactor = vi.fn();

vi.mock("@/lib/db", () => ({ db: { user: { findUnique } } }));
vi.mock("@/lib/password", () => ({ verifyPassword }));
vi.mock("@/lib/auth/two-factor", () => ({ verifySecondFactor }));

const AKUN = {
  id: "u1",
  email: "budi@toko.com",
  name: "Budi",
  role: "USER" as const,
  passwordHash: "hash",
  updatedAt: new Date("2026-08-16T00:00:00Z"),
  bannedAt: null as Date | null,
  totpEnabledAt: null as Date | null,
};

const KREDENSIAL = { email: "budi@toko.com", password: "rahasia123" };

beforeEach(() => {
  findUnique.mockReset();
  verifyPassword.mockReset();
  verifySecondFactor.mockReset();
});

async function cek(input: { email: unknown; password: unknown; totp?: unknown }) {
  const { checkCredentials } = await import("@/lib/auth/credentials");
  return checkCredentials(input);
}

describe("checkCredentials — dasar", () => {
  it("email tidak terdaftar = invalid, tanpa pernah memeriksa password", async () => {
    findUnique.mockResolvedValue(null);
    expect(await cek(KREDENSIAL)).toEqual({ kind: "invalid" });
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("password salah = invalid", async () => {
    findUnique.mockResolvedValue(AKUN);
    verifyPassword.mockResolvedValue(false);
    expect(await cek(KREDENSIAL)).toEqual({ kind: "invalid" });
  });

  it("password benar tanpa 2FA = langsung ok", async () => {
    findUnique.mockResolvedValue(AKUN);
    verifyPassword.mockResolvedValue(true);
    const hasil = await cek(KREDENSIAL);
    expect(hasil.kind).toBe("ok");
    expect(hasil).toMatchObject({ user: { id: "u1", role: "USER" } });
  });

  it("input yang tidak lolos skema = invalid, tidak menyentuh database", async () => {
    expect(await cek({ email: "bukan-email", password: "x" })).toEqual({ kind: "invalid" });
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("checkCredentials — alur dua langkah", () => {
  const AKUN_2FA = { ...AKUN, totpEnabledAt: new Date("2026-08-01T00:00:00Z") };

  it("password benar + kode kosong = totp_required (BUKAN invalid)", async () => {
    // Inti alur dua langkah. Kalau ini balik jadi "invalid", kolom kode tidak
    // akan pernah muncul dan pemilik 2FA terkunci di luar akunnya sendiri.
    findUnique.mockResolvedValue(AKUN_2FA);
    verifyPassword.mockResolvedValue(true);
    expect(await cek({ ...KREDENSIAL, totp: "" })).toEqual({ kind: "totp_required" });
  });

  it("kode berisi spasi saja tetap dianggap kosong", async () => {
    findUnique.mockResolvedValue(AKUN_2FA);
    verifyPassword.mockResolvedValue(true);
    expect(await cek({ ...KREDENSIAL, totp: "   " })).toEqual({ kind: "totp_required" });
  });

  it("password SALAH pada akun ber-2FA = invalid, BUKAN totp_required", async () => {
    // PENJAGA PALING PENTING di berkas ini. Kalau urutannya terbalik, langkah
    // pertama berubah jadi alat memeriksa "akun ini ada dan pakai 2FA" tanpa
    // perlu tahu passwordnya sama sekali.
    findUnique.mockResolvedValue(AKUN_2FA);
    verifyPassword.mockResolvedValue(false);
    expect(await cek({ ...KREDENSIAL, totp: "" })).toEqual({ kind: "invalid" });
    expect(verifySecondFactor).not.toHaveBeenCalled();
  });

  it("kode benar = ok", async () => {
    findUnique.mockResolvedValue(AKUN_2FA);
    verifyPassword.mockResolvedValue(true);
    verifySecondFactor.mockResolvedValue(true);
    expect((await cek({ ...KREDENSIAL, totp: "123456" })).kind).toBe("ok");
  });

  it("kode salah = invalid", async () => {
    findUnique.mockResolvedValue(AKUN_2FA);
    verifyPassword.mockResolvedValue(true);
    verifySecondFactor.mockResolvedValue(false);
    expect(await cek({ ...KREDENSIAL, totp: "000000" })).toEqual({ kind: "invalid" });
  });
});

describe("checkCredentials — akun ditangguhkan", () => {
  it("akun banned = invalid walau passwordnya benar", async () => {
    findUnique.mockResolvedValue({ ...AKUN, bannedAt: new Date() });
    verifyPassword.mockResolvedValue(true);
    expect(await cek(KREDENSIAL)).toEqual({ kind: "invalid" });
  });

  it("akun banned ber-2FA TIDAK pernah menjawab totp_required", async () => {
    // Kalau ban diperiksa setelah cabang 2FA, akun yang ditangguhkan akan
    // menjawab "totp_required" - dan jawaban itu sendiri sudah memberi tahu
    // penyerang bahwa akunnya ada dan passwordnya benar.
    findUnique.mockResolvedValue({
      ...AKUN,
      bannedAt: new Date(),
      totpEnabledAt: new Date("2026-08-01T00:00:00Z"),
    });
    verifyPassword.mockResolvedValue(true);
    expect(await cek({ ...KREDENSIAL, totp: "" })).toEqual({ kind: "invalid" });
  });
});
