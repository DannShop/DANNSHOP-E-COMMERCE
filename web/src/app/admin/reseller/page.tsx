import { db } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { setResellerActive } from "@/app/actions/admin-reseller";
import { ResellerList } from "./reseller-list";

export default async function AdminResellerPage() {
  const [resellers, paidCount, revenue] = await Promise.all([
    db.resellerAccount.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        businessName: true,
        phone: true,
        referralCode: true,
        isActive: true,
        activatedAt: true,
        tierPricePaid: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        tier: { select: { name: true, badgeColor: true } },
      },
    }),
    db.resellerAccount.count({ where: { tierId: { not: null } } }),
    // Hanya pembelian yang BENAR-BENAR dibayar. Menghitung yang PENDING sebagai
    // pendapatan adalah cara paling mudah membuat angka di panel tidak pernah
    // cocok dengan uang yang sungguhan masuk.
    db.tierPurchase.aggregate({ where: { status: "PAID" }, _sum: { totalPaid: true } }),
  ]);

  const activated = resellers.filter((r) => r.activatedAt !== null).length;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Reseller</h1>
        <p className="text-sm text-muted-foreground">
          Daftar peserta program reseller. Paket &amp; harganya diatur di menu Paket Reseller.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Terdaftar" value={String(resellers.length)} hint={`${activated} sudah aktivasi`} />
        <Stat label="Punya paket berbayar" value={String(paidCount)} hint="Sisanya di paket gratis" />
        <Stat
          label="Pendapatan paket"
          value={formatRupiah(revenue._sum.totalPaid ?? 0n)}
          hint="Hanya pembelian yang sudah dibayar"
        />
      </div>

      <ResellerList
        resellers={resellers.map((r) => ({
          id: r.id,
          name: r.user.name,
          email: r.user.email,
          businessName: r.businessName,
          phone: r.phone,
          referralCode: r.referralCode,
          isActive: r.isActive,
          isActivated: r.activatedAt !== null,
          tierName: r.tier?.name ?? null,
          tierColor: r.tier?.badgeColor ?? null,
          tierPricePaid: r.tierPricePaid.toString(),
          joinedAt: r.createdAt.toISOString(),
        }))}
        setActiveAction={setResellerActive}
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
