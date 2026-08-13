import { db } from "@/lib/db";
import { authenticatePartner, readPartnerBody } from "@/lib/partner/auth";
import { PARTNER_RC, partnerError, partnerJson } from "@/lib/partner/response";
import { SIGN_SALT_BALANCE } from "@/lib/partner/signature";

export const dynamic = "force-dynamic";

// POST /api/v1/cek-saldo — sisa saldo prabayar partner.
// sign = md5(username + apiKey + "depo")
export async function POST(request: Request) {
  const parsed = await readPartnerBody(request);
  if (!parsed.ok) return parsed.response;

  const auth = await authenticatePartner(request, parsed.body, SIGN_SALT_BALANCE, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!auth.ok) return auth.response;

  try {
    const wallet = await db.wallet.findUnique({
      where: { userId: auth.partner.userId },
      select: { balance: true },
    });
    return partnerJson({
      rc: PARTNER_RC.SUCCESS,
      message: "Berhasil",
      username: auth.partner.username,
      // Number() aman: saldo rupiah tidak akan pernah mendekati 2^53, dan BigInt
      // tidak bisa di-serialize JSON.stringify tanpa custom replacer — mengirim
      // string akan memaksa setiap partner mem-parse-nya lagi.
      balance: Number(wallet?.balance ?? 0n),
    });
  } catch (e) {
    console.error("POST /api/v1/cek-saldo: gagal baca saldo", { partnerId: auth.partner.id, error: e });
    return partnerError(PARTNER_RC.SYSTEM_ERROR, "Gagal membaca saldo, coba lagi.", 500);
  }
}
