import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal } from "@/lib/format";
import { parseBenefits } from "@/lib/membership/benefits";
import {
  createMembershipTier,
  updateMembershipTier,
  deleteMembershipTier,
  grantMembership,
  previewTierPricing,
} from "@/app/actions/admin-membership";
import { TierForm } from "./tier-form";
import { NewTierForm } from "./new-tier-form";
import { GrantMembershipForm } from "./grant-form";
import { TierPricePreview } from "./tier-price-preview";

export default async function MembershipTiersPage() {
  const [tiers, activeMembers, categories] = await Promise.all([
    db.membershipTier.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { memberships: true } } },
    }),
    // Diurutkan yang paling dekat kedaluwarsa duluan - itu yang paling relevan
    // buat admin pantau (kandidat churn / follow-up perpanjangan).
    db.userMembership.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "asc" },
      include: { user: { select: { email: true, name: true } }, tier: { select: { name: true, badgeColor: true } } },
      take: 50,
    }),
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Tier Member</h1>
        <p className="text-sm text-muted-foreground">
          Kelola paket tier (nama, harga, masa berlaku, diskon produk, dan benefit). Diskon &amp; benefit berlaku LIVE
          untuk semua member yang sedang punya tier ini begitu disimpan - tidak perlu member beli ulang.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Tambah Tier Baru</h2>
        <div className="rounded-lg border p-4">
          <NewTierForm action={createMembershipTier} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Paket Tier ({tiers.length})</h2>
        <div className="space-y-3">
          {tiers.map((t) => (
            <TierForm
              key={t.id}
              tier={{
                id: t.id,
                slug: t.slug,
                name: t.name,
                price: t.price.toString(),
                discountPercent: t.discountPercent,
                depositBonusPercent: t.depositBonusPercent,
                badgeColor: t.badgeColor,
                benefits: parseBenefits(t.benefits),
                sortOrder: t.sortOrder,
                isActive: t.isActive,
                membershipCount: t._count.memberships,
              }}
              updateAction={updateMembershipTier}
              deleteAction={deleteMembershipTier}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Preview Harga yang Didapat Member</h2>
        <p className="text-xs text-muted-foreground">
          Cek langsung berapa yang dibayar customer di tiap tier sebelum kamu mengumumkan paketnya.
          Pilih kategori, lalu bandingkan harga per item dari tanpa tier sampai tier tertinggi.
        </p>
        <div className="rounded-lg border p-4">
          <TierPricePreview categories={categories} previewAction={previewTierPricing} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Beri Tier Manual</h2>
        <p className="text-xs text-muted-foreground">
          Untuk kompensasi/hadiah CS - tidak memotong saldo user. Tercatat di log admin.
        </p>
        <GrantMembershipForm tiers={tiers.map((t) => ({ id: t.id, name: t.name }))} action={grantMembership} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Member Aktif ({activeMembers.length})</h2>
        {activeMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada member dengan tier aktif.</p>
        ) : (
          <div className="rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Asal</TableHead>
                  <TableHead>Berlaku Sampai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeMembers.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <span className="block font-medium">{m.user.name}</span>
                      <span className="block text-xs text-muted-foreground">{m.user.email}</span>
                    </TableCell>
                    <TableCell>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                        style={{ backgroundColor: m.tier.badgeColor }}
                      >
                        {m.tier.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted">{m.source === "purchase" ? "Beli" : "Pemberian Admin"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatTanggal(m.expiresAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
