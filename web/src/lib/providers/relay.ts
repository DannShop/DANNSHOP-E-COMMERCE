// Jalur keluar untuk panggilan API provider — langsung, atau lewat relay ber-IP tetap.
//
// KENAPA ADA: Digiflazz mewajibkan IP server didaftarkan di whitelist mereka
// (`rc: 45` — "IP Anda tidak kami kenali"). Runtime Vercel TIDAK punya IP keluar
// tetap: tiap invocation bisa keluar dari IP AWS mana saja, jadi whitelist satu IP
// hari ini pasti gagal lagi besok. Solusinya bukan di kode aplikasi — request harus
// benar-benar keluar dari alamat yang tetap.
//
// Relay = satu file PHP di shared hosting milik sendiri (lihat
// `relay/digiflazz-relay.php` dan `docs/08-IP-TETAP-DIGIFLAZZ.md`). Shared hosting
// punya IP yang TETAP, jadi cukup IP itu yang didaftarkan sekali di Digiflazz.
// Aplikasi di Vercel memanggil relay; relay yang meneruskan ke Digiflazz.
//
// Kalau env relay tidak diisi, semuanya jalan seperti sebelumnya (langsung ke
// provider) — jadi development lokal dan siapa pun yang IP servernya sudah tetap
// tidak perlu menyiapkan apa-apa.

export interface ProviderHttpResponse {
  status: number;
  /** Body apa adanya, belum di-parse — non-JSON pun harus sampai ke pemanggil. */
  text: string;
  /** true = request keluar lewat relay, bukan langsung dari runtime ini. */
  viaRelay: boolean;
}

export function isRelayConfigured(): boolean {
  return Boolean(process.env.PROVIDER_RELAY_URL && process.env.PROVIDER_RELAY_SECRET);
}

// Bentuk balasan relay. Relay TIDAK ikut menafsirkan isi respons provider - dia
// hanya meneruskan status + body mentah, supaya semua logika (termasuk jebakan
// "HTTP 200 tapi ditolak") tetap satu tempat di adapter, bukan tersebar ke PHP.
interface RelayEnvelope {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

/**
 * POST JSON ke API provider. Lewat relay kalau dikonfigurasi, kalau tidak langsung.
 *
 * SENGAJA TIDAK ADA FALLBACK "kalau relay gagal, coba langsung": panggilan langsung
 * dari Vercel pasti ditolak `rc: 45`, jadi fallback cuma menukar satu kegagalan
 * dengan kegagalan lain — sambil MENYEMBUNYIKAN bahwa relay-nya yang mati. Lebih
 * baik gagal dengan pesan yang menyebut relay, supaya yang diperbaiki benar.
 */
export async function providerHttpPost(params: {
  url: string;
  body: Record<string, unknown>;
  timeoutMs: number;
}): Promise<ProviderHttpResponse> {
  const relayUrl = process.env.PROVIDER_RELAY_URL;
  const relaySecret = process.env.PROVIDER_RELAY_SECRET;

  if (!relayUrl || !relaySecret) {
    const res = await fetch(params.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params.body),
      signal: AbortSignal.timeout(params.timeoutMs),
    });
    return { status: res.status, text: await res.text(), viaRelay: false };
  }

  // Timeout ke relay diberi kelonggaran: relay punya timeout SENDIRI ke provider
  // (lihat RELAY_TIMEOUT di file PHP-nya). Kalau timeout kita lebih pendek atau
  // sama, kita akan menyerah lebih dulu dan kehilangan pesan error milik relay -
  // padahal pesan itulah yang membedakan "provider lambat" dari "relay mati".
  const res = await fetch(relayUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-relay-secret": relaySecret },
    body: JSON.stringify({ url: params.url, body: params.body }),
    signal: AbortSignal.timeout(params.timeoutMs + 5_000),
  });

  return unwrapRelayResponse(res);
}

/**
 * GET ke API provider, dengan parameter sebagai OBJEK — bukan URL yang query
 * string-nya sudah ditempel.
 *
 * KENAPA objek terpisah: relay PHP sengaja menyusun ulang URL tujuan dari bagian
 * yang sudah divalidasi dan MEMBUANG query string aslinya, supaya URL yang lolos
 * validasi host+path tidak bisa diselundupi parameter tambahan. Kalau GET dikirim
 * sebagai satu string URL utuh, proteksi itu harus dilonggarkan. Dengan memisahkan
 * `query`, relay tetap membangun ulang URL-nya sendiri dan proteksinya utuh.
 *
 * Manfaat kedua: parameter tetap berbentuk objek saat dicatat ke ProviderApiLog,
 * jadi kena redactProviderRequest (pin/password diredaksi). URL yang sudah
 * ditempel akan lolos redaksi itu.
 */
export async function providerHttpGet(params: {
  url: string;
  query: Record<string, string>;
  timeoutMs: number;
}): Promise<ProviderHttpResponse> {
  const relayUrl = process.env.PROVIDER_RELAY_URL;
  const relaySecret = process.env.PROVIDER_RELAY_SECRET;

  if (!relayUrl || !relaySecret) {
    const qs = new URLSearchParams(params.query).toString();
    const res = await fetch(`${params.url}?${qs}`, {
      method: "GET",
      signal: AbortSignal.timeout(params.timeoutMs),
    });
    return { status: res.status, text: await res.text(), viaRelay: false };
  }

  const res = await fetch(relayUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-relay-secret": relaySecret },
    body: JSON.stringify({ method: "GET", url: params.url, query: params.query }),
    signal: AbortSignal.timeout(params.timeoutMs + 5_000),
  });

  return unwrapRelayResponse(res);
}

/** Membongkar amplop relay jadi respons provider. Dipakai jalur POST dan GET. */
async function unwrapRelayResponse(res: Response): Promise<ProviderHttpResponse> {
  const envelopeText = await res.text();
  let envelope: RelayEnvelope;
  try {
    envelope = JSON.parse(envelopeText) as RelayEnvelope;
  } catch {
    // Balasan relay sendiri yang tidak terbaca — hampir selalu halaman error PHP
    // atau HTML "suspended" dari panel hosting. Dipotong supaya pesan errornya
    // tetap terbaca di log, dan dijelaskan bahwa ini relay, bukan provider.
    throw new Error(
      `Relay membalas bukan JSON (HTTP ${res.status}): ${envelopeText.slice(0, 200)}. ` +
        `Cek PROVIDER_RELAY_URL dan pastikan file relay terpasang benar di hosting.`,
    );
  }

  if (!envelope.ok) {
    throw new Error(`Relay gagal meneruskan ke provider: ${envelope.error ?? "tanpa keterangan"}`);
  }
  if (typeof envelope.status !== "number" || typeof envelope.body !== "string") {
    throw new Error("Relay membalas format yang tidak dikenali (status/body tidak lengkap).");
  }

  return { status: envelope.status, text: envelope.body, viaRelay: true };
}
