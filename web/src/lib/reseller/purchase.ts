import { db } from "@/lib/db";
import { createPaymentActions } from "@/lib/payment/create-payment";
import { calculateFee, calculateTotal, generateUniqueCode } from "@/lib/payment/fee";
import { getPaymentRules } from "@/lib/payment/rules";
import { reportChargeFailure } from "@/lib/payment/charge-failure";
import { getBaseUrl } from "@/lib/base-url";
import { canUpgradeTo, quoteUpgrade } from "@/lib/reseller/upgrade";
import type { PaymentActions } from "@/lib/midtrans/client";

// Pembelian/upgrade paket reseller lewat Midtrans.
//
// Lewat createPaymentActions() yang sama dengan checkout & deposit, jadi
// Core API vs Snap tidak perlu diputuskan lagi di sini - dan memindahkan
// togglenya di panel tetap mengubah ketiganya sekaligus.

export interface PurchaseResult {
  error?: string;
  purchaseId?: string;
  actions?: PaymentActions;
}

export async function startTierPurchase(input: {
  userId: string;
  tierId: string;
  methodCode: string;
}): Promise<PurchaseResult> {
  const reseller = await db.resellerAccount.findUnique({
    where: { userId: input.userId },
    select: { id: true, isActive: true, activatedAt: true, tierId: true, tierPricePaid: true },
  });
  if (!reseller) return { error: "Kamu belum terdaftar sebagai reseller." };
  if (!reseller.activatedAt) return { error: "Aktifkan akun resellermu lewat link di email dulu." };
  if (!reseller.isActive) return { error: "Akun resellermu sedang dinonaktifkan. Hubungi admin." };

  const [tier, method, rules] = await Promise.all([
    db.membershipTier.findUnique({ where: { id: input.tierId } }),
    db.paymentMethodConfig.findUnique({ where: { code: input.methodCode } }),
    getPaymentRules(),
  ]);
  if (!tier) return { error: "Paket tidak ditemukan." };
  if (!method || !method.isActive) return { error: "Metode pembayaran tidak tersedia." };

  const allowed = canUpgradeTo({
    targetTierId: tier.id,
    targetPrice: tier.price,
    targetIsActive: tier.isActive,
    currentTierId: reseller.tierId,
    paidForCurrentTier: reseller.tierPricePaid,
  });
  if (!allowed.ok) return { error: allowed.reason };

  // Satu pembelian menunggu pada satu waktu. Tanpa ini, membuka halaman upgrade
  // di dua tab menghasilkan dua tagihan hidup, dan membayar keduanya berarti
  // membayar dua kali untuk satu paket yang sama.
  const pending = await db.tierPurchase.findFirst({
    where: { resellerId: reseller.id, status: "PENDING" },
    select: { id: true },
  });
  if (pending) {
    return { error: "Masih ada pembayaran paket yang menunggu. Selesaikan atau tunggu kedaluwarsa dulu." };
  }

  const quote = quoteUpgrade({ tierPrice: tier.price, paidForCurrentTier: reseller.tierPricePaid });

  // Fee & kode unik mengikuti aturan global yang sama dengan deposit. Benefit
  // tier yang membebaskan fee SENGAJA tidak dipakai di sini: yang sedang dibeli
  // adalah tier itu sendiri, jadi memberi diskon fee berdasarkan tier yang
  // belum dimiliki adalah lingkaran yang tidak punya jawaban benar.
  const fee = rules.feeDeposit ? calculateFee(quote.payable, method.feeFlat, method.feePercent) : 0n;
  const uniqueCode = rules.uniqueCodeDeposit
    ? generateUniqueCode(rules.uniqueCodeMin, rules.uniqueCodeMax)
    : 0;
  const totalPaid = calculateTotal(quote.payable, fee, uniqueCode);

  const expiryMinutes = method.expiryMinutes;
  const expiredAt = new Date(Date.now() + expiryMinutes * 60_000);

  // Baris dibuat SEBELUM memanggil Midtrans, supaya order_id-nya sudah ada dan
  // callback yang datang lebih cepat dari respons charge tetap menemukan
  // sasarannya. Pola sama dengan createDeposit.
  const purchase = await db.tierPurchase.create({
    data: {
      resellerId: reseller.id,
      tierId: tier.id,
      fromTierId: reseller.tierId,
      tierPrice: quote.tierPrice,
      creditApplied: quote.credit,
      fee,
      uniqueCode,
      totalPaid,
      paymentMethod: method.code,
      expiredAt,
    },
  });

  try {
    const actions = await createPaymentActions({
      methodCode: method.code,
      orderId: purchase.id,
      grossAmount: Number(totalPaid),
      expiryMinutes,
      finishUrl: `${await getBaseUrl()}/account/reseller`,
    });
    await db.tierPurchase.update({
      where: { id: purchase.id },
      data: { paymentRef: purchase.id, rawResponse: actions as object },
    });
    return { purchaseId: purchase.id, actions };
  } catch (e) {
    const { failure, buyerMessage } = reportChargeFailure(
      { scope: "tier-purchase", refId: purchase.id, method: method.code },
      e,
    );
    // Tagihan yang gagal dibuat di gateway tidak boleh meninggalkan baris
    // PENDING - kalau dibiarkan, penjaga "satu pembelian menunggu" di atas
    // memblokir percobaan berikutnya sampai baris itu kedaluwarsa sendiri.
    await db.tierPurchase.update({
      where: { id: purchase.id },
      data: { status: "FAILED", rawResponse: failure },
    });
    return { error: buyerMessage };
  } finally {
    // Dijadwalkan di luar try/catch: baris PENDING yang job expire-nya gagal
    // dibuat akan menggantung selamanya dan mengunci pembelian berikutnya.
    // Kegagalan penjadwalan tidak boleh menjatuhkan pembelian yang sudah jadi.
    try {
      await db.job.create({
        data: { type: "expire-tier-purchase", payload: { purchaseId: purchase.id }, runAt: expiredAt },
      });
    } catch (e) {
      console.error("TierPurchase: gagal menjadwalkan expire", { purchaseId: purchase.id, error: e });
    }
  }
}
