import { afterEach, describe, expect, it, vi } from "vitest";
import { describeProviderError } from "@/app/actions/providers";

afterEach(() => vi.unstubAllEnvs());

function withRelay() {
  vi.stubEnv("PROVIDER_RELAY_URL", "https://contoh.my.id/relay.php");
  vi.stubEnv("PROVIDER_RELAY_SECRET", "secret-relay");
}
function withoutRelay() {
  vi.stubEnv("PROVIDER_RELAY_URL", "");
  vi.stubEnv("PROVIDER_RELAY_SECRET", "");
}

describe("describeProviderError — penolakan IP", () => {
  // Dua provider, dua kalimat berbeda untuk keluhan yang sama. Sebelumnya hanya
  // kalimat Digiflazz yang dikenali, jadi penolakan OkeConnect lewat tanpa
  // petunjuk apa pun — padahal justru itu yang paling sering bikin buntu.
  it.each([
    ["Digiflazz", "Digiflazz transaction ditolak (rc 45): IP Anda tidak kami kenali: 18.138.233.188"],
    ["OkeConnect", "OkeConnect cek-saldo ditolak: IP tidak sesuai @202.10.43.174"],
  ])("mengenali kalimat %s", (_p, message) => {
    withRelay();
    const out = describeProviderError(new Error(message));
    expect(out).toContain(message);
    expect(out).toContain("relay ber-IP tetap SUDAH aktif");
  });

  it("saat relay AKTIF: menyuruh MENDAFTARKAN alamat itu", () => {
    withRelay();
    const out = describeProviderError(new Error("IP tidak sesuai @202.10.43.174"));
    // Alamat yang disebut adalah IP relay yang TETAP — itu justru yang harus
    // didaftarkan. Saran "jangan daftarkan" di keadaan ini menyesatkan.
    expect(out).toContain("Daftarkan alamat itu persis");
    expect(out).not.toContain("jangan whitelist IP ini langsung");
  });

  it("saat relay BELUM aktif: melarang mendaftarkan IP Vercel yang berganti-ganti", () => {
    withoutRelay();
    const out = describeProviderError(new Error("IP Anda tidak kami kenali: 18.138.233.188"));
    expect(out).toContain("jangan whitelist IP ini langsung");
    expect(out).toContain("docs/08-IP-TETAP-DIGIFLAZZ.md");
  });
});

describe("describeProviderError — perilaku umum", () => {
  it("meneruskan pesan provider apa adanya kalau bukan soal IP", () => {
    withRelay();
    expect(describeProviderError(new Error("Pin Salah"))).toBe("Pin Salah");
  });

  it("memangkas pesan yang kepanjangan, bukan menggantinya", () => {
    const panjang = "X".repeat(400);
    const out = describeProviderError(new Error(panjang));
    expect(out.length).toBeLessThan(panjang.length);
    expect(out).toContain("XXX");
    expect(out.endsWith("…")).toBe(true);
  });

  it("menerima nilai yang bukan Error", () => {
    expect(describeProviderError("gagal biasa")).toBe("gagal biasa");
  });
});
