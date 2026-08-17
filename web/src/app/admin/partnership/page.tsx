import { db } from "@/lib/db";
import {
  approvePartnerApplicationAction,
  rejectPartnerApplicationAction,
  savePartnerPackageAction,
} from "@/app/actions/partners";
import { suggestPartnerUsername } from "@/lib/partner/application";
import { getPartnerPackage } from "@/lib/partner/package";
import { PartnershipClient, type ApplicationRow } from "./partnership-client";
import { PartnerPackageForm } from "./package-form";

export const dynamic = "force-dynamic";

export default async function PartnershipPage() {
  const partnerPackage = await getPartnerPackage();
  const applications = await db.partnerApplication.findMany({
    include: {
      user: {
        select: {
          name: true,
          email: true,
          bannedAt: true,
          createdAt: true,
          wallet: { select: { balance: true } },
          partnerAccount: { select: { username: true } },
          memberships: {
            where: { expiresAt: { gt: new Date() } },
            orderBy: { expiresAt: "desc" },
            take: 1,
            select: { tier: { select: { name: true } } },
          },
          _count: { select: { orders: true } },
        },
      },
    },
    // PENDING duluan apa pun tanggalnya: antrean ini dibuka untuk memutuskan,
    // bukan untuk membaca riwayat. Pengajuan lama yang sudah ditinjau tidak
    // boleh mendorong yang menunggu ke bawah layar.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const rows: ApplicationRow[] = applications.map((a) => ({
    id: a.id,
    status: a.status,
    businessName: a.businessName,
    businessType: a.businessType,
    businessCity: a.businessCity,
    websiteUrl: a.websiteUrl,
    picName: a.picName,
    picPhone: a.picPhone,
    picRole: a.picRole,
    platform: a.platform,
    serverIps: a.serverIps,
    callbackUrl: a.callbackUrl,
    monthlyVolume: a.monthlyVolume,
    notes: a.notes,
    reviewNote: a.reviewNote,
    createdAt: a.createdAt.toISOString(),
    reviewedAt: a.reviewedAt?.toISOString() ?? null,
    suggestedUsername: suggestPartnerUsername(a.businessName),
    userName: a.user.name,
    userEmail: a.user.email,
    userBanned: a.user.bannedAt !== null,
    balance: Number(a.user.wallet?.balance ?? 0n),
    tierName: a.user.memberships[0]?.tier.name ?? null,
    orderCount: a.user._count.orders,
    memberSince: a.user.createdAt.toISOString(),
    partnerUsername: a.user.partnerAccount?.username ?? null,
  }));

  const pendingCount = rows.filter((r) => r.status === "PENDING").length;

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Mitra H2H</h1>
        <p className="text-sm text-muted-foreground">
          Atur paket mitra di bawah, lalu tinjau antrean pengajuannya. Mitra yang melunasi biaya
          join mendapat kredensial API secara otomatis — kamu tidak perlu menyetujui apa pun.
          Tombol setujui di antrean tetap ada untuk mitra yang membayar di luar sistem.
        </p>
      </div>

      <PartnerPackageForm initial={partnerPackage} action={savePartnerPackageAction} />

      <div className="rounded-lg border-l-2 border-sky-500/50 bg-sky-500/5 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Yang perlu diperiksa sebelum menyetujui:</strong> riwayat akun pemohon
        (umur akun, jumlah order, saldo) dan kewajaran estimasi volumenya. Harga yang mereka terima lewat API mengikuti
        tier akunnya — mitra tanpa tier akan mendapat harga yang sama dengan pembeli retail, jadi beri tier lewat{" "}
        <strong className="text-foreground">Kontrol User</strong> kalau memang berhak dapat harga reseller. Akun yang
        sudah jadi mitra dikelola di <strong className="text-foreground">API Partner</strong>.
        {pendingCount > 0 && (
          <>
            {" "}
            Saat ini <strong className="text-foreground">{pendingCount} pengajuan</strong> menunggu.
          </>
        )}
      </div>

      <PartnershipClient
        applications={rows}
        approveAction={approvePartnerApplicationAction}
        rejectAction={rejectPartnerApplicationAction}
      />
    </div>
  );
}
