import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Plus, Crown } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { ORDER_STATUS_LABEL, DEPOSIT_STATUS_LABEL } from "@/lib/order/status-labels";
import { getMembershipContext } from "@/lib/membership/tier";
import { getPwaSettings } from "@/lib/pwa/settings";
import { DownloadApkCard } from "@/components/pwa/download-apk-card";
import { InstallAppCard } from "./install-app-card";

export const metadata: Metadata = { title: "Akun Saya" };

function SectionHeader({
  title,
  href,
}: {
  title: string;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-heading text-base font-bold">{title}</h2>
      <Link
        href={href}
        className="flex items-center gap-1 text-sm text-primary transition-opacity hover:opacity-70"
      >
        Lihat semua
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [wallet, recentOrders, recentDeposits, membership, pwaSettings] = await Promise.all([
    db.wallet.findUnique({ where: { userId } }),
    db.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.deposit.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 3 }),
    getMembershipContext(userId),
    getPwaSettings(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      {/* ===== Kartu saldo ===== */}
      <section className="glass-card flex flex-col gap-5 rounded-3xl p-6 sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div>
          <p className="text-sm text-muted-foreground">Saldo kamu</p>
          <p className="mt-1 font-heading text-4xl leading-none font-bold tracking-tight text-primary sm:text-[2.75rem]">
            {formatRupiah(wallet?.balance ?? 0n)}
          </p>
          <p className="mt-2.5 text-xs text-muted-foreground">
            Halo, {session.user.name}. Bayar pakai saldo bikin checkout selesai tanpa buka aplikasi bank.
          </p>
        </div>

        <Link
          href="/account/deposit"
          className={cn(buttonVariants({ size: "lg" }), "h-11 shrink-0 gap-1.5 rounded-xl px-5")}
        >
          <Plus className="size-4" aria-hidden="true" />
          Isi Saldo
        </Link>
      </section>

      {/* ===== Kartu status paket reseller ===== */}
      <Link
        href="/account/reseller"
        className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 px-5 py-4 transition-colors duration-200 ease-out hover:bg-foreground/[0.04]"
      >
        <span className="flex items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: membership.tier?.badgeColor ?? "var(--muted-foreground)" }}
          >
            <Crown className="size-5" aria-hidden="true" />
          </span>
          <span>
            {membership.tier ? (
              <>
                <span className="block text-sm font-semibold">Paket {membership.tier.name}</span>
                {/* Paket reseller sekali bayar, berlaku selamanya - tidak ada
                    tanggal habis untuk ditampilkan. Sebelumnya baris ini membaca
                    `expiresAt` yang sekarang SELALU null, jadi yang terbaca
                    pengguna adalah "Berlaku sampai -". */}
                <span className="block text-xs text-muted-foreground">Berlaku selamanya</span>
              </>
            ) : (
              <>
                <span className="block text-sm font-semibold">Belum punya paket reseller</span>
                <span className="block text-xs text-muted-foreground">
                  Ambil paket untuk harga lebih murah di setiap transaksi
                </span>
              </>
            )}
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>

      {/* ===== Ajakan pasang aplikasi =====
          Merender null sendiri kalau app-nya sudah terpasang atau browsernya
          tidak mendukung, jadi tidak perlu dikondisikan dari sini. */}
      <InstallAppCard />

      {/* Unduh APK. Dua jalur pemasangan yang berbeda sengaja berdampingan:
          yang di atas memasang lewat browser (PWA), yang ini berkas Android
          sungguhan. Kartunya menyembunyikan diri sendiri di luar Android. */}
      {pwaSettings.apk.toko && <DownloadApkCard apk={pwaSettings.apk.toko} />}

      {/* ===== Transaksi terakhir ===== */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Transaksi Terakhir" href="/account/orders" />
        {recentOrders.length === 0 ? (
          <EmptyState>
            Belum ada transaksi.{" "}
            <Link href="/" className="text-primary hover:underline">
              Mulai belanja
            </Link>
            .
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentOrders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/invoice/${order.publicToken}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 px-4 py-3.5 transition-colors duration-200 ease-out hover:bg-foreground/[0.04]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {order.productName} · {order.itemName}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {formatRupiah(order.total)} · {formatTanggal(order.createdAt)}
                    </span>
                  </span>
                  <Badge variant="muted">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ===== Deposit terakhir ===== */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Riwayat Deposit" href="/account/deposits" />
        {recentDeposits.length === 0 ? (
          <EmptyState>Belum pernah mengisi saldo.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentDeposits.map((deposit) => (
              <li key={deposit.id}>
                <Link
                  href={`/account/deposit/${deposit.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 px-4 py-3.5 transition-colors duration-200 ease-out hover:bg-foreground/[0.04]"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{formatRupiah(deposit.amount)}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {formatTanggal(deposit.createdAt)}
                    </span>
                  </span>
                  <Badge variant="muted">
                    {DEPOSIT_STATUS_LABEL[deposit.status] ?? deposit.status}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
