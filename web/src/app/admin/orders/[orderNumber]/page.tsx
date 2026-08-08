import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABEL } from "@/lib/order/status-labels";
import { diagnoseFailure } from "@/lib/order/failure-reason";
import { ProviderApiLogEntryCard } from "@/components/admin/provider-api-log-entry";
import {
  retryFulfillmentAction, retryRefundAction, markCompletedManualAction, markRefundedAction,
} from "@/app/actions/orders";
import { OrderActions } from "./order-actions";
import type { PaymentActions } from "@/lib/midtrans/client";

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(amount));
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: {
      payment: true,
      fulfillments: { orderBy: { attemptNo: "desc" } },
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();

  const latestFulfillment = order.fulfillments[0];
  const canRetryRefund = Boolean(order.userId) && latestFulfillment?.status === "FAILED";

  // Dicocokkan lewat orderId ATAU ourRefId: log yang ditulis sebelum konteks order
  // sempat dilampirkan (atau oleh jalur yang hanya tahu ref id) tetap ikut terambil,
  // supaya halaman ini tidak pernah menyembunyikan panggilan yang justru gagal.
  const refIds = order.fulfillments.map((f) => f.ourRefId);
  const apiLogs = await db.providerApiLog.findMany({
    where: { OR: [{ orderId: order.id }, ...(refIds.length ? [{ ourRefId: { in: refIds } }] : [])] },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/orders" className="text-sm text-primary hover:underline">← Orders</Link>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{order.orderNumber}</h1>
          <Badge variant="muted">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 flex flex-col gap-4">
          <div className="rounded-xl ring-1 ring-foreground/10 p-4">
            <h2 className="text-sm font-semibold mb-2">Info Order</h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Produk</dt>
              <dd>{order.productName} · {order.itemName}</dd>
              <dt className="text-muted-foreground">Pembeli</dt>
              <dd>{order.buyerEmail ?? "-"} / {order.buyerPhone ?? "-"}</dd>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="tabular-nums">{formatRupiah(order.total)}</dd>
              <dt className="text-muted-foreground">Metode Bayar</dt>
              <dd>{order.paidVia ?? "-"}</dd>
              <dt className="text-muted-foreground">Target</dt>
              <dd>{JSON.stringify(order.target)}</dd>
            </dl>

            {/* Data pembayaran mentah dari Midtrans. Untuk QRIS, `qrUrl` adalah
                URL gambar QR yang di-host Midtrans - itulah yang diminta
                simulator sandbox (simulator TIDAK menerima data URI hasil
                render sendiri di halaman invoice). Ditaruh di panel admin,
                bukan halaman invoice publik, karena murni alat uji internal. */}
            {(() => {
              const actions = order.payment?.actions as PaymentActions | null;
              if (!actions) return null;
              const qrUrl = actions.kind === "qris" ? (actions.qrUrl ?? null) : null;
              const deeplink = actions.kind === "ewallet" ? actions.deeplink : null;
              if (!qrUrl && !deeplink) return null;
              return (
                <div className="mt-3 border-t pt-3">
                  <p className="mb-1 text-xs font-medium">Link uji pembayaran</p>
                  <a
                    href={qrUrl ?? deeplink ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs break-all text-primary hover:underline"
                  >
                    {qrUrl ?? deeplink}
                  </a>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {qrUrl
                      ? "Salin URL ini ke simulator QRIS sandbox Midtrans untuk menandai transaksi sebagai terbayar."
                      : "Deeplink aplikasi e-wallet."}
                  </p>
                </div>
              );
            })()}
          </div>

          <div className="rounded-xl ring-1 ring-foreground/10 p-4">
            <h2 className="text-sm font-semibold mb-2">Percobaan Fulfillment</h2>
            {order.fulfillments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada percobaan.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {order.fulfillments.map((f) => {
                  // Diagnosis hanya ditampilkan untuk attempt yang GAGAL - di
                  // attempt sukses/pending, "sebab" tidak punya arti apa pun.
                  const diagnosis = f.status === "FAILED" ? diagnoseFailure(f.message) : null;
                  return (
                    <li key={f.id} className="rounded border p-2">
                      <p>Attempt {f.attemptNo} · {f.provider} ({f.providerSkuCode}) · <Badge variant="muted">{f.status}</Badge></p>
                      <p className="text-xs text-muted-foreground">
                        Ref: <span className="font-mono">{f.ourRefId}</span>
                        {f.providerRef && <> · Provider ref: <span className="font-mono">{f.providerRef}</span></>}
                        {" · "}{formatDateTime(f.createdAt)}
                      </p>
                      {f.sn && <p className="text-xs text-muted-foreground">SN: {f.sn}</p>}
                      {f.message && <p className="text-xs text-muted-foreground">{f.message}</p>}
                      {diagnosis && (
                        <div className="mt-1.5 rounded bg-destructive/10 px-2 py-1.5 text-xs">
                          <p className="font-medium text-destructive">{diagnosis.label}</p>
                          {diagnosis.action && <p className="mt-0.5 text-muted-foreground">{diagnosis.action}</p>}
                        </div>
                      )}
                      {/* Respons MENTAH dari provider. Selama ini sudah tersimpan
                          di kolom rawCallback tapi tidak pernah ditampilkan, jadi
                          satu-satunya cara melihatnya adalah membuka database.
                          Ditutup secara default supaya tidak membanjiri halaman. */}
                      {f.rawCallback ? (
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-xs text-muted-foreground select-none">
                            Respons mentah provider (semua data)
                          </summary>
                          <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                            {JSON.stringify(f.rawCallback, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Belum ada respons mentah — provider belum menjawab, atau panggilan gagal sebelum sempat
                          mendapat respons (cek log runtime).
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Riwayat panggilan API ke provider untuk order ini. Beda dengan
              "Percobaan Fulfillment" di atas: blok itu menampilkan HASIL yang
              berhasil tersimpan ke row fulfillment, sedangkan blok ini menampilkan
              tiap panggilan HTTP apa adanya — termasuk yang timeout atau ditolak
              sebelum sempat menghasilkan row fulfillment sama sekali. */}
          <div className="rounded-xl ring-1 ring-foreground/10 p-4">
            <h2 className="text-sm font-semibold">Riwayat Panggilan API Provider</h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Semua data mentah: request yang dikirim, respons provider apa adanya, status HTTP, dan durasi.
            </p>
            {apiLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada panggilan tercatat untuk order ini. Order lama (sebelum fitur log ini aktif) memang tidak
                punya riwayat — hanya order baru yang terekam.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {apiLogs.map((log) => (
                  <ProviderApiLogEntryCard key={log.id} log={log} />
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl ring-1 ring-foreground/10 p-4">
            <h2 className="text-sm font-semibold mb-2">Riwayat Status</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {order.statusHistory.map((h) => (
                <li key={h.id} className="border-b pb-2 last:border-0">
                  <p>{h.fromStatus ?? "-"} → {h.toStatus} <span className="text-xs text-muted-foreground">({formatDateTime(h.createdAt)})</span></p>
                  {h.note && <p className="text-xs text-muted-foreground">{h.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <OrderActions
            orderId={order.id}
            orderNumber={order.orderNumber}
            status={order.status}
            canRetryRefund={canRetryRefund}
            retryFulfillmentAction={retryFulfillmentAction}
            retryRefundAction={retryRefundAction}
            markCompletedManualAction={markCompletedManualAction}
            markRefundedAction={markRefundedAction}
          />
        </div>
      </div>
    </div>
  );
}
