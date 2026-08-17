import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseBenefits } from "@/lib/membership/benefits";
import { quoteUpgrade, canUpgradeTo } from "@/lib/reseller/upgrade";
import {
  buyResellerTier,
  registerResellerFromAccount,
  resendResellerActivation,
} from "@/app/actions/reseller";
import { ResellerJoinForm } from "./join-form";
import { ResellerStatus } from "./reseller-status";

export default async function AccountResellerPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [me, tiers, methods] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        resellerAccount: {
          select: {
            businessName: true,
            phone: true,
            referralCode: true,
            isActive: true,
            activatedAt: true,
            tierPricePaid: true,
            tier: { select: { id: true, name: true, badgeColor: true, benefits: true, discountPercent: true } },
            purchases: {
              where: { status: "PENDING" },
              select: { id: true, tier: { select: { name: true } }, totalPaid: true, expiredAt: true },
              take: 1,
            },
          },
        },
      },
    }),
    db.membershipTier.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
      select: { id: true, name: true, price: true, discountPercent: true, badgeColor: true, benefits: true },
    }),
    db.paymentMethodConfig.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { code: true, label: true },
    }),
  ]);

  // Belum pernah mengisi formulir: tampilkan formulirnya, dengan email &
  // password TIDAK diminta - keduanya sudah dimiliki, dan meminta ulang cuma
  // membuka kemungkinan salah ketik pada identitas yang sudah benar.
  if (!me.resellerAccount) {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Program Reseller</h1>
          <p className="text-sm text-muted-foreground">
            Daftar gratis, langsung bisa transaksi. Ambil paket berbayar kapan saja untuk menurunkan harga
            di setiap pembelian — sekali bayar, berlaku selamanya.
          </p>
        </div>
        <ResellerJoinForm email={me.email} action={registerResellerFromAccount} />
      </div>
    );
  }

  const account = me.resellerAccount;
  const paid = account.tierPricePaid;

  // Penawaran upgrade dihitung dengan fungsi yang SAMA dengan yang menagih
  // (lib/reseller/upgrade.ts). Kalau layar dan tagihan punya dua salinan
  // perhitungan, cepat atau lambat angkanya berbeda - dan yang dirugikan selalu
  // orang yang sudah terlanjur menekan tombolnya.
  const offers = tiers.map((tier) => {
    const quote = quoteUpgrade({ tierPrice: tier.price, paidForCurrentTier: paid });
    const allowed = canUpgradeTo({
      targetTierId: tier.id,
      targetPrice: tier.price,
      targetIsActive: true,
      currentTierId: account.tier?.id ?? null,
      paidForCurrentTier: paid,
    });
    return {
      id: tier.id,
      name: tier.name,
      badgeColor: tier.badgeColor,
      discountPercent: tier.discountPercent,
      benefits: parseBenefits(tier.benefits),
      tierPrice: quote.tierPrice.toString(),
      credit: quote.credit.toString(),
      payable: quote.payable.toString(),
      blockedReason: allowed.ok ? null : allowed.reason,
      isCurrent: account.tier?.id === tier.id,
    };
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Program Reseller</h1>
        <p className="text-sm text-muted-foreground">
          Status akun reseller dan paket hargamu.
        </p>
      </div>

      <ResellerStatus
        email={me.email}
        account={{
          businessName: account.businessName,
          phone: account.phone,
          referralCode: account.referralCode,
          isActive: account.isActive,
          isActivated: account.activatedAt !== null,
          tierName: account.tier?.name ?? null,
          tierColor: account.tier?.badgeColor ?? null,
          tierDiscountPercent: account.tier?.discountPercent ?? 0,
        }}
        pendingPurchase={
          account.purchases[0]
            ? {
                id: account.purchases[0].id,
                tierName: account.purchases[0].tier.name,
                totalPaid: account.purchases[0].totalPaid.toString(),
                expiredAt: account.purchases[0].expiredAt?.toISOString() ?? null,
              }
            : null
        }
        offers={offers}
        methods={methods}
        buyAction={buyResellerTier}
        resendAction={resendResellerActivation}
      />
    </div>
  );
}
