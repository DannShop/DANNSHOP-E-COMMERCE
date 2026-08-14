import { afterEach, describe, expect, it, vi } from "vitest";
import { OkeConnectAdapter } from "@/lib/providers/okeconnect";

const creds = { memberID: "OK000001", pin: "1234", password: "rahasia" };

function mockFetchOnce(body: string) {
  const fn = vi.fn().mockResolvedValue(
    new Response(body, { status: 200, headers: { "content-type": "text/html" } }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Amplop balasan relay PHP. */
function mockRelayOnce(body: string) {
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true, status: 200, body }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const PRICE_ROW = JSON.stringify([
  { kode: "S5", keterangan: "Telkomsel 5.000", produk: "Pulsa", kategori: "PULSA", harga: "5224", status: "1" },
  { kode: "BPLA", keterangan: "Bayar Tagihan Listrik", produk: "PLN", kategori: "TAGIHAN", harga: "-1150", status: "1" },
  { kode: "CEKML", keterangan: "Cek Game Pengguna ML", produk: "Cek", kategori: "DIGITAL", harga: "0", status: "1" },
]);

describe("OkeConnectAdapter.fetchPriceList", () => {
  it("memetakan baris ke ProviderSkuPrice dan menyaring kategori tagihan + harga <= 0", async () => {
    mockFetchOnce(PRICE_ROW);
    const adapter = new OkeConnectAdapter(creds);
    const list = await adapter.fetchPriceList();

    // Cuma S5 yang lolos: BPLA disaring karena kategori TAGIHAN (harganya komisi,
    // bukan modal), CEKML disaring karena harga 0.
    expect(list).toEqual([
      {
        skuCode: "S5",
        productName: "Telkomsel 5.000",
        category: "PULSA",
        brand: "Pulsa",
        costPrice: 5224n,
        available: true,
      },
    ]);
  });

  it("TIDAK lewat relay walau relay dikonfigurasi", async () => {
    // Regresi nyata: sebelum ini price list ikut diarahkan ke relay, dan relay
    // menolaknya karena `okeconnect.com` sengaja tidak masuk ALLOWED_HOSTS.
    // Gejalanya cuma "Sync harga gagal" tanpa menyebut relay sama sekali.
    vi.stubEnv("PROVIDER_RELAY_URL", "https://relay.contoh.com/digiflazz-relay.php");
    vi.stubEnv("PROVIDER_RELAY_SECRET", "secret-relay");

    const fn = mockFetchOnce(PRICE_ROW);
    await new OkeConnectAdapter(creds).fetchPriceList();

    const calledUrl = String(fn.mock.calls[0][0]);
    expect(calledUrl).toContain("okeconnect.com/harga/json");
    expect(calledUrl).not.toContain("relay.contoh.com");
  });
});

describe("OkeConnectAdapter.fetchBalance", () => {
  it("membaca saldo dari kalimat balasan", async () => {
    mockFetchOnce("Saldo 284.939");
    expect(await new OkeConnectAdapter(creds).fetchBalance()).toBe(284939n);
  });

  it("melempar dengan menyertakan kalimat asli provider saat ditolak", async () => {
    mockFetchOnce("Pin Salah");
    await expect(new OkeConnectAdapter(creds).fetchBalance()).rejects.toThrow(/Pin Salah/);
  });

  it("LEWAT relay kalau relay dikonfigurasi — endpoint transaksi wajib ber-IP tetap", async () => {
    vi.stubEnv("PROVIDER_RELAY_URL", "https://relay.contoh.com/digiflazz-relay.php");
    vi.stubEnv("PROVIDER_RELAY_SECRET", "secret-relay");

    const fn = mockRelayOnce("Saldo 284.939");
    const saldo = await new OkeConnectAdapter(creds).fetchBalance();

    expect(saldo).toBe(284939n);
    expect(String(fn.mock.calls[0][0])).toBe("https://relay.contoh.com/digiflazz-relay.php");
    // Relay dipanggil POST membawa {method:"GET", url, query} — bentuk yang cuma
    // dimengerti relay versi baru. Relay lama menolaknya dengan
    // "Body harus JSON berisi {url, body}".
    const init = fn.mock.calls[0][1] as RequestInit;
    const sent = JSON.parse(String(init.body));
    expect(sent.method).toBe("GET");
    expect(sent.url).toBe("https://h2h.okeconnect.com/trx/balance");
    expect(sent.query.memberID).toBe("OK000001");
  });
});

describe("OkeConnectAdapter.createTransaction", () => {
  it("balasan 'akan diproses' jadi pending, bukan success", async () => {
    mockFetchOnce("T#1 R#FUL-1 Three 1.000 T1.0812 akan diproses. Saldo 100.000 - 1.321 = 98.679 @19:08");
    const r = await new OkeConnectAdapter(creds).createTransaction({
      skuCode: "T1",
      target: "0812",
      refId: "FUL-1",
    });
    expect(r.status).toBe("pending");
    expect(r.refId).toBe("FUL-1");
  });

  it("menandai ketidakcocokan refID di pesan, bukan menelannya diam-diam", async () => {
    // Panjang/karakter refID yang diterima OkeConnect belum terdokumentasi. Kalau
    // mereka memotongnya, cek status berikutnya tidak akan pernah cocok — dan itu
    // bisa berujung kirim dua kali. Ketidakcocokan harus TERLIHAT.
    mockFetchOnce("T#1 R#FUL sudah diproses. Saldo 100.000");
    const r = await new OkeConnectAdapter(creds).createTransaction({
      skuCode: "T1",
      target: "0812",
      refId: "FUL-20260814-ABC123",
    });
    expect(r.message).toContain("refID tidak cocok");
    expect(r.refId).toBe("FUL-20260814-ABC123"); // tetap refId KITA
  });
});

describe("OkeConnectAdapter.parseCallback", () => {
  it("membaca refid + message dari query string, verified SELALU false", async () => {
    const cb = new OkeConnectAdapter(creds).parseCallback({
      rawBody: "?refid=114&message=T%23210288912%20R%23114%20SUKSES.%20SN%3A%20R230512",
      headers: {},
    });
    expect(cb?.refId).toBe("114");
    expect(cb?.status).toBe("success");
    // OkeConnect tidak menandatangani callback-nya. `verified` tidak boleh pernah
    // true, dan route callback-nya karena itu TIDAK memakainya sebagai gerbang —
    // yang menjaga adalah verifikasi ulang lewat checkStatus.
    expect(cb?.verified).toBe(false);
  });

  it("null kalau parameter wajibnya tidak lengkap", () => {
    expect(new OkeConnectAdapter(creds).parseCallback({ rawBody: "?refid=114", headers: {} })).toBeNull();
    expect(new OkeConnectAdapter(creds).parseCallback({ rawBody: "", headers: {} })).toBeNull();
  });
});
