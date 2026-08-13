import { db } from "@/lib/db";
import {
  createPartnerAction,
  regenerateCallbackSecretAction,
  regeneratePartnerKeyAction,
  updatePartnerAction,
} from "@/app/actions/partners";
import { PartnersClient, type PartnerRow } from "./partners-client";

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const partners = await db.partnerAccount.findMany({
    include: {
      user: {
        select: {
          email: true,
          name: true,
          bannedAt: true,
          wallet: { select: { balance: true } },
          memberships: {
            where: { expiresAt: { gt: new Date() } },
            orderBy: { expiresAt: "desc" },
            take: 1,
            select: { tier: { select: { name: true, discountPercent: true } } },
          },
        },
      },
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: PartnerRow[] = partners.map((p) => ({
    id: p.id,
    username: p.username,
    email: p.user.email,
    name: p.user.name,
    banned: p.user.bannedAt !== null,
    balance: Number(p.user.wallet?.balance ?? 0n),
    tierName: p.user.memberships[0]?.tier.name ?? null,
    // discountPercent disimpan dalam basis point (100 = 1,00%) — sama seperti
    // yang dibaca effectivePrice(). Dibagi di sini, bukan di client, supaya
    // hanya ada satu tempat yang tahu satuannya.
    discountPercent: (p.user.memberships[0]?.tier.discountPercent ?? 0) / 100,
    callbackUrl: p.callbackUrl,
    hasCallbackSecret: p.callbackSecretEnc !== null,
    ipWhitelist: p.ipWhitelist,
    isActive: p.isActive,
    orderCount: p._count.orders,
    lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
  }));

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">API Partner (H2H)</h1>
        <p className="text-sm text-muted-foreground">
          Reseller yang memesan lewat API, bukan lewat storefront. Mereka membayar dari saldo prabayar yang diisi
          sendiri lewat halaman Isi Saldo biasa — tidak ada mekanisme top-up terpisah.
        </p>
      </div>

      <div className="rounded-lg border-l-2 border-sky-500/50 bg-sky-500/5 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Jalur normalnya sekarang lewat Pengajuan Mitra</strong> — member mendaftar
        sendiri dari Akun → Mitra, kamu menyetujuinya, dan kredensialnya terbit otomatis tanpa perlu dikirim. Form di
        bawah adalah jalur manual untuk kasus darurat/demo: buat akun partner, kirim{" "}
        <code className="rounded bg-foreground/10 px-1">username</code> +{" "}
        <code className="rounded bg-foreground/10 px-1">API key</code> ke partner, lalu beri akunnya tier member kalau
        mereka berhak dapat harga reseller (Admin → Kontrol User). Harga yang mereka terima lewat API adalah harga jual
        dikurangi diskon tier itu — tidak ada tabel harga khusus partner yang harus dijaga terpisah. Dokumentasi yang
        bisa dikirim ke partner sekarang <strong className="text-foreground">dibaca mitra sendiri</strong> di portal
        mereka (<code className="rounded bg-foreground/10 px-1">/mitra/dokumentasi</code>), lengkap dengan username
        mereka sudah terisi di contoh kodenya.
      </div>

      <PartnersClient
        partners={rows}
        createAction={createPartnerAction}
        updateAction={updatePartnerAction}
        regenerateKeyAction={regeneratePartnerKeyAction}
        regenerateSecretAction={regenerateCallbackSecretAction}
      />
    </div>
  );
}
