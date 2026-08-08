import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRelayConfigured, providerHttpPost } from "@/lib/providers/relay";
import { DigiflazzAdapter } from "@/lib/providers/digiflazz";
import type { ProviderApiLogEntry } from "@/lib/providers/api-log";

const creds = { username: "userX", apiKey: "keyY" };

const ORIGINAL_ENV = { url: process.env.PROVIDER_RELAY_URL, secret: process.env.PROVIDER_RELAY_SECRET };

function useRelayEnv(url = "https://hosting-saya.test/relay.php", secret = "s3cr3t") {
  process.env.PROVIDER_RELAY_URL = url;
  process.env.PROVIDER_RELAY_SECRET = secret;
}

beforeEach(() => {
  delete process.env.PROVIDER_RELAY_URL;
  delete process.env.PROVIDER_RELAY_SECRET;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_ENV.url === undefined) delete process.env.PROVIDER_RELAY_URL;
  else process.env.PROVIDER_RELAY_URL = ORIGINAL_ENV.url;
  if (ORIGINAL_ENV.secret === undefined) delete process.env.PROVIDER_RELAY_SECRET;
  else process.env.PROVIDER_RELAY_SECRET = ORIGINAL_ENV.secret;
});

describe("isRelayConfigured", () => {
  it("butuh KEDUA env - setengah terisi dianggap belum dikonfigurasi", () => {
    expect(isRelayConfigured()).toBe(false);
    process.env.PROVIDER_RELAY_URL = "https://hosting-saya.test/relay.php";
    expect(isRelayConfigured()).toBe(false);
    process.env.PROVIDER_RELAY_SECRET = "s3cr3t";
    expect(isRelayConfigured()).toBe(true);
  });
});

describe("providerHttpPost tanpa relay", () => {
  it("memanggil provider langsung dan menandai viaRelay=false", async () => {
    const fn = vi.fn().mockResolvedValue(new Response('{"data":{"rc":"00"}}', { status: 200 }));
    vi.stubGlobal("fetch", fn);

    const res = await providerHttpPost({
      url: "https://api.digiflazz.com/v1/cek-saldo",
      body: { cmd: "deposit" },
      timeoutMs: 15_000,
    });

    expect(fn.mock.calls[0][0]).toBe("https://api.digiflazz.com/v1/cek-saldo");
    expect(res).toMatchObject({ status: 200, viaRelay: false });
  });
});

describe("providerHttpPost lewat relay", () => {
  it("membungkus request ke relay dengan secret, lalu membuka amplopnya", async () => {
    useRelayEnv();
    const fn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, status: 200, body: '{"data":{"rc":"00"}}' }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fn);

    const res = await providerHttpPost({
      url: "https://api.digiflazz.com/v1/transaction",
      body: { ref_id: "FUL-1" },
      timeoutMs: 15_000,
    });

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://hosting-saya.test/relay.php");
    expect((init as RequestInit).headers).toMatchObject({ "x-relay-secret": "s3cr3t" });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      url: "https://api.digiflazz.com/v1/transaction",
      body: { ref_id: "FUL-1" },
    });

    // Status & body milik PROVIDER yang diteruskan, bukan status relay-nya.
    expect(res).toEqual({ status: 200, text: '{"data":{"rc":"00"}}', viaRelay: true });
  });

  it("status non-200 dari provider diteruskan apa adanya, bukan ditelan relay", async () => {
    useRelayEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, status: 400, body: '{"data":{"rc":"45"}}' }), { status: 200 }),
      ),
    );
    const res = await providerHttpPost({ url: "https://api.digiflazz.com/v1/transaction", body: {}, timeoutMs: 15_000 });
    expect(res.status).toBe(400);
  });

  it("relay yang gagal menghubungi provider melempar error yang MENYEBUT relay", async () => {
    useRelayEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: "Gagal menghubungi provider: timeout" }), { status: 502 }),
      ),
    );
    await expect(
      providerHttpPost({ url: "https://api.digiflazz.com/v1/transaction", body: {}, timeoutMs: 15_000 }),
    ).rejects.toThrow(/Relay gagal meneruskan/);
  });

  it("balasan relay yang bukan JSON (halaman error hosting) dijelaskan sebagai masalah relay", async () => {
    useRelayEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>404 Not Found</html>", { status: 404 })));
    await expect(
      providerHttpPost({ url: "https://api.digiflazz.com/v1/transaction", body: {}, timeoutMs: 15_000 }),
    ).rejects.toThrow(/Relay membalas bukan JSON \(HTTP 404\).*PROVIDER_RELAY_URL/s);
  });

  it("TIDAK diam-diam jatuh balik ke panggilan langsung saat relay gagal", async () => {
    useRelayEnv();
    const fn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "Secret tidak cocok." }), { status: 403 }),
    );
    vi.stubGlobal("fetch", fn);

    await expect(
      providerHttpPost({ url: "https://api.digiflazz.com/v1/transaction", body: {}, timeoutMs: 15_000 }),
    ).rejects.toThrow();
    // Hanya SATU panggilan: ke relay. Fallback langsung akan tetap ditolak rc 45
    // sambil menyembunyikan bahwa relay-nya yang bermasalah.
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("adapter mencatat jalur keluar", () => {
  function collectLogs() {
    const entries: ProviderApiLogEntry[] = [];
    return { entries, log: async (e: ProviderApiLogEntry) => void entries.push(e) };
  }

  it("viaRelay tercatat true saat relay aktif, false saat tidak", async () => {
    const direct = collectLogs();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"data":{"deposit":1000}}', { status: 200 })));
    await new DigiflazzAdapter(creds, { log: direct.log }).fetchBalance();
    expect(direct.entries[0].viaRelay).toBe(false);

    vi.unstubAllGlobals();
    useRelayEnv();
    const relayed = collectLogs();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, status: 200, body: '{"data":{"deposit":1000}}' }), { status: 200 }),
      ),
    );
    await new DigiflazzAdapter(creds, { log: relayed.log }).fetchBalance();
    expect(relayed.entries[0].viaRelay).toBe(true);
  });
});

describe("pesan penolakan provider tidak boleh hilang", () => {
  it("cek-saldo yang ditolak rc 45 melempar pesan asli, bukan 'tidak sesuai skema'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: { rc: "45", message: "IP Anda tidak kami kenali: 47.129.212.98" } }),
          { status: 400 },
        ),
      ),
    );
    await expect(new DigiflazzAdapter(creds).fetchBalance()).rejects.toThrow(
      /ditolak \(rc 45\): IP Anda tidak kami kenali: 47\.129\.212\.98/,
    );
  });

  it("transaksi yang ditolak rc 45 juga mempertahankan pesan + alamat IP-nya", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { rc: "45", message: "IP Anda tidak kami kenali: 1.2.3.4" } }), {
          status: 400,
        }),
      ),
    );
    await expect(
      new DigiflazzAdapter(creds).createTransaction({ skuCode: "FF5", target: "123", refId: "FUL-9" }),
    ).rejects.toThrow(/1\.2\.3\.4/);
  });

  it("price-list yang ditolak mempertahankan pesannya", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { rc: "83", message: "Rate limit terlampaui" } }), { status: 200 }),
      ),
    );
    await expect(new DigiflazzAdapter(creds).fetchPriceList()).rejects.toThrow(/rc 83\): Rate limit terlampaui/);
  });
});
