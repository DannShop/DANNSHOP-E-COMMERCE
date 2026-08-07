import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMembershipContext } from "@/lib/membership/tier";
import { parseBenefits } from "@/lib/membership/benefits";
import { purchaseTier } from "@/app/actions/membership";
import { TierPurchaseCard } from "./tier-purchase-card";

export const metadata: Metadata = { title: "Membership" };
export const dynamic = "force-dynamic";

export default async function MembershipPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [tiers, membership] = await Promise.all([
    db.membershipTier.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getMembershipContext(userId),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="text-center">
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">Tier Member</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upgrade tier untuk diskon harga produk dan benefit tambahan. Diskon &amp; benefit tidak lagi otomatis
          didapat sekadar dengan login - pilih tier yang sesuai kebutuhanmu.
        </p>
        {membership.tier && membership.expiresAt && (
          <p className="mt-3 inline-block rounded-full bg-muted px-4 py-1.5 text-sm">
            Tier aktif kamu: <strong>{membership.tier.name}</strong>, berlaku sampai{" "}
            {membership.expiresAt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        )}
      </div>

      {tiers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
          Belum ada paket tier yang tersedia saat ini.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiers.map((t) => (
            <TierPurchaseCard
              key={t.id}
              tier={{
                id: t.id,
                name: t.name,
                price: t.price.toString(),
                durationDays: t.durationDays,
                discountPercent: t.discountPercent,
                badgeColor: t.badgeColor,
                benefits: parseBenefits(t.benefits),
              }}
              isLoggedIn={Boolean(userId)}
              currentTierId={membership.tier?.id ?? null}
              currentTierExpiresAt={
                membership.expiresAt
                  ? membership.expiresAt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
                  : null
              }
              action={purchaseTier}
            />
          ))}
        </div>
      )}
    </div>
  );
}
