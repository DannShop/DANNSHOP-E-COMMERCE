import { afterEach, describe, expect, it, vi } from "vitest";
import { formatBalanceAlertMessage, formatOrderAlertMessage, sendTelegramAlert } from "@/lib/notify/telegram";

describe("formatOrderAlertMessage", () => {
  it("menyusun pesan dengan nomor order, status, alasan, dan link admin", () => {
    const msg = formatOrderAlertMessage(
      { orderNumber: "INV-20260729-0001", status: "NEEDS_REVIEW", reason: "Tidak ada provider SKU tersedia" },
      "https://dannshop.test",
    );
    expect(msg).toContain("INV-20260729-0001");
    expect(msg).toContain("NEEDS_REVIEW");
    expect(msg).toContain("Tidak ada provider SKU tersedia");
    expect(msg).toContain("https://dannshop.test/admin/orders/INV-20260729-0001");
  });
});

describe("formatBalanceAlertMessage", () => {
  it("saldo menipis: pesan warning berisi nama provider, saldo, dan ambang batas", () => {
    const msg = formatBalanceAlertMessage(
      { displayName: "Digiflazz", balance: 500_000n, threshold: 1_000_000n, recovered: false },
      "https://dannshop.test",
    );
    expect(msg).toContain("⚠️");
    expect(msg).toContain("Digiflazz");
    expect(msg).toContain("menipis");
    expect(msg).toContain("Rp 500.000");
    expect(msg).toContain("Rp 1.000.000");
    expect(msg).toContain("https://dannshop.test/admin/providers");
  });

  it("saldo pulih: pesan sukses berisi nama provider dan saldo, TANPA menyebut ambang batas", () => {
    const msg = formatBalanceAlertMessage(
      { displayName: "Digiflazz", balance: 1_500_000n, threshold: 1_000_000n, recovered: true },
      "https://dannshop.test",
    );
    expect(msg).toContain("✅");
    expect(msg).toContain("Digiflazz");
    expect(msg).toContain("pulih");
    expect(msg).toContain("Rp 1.500.000");
    expect(msg).not.toContain("Rp 1.000.000");
    expect(msg).toContain("https://dannshop.test/admin/providers");
  });
});

function mockFetchOnce(ok: boolean, status = 200) {
  const fn = vi.fn().mockResolvedValue(new Response(ok ? "{}" : "error body", { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("sendTelegramAlert", () => {
  const config = { botToken: "test-token", chatId: "12345" };

  it("POST ke Telegram Bot API dengan chat_id dan text, resolve true kalau sukses", async () => {
    const fn = mockFetchOnce(true);
    await expect(sendTelegramAlert("Halo admin", config)).resolves.toBe(true);

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bottest-token/sendMessage");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ chat_id: "12345", text: "Halo admin" });
  });

  it("tidak throw dan resolve false kalau Telegram balas non-200", async () => {
    mockFetchOnce(false, 401);
    await expect(sendTelegramAlert("Halo admin", config)).resolves.toBe(false);
  });

  it("tidak throw dan resolve false kalau fetch gagal total (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(sendTelegramAlert("Halo admin", config)).resolves.toBe(false);
  });

  it("tidak memanggil fetch sama sekali dan resolve false kalau botToken/chatId kosong", async () => {
    const fn = mockFetchOnce(true);
    await expect(sendTelegramAlert("Halo admin", { botToken: "", chatId: "" })).resolves.toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });
});
