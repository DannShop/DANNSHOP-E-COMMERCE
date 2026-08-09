import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { PageSizeSelect, Pagination } from "@/components/admin/table-toolbar";
import { buildPagination, parsePage, parsePageSize } from "@/lib/admin/pagination";

const TABS = [
  { key: "all", label: "Semua" },
  { key: "member", label: "Punya Tier Aktif" },
  { key: "banned", label: "Ditangguhkan" },
] as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string; per?: string }>;
}) {
  const { tab: rawTab, q, page: rawPage, per } = await searchParams;
  const activeTab = TABS.find((t) => t.key === rawTab) ?? TABS[0];
  const now = new Date();
  const pageSize = parsePageSize(per);

  const where = {
    ...(activeTab.key === "banned" ? { bannedAt: { not: null } } : {}),
    ...(activeTab.key === "member"
      ? { memberships: { some: { expiresAt: { gt: now } } } }
      : {}),
    ...(q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {}),
  };

  const total = await db.user.count({ where });
  const pagination = buildPagination(total, parsePage(rawPage), pageSize);
  const users = await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: pagination.skip,
    take: pagination.pageSize,
    include: {
      wallet: { select: { balance: true } },
      _count: { select: { orders: true } },
    },
  });

  const userIds = users.map((u) => u.id);

  // Dua agregat berikut sengaja di-batch untuk SELURUH halaman, bukan diquery
  // per baris - daftar 50 user kalau tidak begini jadi 100 query tambahan.
  const [activeMemberships, spendByUser] = await Promise.all([
    userIds.length > 0
      ? db.userMembership.findMany({
          where: { userId: { in: userIds }, expiresAt: { gt: now } },
          orderBy: { expiresAt: "desc" },
          include: { tier: { select: { name: true, badgeColor: true } } },
        })
      : [],
    userIds.length > 0
      ? db.order.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds }, status: "COMPLETED" },
          _sum: { total: true },
        })
      : [],
  ]);

  // expiresAt desc + ambil kemunculan pertama per user = tier AKTIF user itu,
  // aturan yang sama persis dengan getMembershipContext() di
  // lib/membership/tier.ts. Jangan diganti jadi "tier termahal" atau semacamnya
  // tanpa mengubah sumber kebenaran itu juga.
  const tierByUser = new Map<string, { name: string; badgeColor: string; expiresAt: Date }>();
  for (const m of activeMemberships) {
    if (!tierByUser.has(m.userId)) {
      tierByUser.set(m.userId, { name: m.tier.name, badgeColor: m.tier.badgeColor, expiresAt: m.expiresAt });
    }
  }
  const spentByUser = new Map<string, bigint>();
  for (const row of spendByUser) {
    if (row.userId) spentByUser.set(row.userId, row._sum.total ?? 0n);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Kontrol User</h1>
        <p className="text-sm text-muted-foreground">
          Daftar akun terdaftar, status tier, dan riwayat belanjanya. Klik email untuk detail lengkap,
          penangguhan akun, dan reset password.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/admin/users?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded px-3 py-1.5 text-sm ${
                activeTab.key === t.key ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <form action="/admin/users" className="flex gap-2">
          <input type="hidden" name="tab" value={activeTab.key} />
          <Input name="q" defaultValue={q ?? ""} placeholder="Cari email / nama" className="w-56" />
          <input type="hidden" name="per" value={pageSize} />
          <Button type="submit" variant="outline">Cari</Button>
        </form>
      </div>

      <div className="flex justify-end">
        <PageSizeSelect value={pageSize} />
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="tabular-nums">Order</TableHead>
              <TableHead className="tabular-nums">Total Belanja</TableHead>
              <TableHead className="tabular-nums">Saldo</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Tidak ada user yang cocok.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const tier = tierByUser.get(user.id);
                return (
                  <TableRow key={user.id} className={user.bannedAt ? "opacity-60" : ""}>
                    <TableCell className="whitespace-normal">
                      <Link href={`/admin/users/${user.id}`} className="font-medium hover:underline">
                        {user.email}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {user.name}
                        {user.role === "ADMIN" && " · Admin"}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {tier ? (
                        <span className="flex flex-col gap-0.5">
                          <span
                            className="w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                            style={{ backgroundColor: tier.badgeColor }}
                          >
                            {tier.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            s/d {formatTanggal(tier.expiresAt)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Free</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{user._count.orders}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatRupiah(spentByUser.get(user.id) ?? 0n)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatRupiah(user.wallet?.balance ?? 0n)}
                    </TableCell>
                    <TableCell>
                      {user.bannedAt ? (
                        <Badge variant="destructive">Ditangguhkan</Badge>
                      ) : (
                        <Badge variant="success">Aktif</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <Pagination info={pagination} />
      </div>
    </div>
  );
}
