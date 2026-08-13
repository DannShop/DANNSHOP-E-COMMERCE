import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPartnerSession } from "@/lib/partner/session";
import { toPartnerStatus, type PartnerTrxStatus } from "@/lib/partner/response";

export const metadata: Metadata = { title: "Transaksi Mitra" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;
const DATE_FMT = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

const FILTERS = [
  { value: "", label: "Semua" },
  { value: "Sukses", label: "Sukses" },
  { value: "Pending", label: "Pending" },
  { value: "Gagal", label: "Gagal" },
] as const;

// Peta status partner -> OrderStatus internal. Kebalikan dari toPartnerStatus(),
// ditulis eksplisit supaya filternya dikerjakan DATABASE, bukan disaring di
// memori setelah mengambil semua baris — mitra dengan puluhan ribu transaksi
// akan menjatuhkan halaman ini kalau disaring belakangan.
const STATUS_GROUPS: Record<PartnerTrxStatus, Prisma.OrderWhereInput["status"]> = {
  Sukses: { in: ["COMPLETED"] },
  Gagal: { in: ["FAILED", "EXPIRED", "REFUNDED"] },
  Pending: { in: ["PENDING_PAYMENT", "PAID", "PROCESSING", "REFUND_PENDING", "NEEDS_REVIEW"] },
};

function StatusBadge({ status }: { status: PartnerTrxStatus }) {
  if (status === "Sukses") return <Badge variant="success">Sukses</Badge>;
  if (status === "Gagal") return <Badge variant="destructive">Gagal</Badge>;
  return <Badge variant="warning">Pending</Badge>;
}

function describeTarget(inputFields: unknown, target: unknown): string {
  if (target === null || typeof target !== "object") return "—";
  const t = target as Record<string, string>;
  const fields = Array.isArray(inputFields) ? (inputFields as { name: string }[]) : [];
  if (fields.length > 0) return fields.map((f) => t[f.name] ?? "").join("|");
  return Object.values(t).join("|");
}

export default async function MitraTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const partner = await getPartnerSession();
  if (!partner) redirect("/account/mitra");

  const params = await searchParams;
  const activeFilter = FILTERS.find((f) => f.value === params.status)?.value ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.OrderWhereInput = {
    partnerId: partner.partnerId,
    ...(activeFilter ? { status: STATUS_GROUPS[activeFilter as PartnerTrxStatus] } : {}),
  };

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        partnerRefId: true,
        productName: true,
        itemName: true,
        productItemId: true,
        target: true,
        status: true,
        sellingPrice: true,
        manualSn: true,
        createdAt: true,
        fulfillments: { orderBy: { attemptNo: "desc" }, take: 1, select: { status: true, sn: true, message: true } },
      },
    }),
    db.order.count({ where }),
  ]);

  // inputFields diambil sekali untuk semua item yang muncul di halaman ini —
  // membacanya per baris akan jadi N+1 query pada tabel yang paling sering dibuka.
  const itemIds = [...new Set(orders.map((o) => o.productItemId).filter((id): id is string => id !== null))];
  const items = itemIds.length
    ? await db.productItem.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, product: { select: { inputFields: true } } },
      })
    : [];
  const inputFieldsByItem = new Map(items.map((i) => [i.id, i.product.inputFields]));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value || "all"}
            href={f.value ? `/mitra/transaksi?status=${f.value}` : "/mitra/transaksi"}
            className={cn(
              buttonVariants({ size: "sm", variant: activeFilter === f.value ? "default" : "outline" }),
            )}
          >
            {f.label}
          </Link>
        ))}
        <span className="ml-auto self-center text-xs text-muted-foreground">{total} transaksi</span>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Belum ada transaksi lewat API di filter ini. Transaksi storefront biasa tidak muncul di sini — halaman ini
          hanya memuat order yang masuk lewat{" "}
          <code className="rounded bg-foreground/10 px-1">POST /api/v1/transaction</code>.
        </p>
      ) : (
        <div className="glass-card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="bg-foreground/[0.03] text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">ref_id</th>
                  <th className="px-4 py-2.5 font-medium">Produk</th>
                  <th className="px-4 py-2.5 font-medium">Tujuan</th>
                  <th className="px-4 py-2.5 text-right font-medium">Harga</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">SN / Pesan</th>
                  <th className="px-4 py-2.5 font-medium">Waktu</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const status = toPartnerStatus(o.status);
                  const latest = o.fulfillments[0];
                  const sn = latest?.status === "SUCCESS" ? (latest.sn ?? null) : null;
                  return (
                    <tr key={o.id} className="border-t border-border/40 align-top">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs break-all">{o.partnerRefId ?? "—"}</span>
                        <span className="block text-[11px] text-muted-foreground">{o.orderNumber}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {o.productName}
                        <span className="block text-[11px] text-muted-foreground">{o.itemName}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs break-all">
                        {describeTarget(
                          o.productItemId ? inputFieldsByItem.get(o.productItemId) : null,
                          o.target,
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatRupiah(Number(o.sellingPrice))}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={status} />
                      </td>
                      <td className="max-w-[16rem] px-4 py-2.5 text-xs">
                        {sn ?? o.manualSn ? (
                          <span className="font-mono break-all">{sn ?? o.manualSn}</span>
                        ) : (
                          <span className="text-muted-foreground">{latest?.message ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                        {DATE_FMT.format(o.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/mitra/transaksi?${new URLSearchParams({ ...(activeFilter ? { status: activeFilter } : {}), page: String(page - 1) })}`}
            aria-disabled={page <= 1}
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              page <= 1 && "pointer-events-none opacity-40",
            )}
          >
            Sebelumnya
          </Link>
          <span className="text-xs text-muted-foreground">
            Halaman {page} dari {totalPages}
          </span>
          <Link
            href={`/mitra/transaksi?${new URLSearchParams({ ...(activeFilter ? { status: activeFilter } : {}), page: String(page + 1) })}`}
            aria-disabled={page >= totalPages}
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              page >= totalPages && "pointer-events-none opacity-40",
            )}
          >
            Berikutnya
          </Link>
        </div>
      )}
    </div>
  );
}
