import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_LOG_JSON_CHARS, maskValue, redactProviderRequest, truncateForLog, truncateTextForLog,
} from "@/lib/providers/api-log";
import type { ProviderApiLogEntry } from "@/lib/providers/api-log";
import { DigiflazzAdapter, classifyDigiflazzResponse } from "@/lib/providers/digiflazz";

const creds = { username: "userX", apiKey: "keyY" };

function collectLogs() {
  const entries: ProviderApiLogEntry[] = [];
  return {
    entries,
    log: async (entry: ProviderApiLogEntry) => {
      entries.push(entry);
    },
  };
}

function mockFetchOnce(json: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("redactProviderRequest", () => {
  it("membuang sign sepenuhnya dan menyamarkan username", () => {
    const out = redactProviderRequest({
      username: "dannshop", sign: "d41d8cd98f00b204e9800998ecf8427e", buyer_sku_code: "FF5",
    }) as Record<string, unknown>;
    expect(out.sign).toBe("[redacted]");
    expect(out.username).toBe("dan***");
    expect(out.username).not.toContain("shop");
  });

  it("membiarkan data diagnostik utuh - tanpa customer_no & ref_id, log-nya tidak ada gunanya", () => {
    const out = redactProviderRequest({
      customer_no: "553038736", ref_id: "FUL-20260808-abc", buyer_sku_code: "FF5", testing: true,
    }) as Record<string, unknown>;
    expect(out).toEqual({
      customer_no: "553038736", ref_id: "FUL-20260808-abc", buyer_sku_code: "FF5", testing: true,
    });
  });

  it("meredaksi objek bersarang, bukan hanya level teratas", () => {
    const out = redactProviderRequest({ auth: { api_key: "rahasia", username: "abcdef" } }) as {
      auth: Record<string, unknown>;
    };
    expect(out.auth.api_key).toBe("[redacted]");
    expect(out.auth.username).toBe("abc***");
  });

  it("nilai pendek disamarkan total supaya tidak bocor utuh", () => {
    expect(maskValue("ab")).toBe("***");
    expect(maskValue("abcd")).toBe("abc***");
  });
});

describe("truncateForLog", () => {
  it("payload kecil disimpan apa adanya", () => {
    expect(truncateForLog({ data: { rc: "00" } })).toEqual({ data: { rc: "00" } });
  });

  it("payload raksasa (price-list ribuan SKU) dipotong, bukan disimpan utuh", () => {
    const huge = { data: Array.from({ length: 5000 }, (_, i) => ({ buyer_sku_code: `SKU${i}`, price: 10000 })) };
    const out = truncateForLog(huge) as Record<string, unknown>;
    expect(out._truncated).toBe(true);
    expect(out._originalChars as number).toBeGreaterThan(MAX_LOG_JSON_CHARS);
    expect((out._preview as string).length).toBe(MAX_LOG_JSON_CHARS);
  });

  it("nilai yang tidak bisa di-serialize tidak melempar - log tidak boleh menjatuhkan pemanggil", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(truncateForLog(circular)).toEqual({ _unserializable: true });
    expect(truncateForLog({ big: 1n })).toEqual({ _unserializable: true });
  });

  it("teks non-JSON panjang dipotong dengan penanda", () => {
    const out = truncateTextForLog("x".repeat(5000));
    expect(out).toContain("dipotong, total 5000 karakter");
  });
});

describe("classifyDigiflazzResponse", () => {
  it("rc 00 / status Sukses = SUCCESS, rc 03 = PENDING", () => {
    expect(classifyDigiflazzResponse({ data: { rc: "00", status: "Sukses" } }).outcome).toBe("SUCCESS");
    expect(classifyDigiflazzResponse({ data: { rc: "03", status: "Pending" } }).outcome).toBe("PENDING");
  });

  it("penolakan dikenali walau HTTP-nya 200 - rc di body yang menentukan", () => {
    const c = classifyDigiflazzResponse({
      data: { rc: "01", status: "Gagal", message: "IP Anda tidak kami kenali: 13.250.4.2" },
    });
    expect(c.outcome).toBe("REJECTED");
    expect(c.rc).toBe("01");
    expect(c.message).toBe("IP Anda tidak kami kenali: 13.250.4.2");
  });

  it("price-list sukses (data berupa array) = SUCCESS", () => {
    expect(classifyDigiflazzResponse({ data: [{ buyer_sku_code: "FF5" }] }).outcome).toBe("SUCCESS");
  });

  it("cek-saldo sukses tanpa rc = SUCCESS, tapi objek tanpa rc & tanpa deposit = REJECTED", () => {
    expect(classifyDigiflazzResponse({ data: { deposit: 150000 } }).outcome).toBe("SUCCESS");
    expect(classifyDigiflazzResponse({ data: { message: "Invalid Signature" } }).outcome).toBe("REJECTED");
  });

  it("bentuk yang sama sekali bukan respons Digiflazz = INVALID_RESPONSE", () => {
    expect(classifyDigiflazzResponse({ halo: 1 }).outcome).toBe("INVALID_RESPONSE");
    expect(classifyDigiflazzResponse(null).outcome).toBe("INVALID_RESPONSE");
  });
});

