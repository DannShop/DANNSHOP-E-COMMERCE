import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { getPartnerSession } from "@/lib/partner/session";
import { toPartnerStatus } from "@/lib/partner/response";
import { ResendCallbackButton } from "./resend-button";

export const metadata: Metadata = { title: "Log Callback" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const DATE_FMT = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

// Status akhir sebuah order — hanya untuk inilah callback pernah dijadwalkan.
// Menampilkan order yang masih berjalan di halaman ini cuma membuat mitra
// mengira callback-nya hilang, padahal memang belum waktunya dikirim.
const FINAL_STATUSES = ["COMPLETED", "FAILED", "REFUNDED", "EXPIRED"] as const;

function JobBadge({ status }: { status: string | null }) {
  if (status === null) return <Badge variant="muted">Tidak dijadwalkan</Badge>;
  if (status === "DONE") return <Badge variant="success">Terkirim</Badge>;
  if (status === "FAILED") return <Badge variant="destructive">Gagal</Badge>;
  if (status === "RUNNING") return <Badge variant="warning">Sedang dikirim</Badge>;
  return <Badge variant="warning">Antre</Badge>;
}

export default async function MitraCallbackPage() {
  const partner = await getPartnerSession();
  if (!partner) redirect("/account/mitra");

  const orders = await db.order.findMany({
    where: { partnerId: partner.partnerId, status: { in: [...FINAL_STATUSES] } },
    orderBy: { updatedAt: "desc" },
    take: PAGE_SIZE,
    select: { id: true, orderNumber: true, partnerRefId: true, status: true, updatedAt: true },
  });

  // Job callback dicari HANYA untuk order yang tampil di halaman ini — bukan
  // seluruh riwayat. Payload job berbentuk { orderId }, jadi pencocokannya lewat
  // JSON path; membaca semua job partner-callback lalu menyaring di memori akan
  // ikut menarik milik mitra lain.
  const jobs = orders.length
    ? await db.job.findMany({
        where: {
          type: "partner-callback",
          OR: orders.map((o) => ({ payload: { path: "$.orderId", equals: o.id } })),
        },
        orderBy: { createdAt: "desc" },
        select: { payload: true, status: true, attempts: true, maxAttempts: true, lastError: true, updatedAt: true },
      })
    : [];

  // Percobaan TERBARU per order (jobs sudah terurut desc, jadi yang pertama
  // masuk map adalah yang paling baru).
  const latestJob = new Map<string, (typeof jobs)[number]>();
  for (const job of jobs) {
    const orderId = (job.payload as { orderId?: string } | null)?.orderId;
    if (orderId && !latestJob.has(orderId)) latestJob.set(orderId, job);
  }

  const failedCount = [...latestJob.values()].filter((j) => j.status === "FAILED").length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      {!partner.callbackUrl ? (
        <div className="glass-card flex flex-col gap-2 rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <h2 className="font-heading text-sm font-bold">Kamu belum memasang URL callback</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Tanpa URL callback, kami tidak mengirim apa pun saat transaksimu selesai — kamu harus mengecek statusnya
            sendiri lewat <code className="rounded bg-foreground/10 px-1">POST /api/v1/transaction/status</code>. Itu
            pilihan yang sah, tapi kalau kamu ingin diberi tahu otomatis, pasang URL-nya di{" "}
            <Link href="/mitra/kredensial" className="font-medium text-primary underline-offset-4 hover:underline">
              halaman Kredensial
            </Link>
            .
          </p>
        </div>
      ) : (
        <p className="rounded-xl border-l-2 border-sky-500/50 bg-sky-500/5 p-3 text-xs text-muted-foreground">
          Callback dikirim ke{" "}
          <code className="rounded bg-foreground/10 px-1 font-mono break-all">{partner.callbackUrl}</code>. Kami
          menganggapnya berhasil kalau servermu membalas <strong className="text-foreground">HTTP 2xx</strong>; selain
          itu akan dicoba ulang otomatis beberapa kali dengan jeda yang makin panjang.
          {failedCount > 0 && (
            <>
              {" "}
              <strong className="text-destructive">
                {failedCount} callback di daftar ini kehabisan percobaan.
              </strong>{" "}
              Perbaiki dulu endpoint-mu, baru kirim ulang.
            </>
          )}
        </p>
      )}

      {orders.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Belum ada transaksi yang selesai, jadi belum ada callback yang perlu dikirim.
        </p>
      ) : (
        <div className="glass-card flex flex-col divide-y divide-border/50 overflow-hidden rounded-2xl">
          {orders.map((order) => {
            const job = latestJob.get(order.id);
            return (
              <div key={order.id} className="flex flex-wrap items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs break-all">{order.partnerRefId ?? order.orderNumber}</span>
                    <JobBadge status={job?.status ?? null} />
                    <Badge variant="outline">{toPartnerStatus(order.status)}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {order.orderNumber} · transaksi final {DATE_FMT.format(order.updatedAt)}
                    {job ? ` · percobaan ${job.attempts}/${job.maxAttempts}` : ""}
                  </p>
                  {job?.lastError && (
                    <p className="mt-1.5 rounded bg-destructive/10 px-2 py-1 font-mono text-[11px] break-all text-destructive">
                      {job.lastError}
                    </p>
                  )}
                  {!job && partner.callbackUrl && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Tidak ada job callback untuk transaksi ini — kemungkinan URL callback baru dipasang setelah
                      transaksinya selesai.
                    </p>
                  )}
                </div>
                {partner.callbackUrl && <ResendCallbackButton orderId={order.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
