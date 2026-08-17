import { db } from "@/lib/db";
import { createPaymentActions } from "@/lib/payment/create-payment";
import { calculateFee, calculateTotal, generateUniqueCode } from "@/lib/payment/fee";
import { getPaymentRules } from "@/lib/payment/rules";
import { reportChargeFailure } from "@/lib/payment/charge-failure";
import { getBaseUrl } from "@/lib/base-url";
import { getPartnerPackage } from "@/lib/partner/package";
import type { PaymentActions } from "@/lib/midtrans/client";

// Pembayaran biaya join mitra H2H.
//
// Polanya sengaja menyalin lib/reseller/purchase.ts sedekat mungkin - lewat
// createPaymentActions() yang sama dengan checkout/deposit/paket reseller,
// jadi toggle Core API vs Snap di panel tetap mengubah keempatnya sekaligus.
//
// Bedanya dengan paket reseller: tidak ada kredit upgrade dan tidak ada pilihan
// paket, karena paket mitra cuma satu dan dibayar tepat sekali.

export interface JoinPurchaseResult {
  error?: string;
  applicationId?: string;
  actions?: PaymentActions;
}

export async function startPartnerJoinPayment(input: {
  userId: string;
  methodCode: string;
}): Promise<JoinPurchaseResult> {
  const [application, pkg, method, rules] = await Promise.all([
    db.partnerApplication.findFirst({
      where: { userId: input.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        joinPaidAt: true,
        joinExpiredAt: true,
        partnerAccount: { select: { id: true } },
      },
    }),
    getPartnerPackage(),
    db.paymentMethodConfig.findUnique({ where: { code: input.methodCode } }),
    getPaymentRules(),
  ]);

  if (!application) return { error: "Kamu belum mengajukan diri sebagai mitra." };
  if (application.status === "REJECTED") {
    return { error: "Pengajuanmu ditolak. Hubungi admin sebelum membayar." };
  }
  // Lunas dicek dari `joinPaidAt`, bukan dari status: status APPROVED juga bisa
  // datang dari persetujuan manual admin di masa sebelum biaya join ada, dan
  // menagih ulang orang yang sudah jadi mitra jauh lebih buruk daripada
  // melewatkan satu tagihan.
  if (application.joinPaidAt || application.partnerAccount) {
    return { error: "Biaya join sudah lunas. Akun mitramu sudah aktif." };
  }
  if (!pkg.isOpen) return { error: "Pendaftaran mitra sedang ditutup." };
  if (!method || !method.isActive) return { error: "Metode pembayaran tidak tersedia." };

  // Tagihan yang masih hidup tidak boleh digandakan. Tanpa penjaga ini, membuka
  // halaman bayar di dua tab menghasilkan dua tagihan, dan membayar keduanya
  // berarti membayar dua kali untuk satu keanggotaan yang sama.
  if (application.joinExpiredAt && application.joinExpiredAt.getTime() > Date.now()) {
    return { error: "Masih ada tagihan yang menunggu. Selesaikan atau tunggu kedaluwarsa dulu." };
  }

  // Fee & kode unik mengikuti aturan global deposit, sama seperti pembelian
  // paket reseller. Benefit paket yang membebaskan fee SENGAJA tidak dipakai:
  // yang sedang dibeli adalah paketnya sendiri, jadi memberi potongan
  // berdasarkan paket yang belum dimiliki adalah lingkaran tanpa jawaban benar.
  const fee = rules.feeDeposit ? calculateFee(pkg.joinPrice, method.feeFlat, method.feePercent) : 0n;
  const uniqueCode = rules.uniqueCodeDeposit
    ? generateUniqueCode(rules.uniqueCodeMin, rules.uniqueCodeMax)
    : 0;
  const total = calculateTotal(pkg.joinPrice, fee, uniqueCode);

  const expiryMinutes = method.expiryMinutes;
  const expiredAt = new Date(Date.now() + expiryMinutes * 60_000);

  // Kolom tagihan diisi SEBELUM memanggil Midtrans, supaya callback yang datang
  // lebih cepat daripada respons charge tetap menemukan sasarannya. Pola sama
  // dengan createDeposit & startTierPurchase.
  await db.partnerApplication.update({
    where: { id: application.id },
    data: {
      joinPrice: pkg.joinPrice,
      joinFee: fee,
      joinUniqueCode: uniqueCode,
      joinTotal: total,
      joinPaymentMethod: method.code,
      joinExpiredAt: expiredAt,
    },
  });

  try {
    const actions = await createPaymentActions({
      methodCode: method.code,
      // order_id di Midtrans = id pengajuan. Itu yang dicocokkan
      // settleFromMidtrans() pada cabang keempatnya.
      orderId: application.id,
      grossAmount: Number(total),
      expiryMinutes,
      finishUrl: `${await getBaseUrl()}/account/mitra`,
    });
    await db.partnerApplication.update({
      where: { id: application.id },
      data: { joinRawResponse: actions as object },
    });
    return { applicationId: application.id, actions };
  } catch (e) {
    const { failure, buyerMessage } = reportChargeFailure(
      { scope: "partner-join", refId: application.id, method: method.code },
      e,
    );
    // Tagihan yang gagal terbit di gateway harus melepas kuncinya kembali -
    // kalau `joinExpiredAt` dibiarkan terisi, penjaga di atas memblokir
    // percobaan berikutnya sampai waktunya lewat sendiri.
    await db.partnerApplication.update({
      where: { id: application.id },
      data: { joinExpiredAt: null, joinRawResponse: failure },
    });
    return { error: buyerMessage };
  }
}
