import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/order/status-labels";
import { banUser, unbanUser, resetUserPassword } from "@/app/actions/admin-users";
import { UserActions } from "../user-actions";

const RECENT_LIMIT = 25;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-heading text-lg font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const now = new Date();

  const user = await db.user.findUnique({
    where: { id },
    include: {
      wallet: { select: { balance: true } },
      _count: { select: { orders: true, deposits: true } },
    },
  });
  if (!user) notFound();

  const [memberships, orders, deposits, completedAgg] = await Promise.all([
    db.userMembership.findMany({
      where: { userId: user.id },
      orderBy: { expiresAt: "desc" },
      include: { tier: { select: { name: true, badgeColor: true } } },
      take: RECENT_LIMIT,
    }),
    db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
    }),
    db.deposit.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
    }),
    db.order.aggregate({
      where: { userId: user.id, status: "COMPLETED" },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  // Tier aktif = expiresAt > now yang paling jauh ke depan. `memberships` sudah
  // diurut expiresAt desc, jadi cukup ambil yang pertama yang belum lewat -
  // aturan yang sama dengan getMembershipContext() di lib/membership/tier.ts.
  const activeMembership = memberships.find((m) => m.expiresAt > now) ?? null;

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Kembali ke daftar user
        </Link>
        <h1 className="mt-2 font-heading text-xl font-bold break-all">{user.email}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {user.name}
          <span aria-hidden="true">·</span>
          <span>Bergabung {formatTanggal(user.createdAt)}</span>
          {user.role === "ADMIN" && <Badge variant="warning">Admin</Badge>}
          {user.bannedAt ? (
            <Badge variant="destructive">Ditangguhkan {formatTanggal(user.bannedAt)}</Badge>
          ) : (
            <Badge variant="success">Aktif</Badge>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Tier sekarang"
          value={activeMembership ? activeMembership.tier.name : "Free"}
          hint={activeMembership ? `Berlaku s/d ${formatTanggal(activeMembership.expiresAt)}` : "Belum pernah berlangganan aktif"}
        />
        <Stat label="Saldo dompet" value={formatRupiah(user.wallet?.balance ?? 0n)} />
        <Stat
          label="Total belanja"
          value={formatRupiah(completedAgg._sum.total ?? 0n)}
          hint={`${completedAgg._count} order berhasil`}
        />
        <Stat
          label="Order / Deposit"
          value={`${user._count.orders} / ${user._count.deposits}`}
          hint="Seluruh status"
        />
      </div>

      <UserActions
        user={{
          id: user.id,
          email: user.email,
          role: user.role,
          // Date tidak bisa menyeberang ke Client Component apa adanya - dikirim
          // sebagai ISO string, dan komponennya cuma butuh tahu null/tidak.
          bannedAt: user.bannedAt ? user.bannedAt.toISOString() : null,
          banReason: user.banReason,
        }}
        banAction={banUser}
        unbanAction={unbanUser}
        resetPasswordAction={resetUserPassword}
      />

      {/* ===== Riwayat membership ===== */}
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-bold">Riwayat Membership</h2>
        {memberships.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Belum pernah punya tier. Statusnya Free.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead>Mulai</TableHead>
                  <TableHead>Berakhir</TableHead>
                  <TableHead className="tabular-nums">Dibayar</TableHead>
                  <TableHead>Asal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberships.map((m) => (
                  <TableRow key={m.id} className={m.expiresAt > now ? "" : "opacity-60"}>
                    <TableCell>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: m.tier.badgeColor }}
                      >
                        {m.tier.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{formatTanggal(m.startedAt)}</TableCell>
                    <TableCell className="text-xs">{formatTanggal(m.expiresAt)}</TableCell>
                    <TableCell className="tabular-nums text-xs">{formatRupiah(m.pricePaid)}</TableCell>
                    <TableCell className="text-xs">
                      {m.source === "manual_grant" ? "Pemberian Admin" : "Pembelian"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ===== Riwayat order ===== */}
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-bold">
          Order Terakhir{orders.length === RECENT_LIMIT && ` (${RECENT_LIMIT} teratas)`}
        </h2>
        {orders.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Belum ada order.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Produk</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead className="tabular-nums">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/admin/orders/${o.orderNumber}`} className="font-medium hover:underline">
                        {o.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-normal text-xs">
                      {o.productName} · {o.itemName}
                    </TableCell>
                    <TableCell className="text-xs">{formatTanggal(o.createdAt)}</TableCell>
                    <TableCell className="tabular-nums text-xs">{formatRupiah(o.total)}</TableCell>
                    <TableCell className="text-xs">{ORDER_STATUS_LABEL[o.status] ?? o.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ===== Riwayat deposit ===== */}
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-bold">
          Isi Saldo Terakhir{deposits.length === RECENT_LIMIT && ` (${RECENT_LIMIT} teratas)`}
        </h2>
        {deposits.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Belum pernah isi saldo.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead className="tabular-nums">Nominal</TableHead>
                  <TableHead className="tabular-nums">Bonus</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deposits.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs">{formatTanggal(d.createdAt)}</TableCell>
                    <TableCell className="tabular-nums text-xs">{formatRupiah(d.amount)}</TableCell>
                    <TableCell className="tabular-nums text-xs">
                      {d.bonusAmount > 0n ? formatRupiah(d.bonusAmount) : "-"}
                    </TableCell>
                    <TableCell className="text-xs">{d.paymentMethod ?? "-"}</TableCell>
                    <TableCell className="text-xs">{d.status}</TableCell>
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
