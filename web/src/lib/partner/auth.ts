import type { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";
import { requireActiveAccount } from "@/lib/account/user-status";
import { PARTNER_RC, partnerError } from "@/lib/partner/response";
import { computeSign, isIpAllowed, signatureMatches } from "@/lib/partner/signature";

export interface AuthedPartner {
  id: string;
  userId: string;
  username: string;
  callbackUrl: string | null;
  callbackSecret: string | null;
}

export type PartnerAuthResult = { ok: true; partner: AuthedPartner } | { ok: false; response: NextResponse };

export interface PartnerRequestBody {
  username?: unknown;
  sign?: unknown;
  ref_id?: unknown;
  sku?: unknown;
  customer_no?: unknown;
}

// Body JSON dibaca lewat text() dulu, bukan request.json() langsung, karena
// request.json() melempar SyntaxError untuk body kosong/rusak — dan error itu
// akan naik jadi 500 "Kesalahan sistem", menyalahkan kita untuk kesalahan
// partner. Batas 8 KB mengikuti pola webhook Midtrans (16 KB): tidak ada
// permintaan sah di API ini yang mendekati angka itu.
const MAX_BODY_BYTES = 8_000;

export async function readPartnerBody(
  request: Request,
): Promise<{ ok: true; body: PartnerRequestBody } | { ok: false; response: NextResponse }> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return { ok: false, response: partnerError(PARTNER_RC.INVALID_REQUEST, "Body request terlalu besar.", 413) };
  }
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        ok: false,
        response: partnerError(PARTNER_RC.INVALID_REQUEST, "Body harus berupa objek JSON.", 400),
      };
    }
    return { ok: true, body: parsed as PartnerRequestBody };
  } catch {
    return {
      ok: false,
      response: partnerError(
        PARTNER_RC.INVALID_REQUEST,
        "Body bukan JSON yang valid. Pastikan header Content-Type: application/json dan body dikirim sebagai JSON.",
        400,
      ),
    };
  }
}

/**
 * Gerbang tunggal seluruh endpoint /api/v1/*. Urutan pemeriksaannya disengaja,
 * dari yang paling murah ke yang paling mahal, supaya request sampah tidak
 * pernah sampai ke query DB — kecuali satu pengecualian di bawah.
 *
 * `salt` menentukan tanda tangan mana yang diharapkan (lihat signature.ts).
 */
export async function authenticatePartner(
  request: Request,
  body: PartnerRequestBody,
  salt: string,
  rateLimit: { limit: number; windowMs: number },
): Promise<PartnerAuthResult> {
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const sign = typeof body.sign === "string" ? body.sign.trim() : "";
  if (!username || !sign) {
    return {
      ok: false,
      response: partnerError(PARTNER_RC.INVALID_REQUEST, "Field `username` dan `sign` wajib diisi.", 400),
    };
  }

  // Rate limit dipasang SEBELUM lookup DB dan di-key ke username (bukan IP):
  // partner sah punya IP tetap dan tidak boleh kelaparan gara-gara partner lain
  // di rentang IP yang sama, sementara penebak tanda tangan yang memutar-mutar IP
  // tetap terbentur karena dia harus memakai username yang ada untuk bisa lolos.
  const limited = await checkRateLimit(`partner:${username}`, rateLimit.limit, rateLimit.windowMs);
  if (!limited.allowed) {
    return {
      ok: false,
      response: partnerError(PARTNER_RC.RATE_LIMITED, "Terlalu banyak request, coba lagi sebentar lagi.", 429),
    };
  }

  const account = await db.partnerAccount.findUnique({ where: { username } });
  if (!account || !account.isActive) {
    return {
      ok: false,
      response: partnerError(
        PARTNER_RC.UNKNOWN_USERNAME,
        "Username partner tidak dikenal atau sedang dinonaktifkan.",
        401,
      ),
    };
  }

  // IP diperiksa SEBELUM tanda tangan. Partner yang lupa mendaftarkan IP-nya akan
  // mengirim tanda tangan yang benar dan menerima "signature salah" — pesan yang
  // menyesatkan total dan persis jenis jebakan yang sudah memakan waktu kita
  // sendiri di sisi Digiflazz (rc 41 "Signature Anda salah" padahal soal API key).
  const ip = extractIp(request.headers);
  if (!isIpAllowed(account.ipWhitelist, ip)) {
    return {
      ok: false,
      response: partnerError(
        PARTNER_RC.IP_NOT_ALLOWED,
        `IP ${ip} tidak terdaftar untuk akun partner ini. Minta admin menambahkannya ke whitelist.`,
        403,
      ),
    };
  }

  let apiKey: string;
  try {
    apiKey = decryptJson<string>(account.apiKeyEnc);
  } catch (e) {
    console.error("authenticatePartner: gagal dekripsi apiKey partner", { partnerId: account.id, error: e });
    return {
      ok: false,
      response: partnerError(PARTNER_RC.SYSTEM_ERROR, "Kredensial partner rusak, hubungi admin.", 500),
    };
  }

  if (!signatureMatches(computeSign(username, apiKey, salt), sign)) {
    return {
      ok: false,
      response: partnerError(
        PARTNER_RC.INVALID_SIGNATURE,
        "Signature tidak cocok. Pastikan rumusnya md5(username + apiKey + salt) dan salt sesuai endpoint.",
        401,
      ),
    };
  }

  // Akun partner yang di-ban admin harus berhenti bertransaksi SEKARANG, sama
  // seperti jalur uang lain (checkout/deposit/membership). API partner tidak
  // punya sesi JWT sehingga tidak mewarisi masalah "sesi basi 8 jam", tapi tetap
  // harus lewat gerbang yang sama — ban yang cuma berlaku di storefront berarti
  // partner yang ditangguhkan masih bisa menguras saldonya lewat API.
  const blocked = await requireActiveAccount(account.userId);
  if (blocked) {
    return { ok: false, response: partnerError(PARTNER_RC.UNKNOWN_USERNAME, blocked, 403) };
  }

  let callbackSecret: string | null = null;
  if (account.callbackSecretEnc) {
    try {
      callbackSecret = decryptJson<string>(account.callbackSecretEnc);
    } catch (e) {
      // Tidak fatal: callback yang tidak bisa ditandatangani lebih baik daripada
      // transaksi yang ditolak. Kegagalannya muncul lagi (dan tercatat) saat job
      // partner-callback jalan.
      console.error("authenticatePartner: gagal dekripsi callbackSecret", { partnerId: account.id, error: e });
    }
  }

  // Fire-and-forget: jejak pemakaian tidak boleh menambah latensi jalur uang,
  // dan kegagalannya tidak boleh menggagalkan transaksi yang sah.
  void db.partnerAccount
    .update({ where: { id: account.id }, data: { lastUsedAt: new Date() } })
    .catch((e) => console.error("authenticatePartner: gagal update lastUsedAt", { partnerId: account.id, error: e }));

  return {
    ok: true,
    partner: {
      id: account.id,
      userId: account.userId,
      username: account.username,
      callbackUrl: account.callbackUrl,
      callbackSecret,
    },
  };
}