describe("DigiflazzAdapter mencatat panggilan", () => {
  it("transaksi yang DITOLAK tetap tercatat lengkap dengan konteks order", async () => {
    mockFetchOnce({
      data: {
        ref_id: "FUL-1", status: "Gagal", rc: "01", sn: "",
        message: "IP Anda tidak kami kenali: 13.250.4.2",
      },
    });
    const { entries, log } = collectLogs();
    const adapter = new DigiflazzAdapter(creds, { log });

    await adapter.createTransaction({
      skuCode: "FF5", target: "553038736", refId: "FUL-1",
      context: { orderId: "ord1", orderNumber: "INV-1", fulfillmentId: "ful1" },
    });

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.operation).toBe("transaction");
    expect(entry.outcome).toBe("REJECTED");
    expect(entry.httpStatus).toBe(200);
    expect(entry.providerRc).toBe("01");
    expect(entry.message).toBe("IP Anda tidak kami kenali: 13.250.4.2");
    expect(entry.context).toMatchObject({ orderId: "ord1", orderNumber: "INV-1", fulfillmentId: "ful1", ourRefId: "FUL-1" });
    expect((entry.requestBody as Record<string, unknown>).sign).toBe("[redacted]");
    expect((entry.requestBody as Record<string, unknown>).customer_no).toBe("553038736");
  });

  it("checkStatus tercatat sebagai check-status, bukan transaction", async () => {
    mockFetchOnce({ data: { ref_id: "FUL-1", status: "Sukses", rc: "00", sn: "SN1" } });
    const { entries, log } = collectLogs();
    const adapter = new DigiflazzAdapter(creds, { log });
    await adapter.checkStatus({ skuCode: "FF5", target: "553038736", refId: "FUL-1" });
    expect(entries[0].operation).toBe("check-status");
    expect(entries[0].outcome).toBe("SUCCESS");
  });

  it("timeout/error jaringan tetap tercatat sebagai TRANSPORT_ERROR walau panggilan melempar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("The operation was aborted due to timeout")));
    const { entries, log } = collectLogs();
    const adapter = new DigiflazzAdapter(creds, { log });

    await expect(
      adapter.createTransaction({ skuCode: "FF5", target: "553038736", refId: "FUL-2" }),
    ).rejects.toThrow(/timeout/);

    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe("TRANSPORT_ERROR");
    expect(entries[0].httpStatus).toBeNull();
    expect(entries[0].errorMessage).toMatch(/timeout/);
  });

  it("respons non-JSON (halaman error HTML) disimpan mentah sebagai INVALID_RESPONSE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>403 Forbidden</html>", { status: 403 })),
    );
    const { entries, log } = collectLogs();
    const adapter = new DigiflazzAdapter(creds, { log });

    await expect(adapter.fetchPriceList()).rejects.toThrow(/bukan JSON/);

    expect(entries[0].outcome).toBe("INVALID_RESPONSE");
    expect(entries[0].httpStatus).toBe(403);
    expect(entries[0].responseText).toContain("403 Forbidden");
    expect(entries[0].operation).toBe("price-list");
  });

  it("tanpa logger yang disuntik, adapter tetap jalan normal (default no-op)", async () => {
    mockFetchOnce({ data: { deposit: 150000 } });
    const adapter = new DigiflazzAdapter(creds);
    expect(await adapter.fetchBalance()).toBe(150000n);
  });
});
