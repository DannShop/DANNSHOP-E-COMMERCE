import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, BookText, CheckCircle2, KeyRound, PlusCircle } from "lucide-react";
import { db } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMembershipContext } from "@/lib/membership/tier";
import { getPartnerSession } from "@/lib/partner/session";
import { toPartnerStatus } from "@/lib/partner/response";

export const metadata: Metadata = { title: "Portal Mitra" };
export const dynamic = "force-dynamic";

const DATE_FMT = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass-card flex flex-col gap-0.5 rounded-2xl p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-heading text-xl font-bold tabular-nums">{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

/**
 * Beranda portal mitra.
 *
 * Isinya dipilih untuk menjawab satu pertanyaan yang dibawa mitra setiap kali
 * mereka membuka halaman ini: "integrasi saya sehat atau tidak?". Karena itu
 * yang paling menonjol bukan grafik penjualan, melainkan daftar hal yang bisa
 * membuat panggilan berikutnya gagal — saldo menipis, callback yang mati, dan
 * akun yang dinonaktifkan.
 */
export default async function MitraHomePage() {
  const partner = await getPartnerSession();
  if (!partner) redirect("/account/mitra");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [wallet, membership, todayCount, successToday, recent, failedJobs] = await Promise.all([
    db.wallet.findUnique({ where: { userId: partner.userId }, select: { balance: true } }),
    getMembershipContext(partner.userId),
    db.order.count({ where: { partnerId: partner.partnerId, createdAt: { gte: startOfToday } } }),
    db.order.count({
      where: { partnerId: partner.partnerId, createdAt: { gte: startOfToday }, status: "COMPLETED" },
    }),
    db.order.findMany({
      where: { partnerId: partner.partnerId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        partnerRefId: true,
        itemName: true,
        productName: true,
        status: true,
        sellingPrice: true,
        createdAt: true,
      },
    }),
    // Callback yang benar-benar menyerah (bukan yang masih antre) — inilah yang
    // berarti mitra sedang kehilangan pemberitahuan tanpa menyadarinya.
    //
    // Tabel Job tidak punya kolom partnerId (payload-nya cuma { orderId }), jadi
    // kepemilikannya diperiksa lewat order-nya di langkah berikutnya. Menghitung
    // langsung di sini akan menghitung kegagalan SELURUH mitra dan memberi mitra
    // ini peringatan tentang masalah orang lain.
    db.job.findMany({
      where: { type: "partner-callback", status: "FAILED" },
      select: { payload: true },
      take: 200,
    }),
  ]);

  const failedOrderIds = failedJobs
    .map((j) => (j.payload as { orderId?: string } | null)?.orderId)
    .filter((id): id is string => typeof id === "string");
  const failedCallbacks = failedOrderIds.length
    ? await db.order.count({ where: { id: { in: failedOrderIds }, partnerId: partner.partnerId } })
    : 0;

  const balance = Number(wallet?.balance ?? 0n);
  const neverUsed = partner.lastUsedAt === null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      {!partner.isActive && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-destructive">Akun mitra kamu sedang dinonaktifkan</p>
            <p className="text-xs text-muted-foreground">
              Semua panggilan ke <code className="rounded bg-foreground/10 px-1">/api/v1/*</code> akan ditolak{" "}
              <code className="rounded bg-foreground/10 px-1">rc 10</code>. Riwayat di bawah tetap bisa kamu baca.
              Hubungi CS untuk mengaktifkannya kembali.
            </p>
          </div>
        </div>
      )}

      {neverUsed && partner.isActive && (
        <div className="glass-card flex flex-col gap-3 rounded-2xl p-5">
          <h2 className="font-heading text-base font-bold">Selamat datang — tiga langkah untuk mulai</h2>
          <ol className="ml-5 flex list-decimal flex-col gap-1.5 text-sm text-muted-foreground">
            <li>
              Ambil <strong className="text-foreground">API key</strong> kamu di halaman Kredensial, lalu daftarkan IP
              server kamu di sana.
            </li>
            <li>
              Baca <strong className="text-foreground">Dokumentasi</strong> — contohnya sudah terisi username kamu, jadi
              bisa langsung disalin.
            </li>
            <li>
              Isi saldo, lalu uji dengan <code className="rounded bg-foreground/10 px-1">POST /api/v1/cek-saldo</code>{" "}
              sebelum transaksi pertama.
            </li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Link href="/mitra/kredensial" className={cn(buttonVariants({ size: "sm" }))}>
              <KeyRound className="size-4" aria-hidden="true" /> Kredensial
            </Link>
            <Link href="/mitra/dokumentasi" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
              <BookText className="size-4" aria-hidden="true" /> Dokumentasi
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Saldo"
          value={formatRupiah(balance)}
          hint={balance === 0 ? "Kosong — transaksi akan ditolak rc 20" : undefined}
        />
        <Stat label="Transaksi hari ini" value={String(todayCount)} hint={`${successToday} sukses`} />
        <Stat
          label="Tier harga"
          value={membership.tier?.name ?? "Free"}
          hint={membership.tier ? `Diskon ${(membership.discountBp / 100).toFixed(2)}%` : "Harga sama dengan retail"}
        />
        <Stat
          label="Panggilan API terakhir"
          value={partner.lastUsedAt ? DATE_FMT.format(partner.lastUsedAt) : "Belum pernah"}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* ===== Status integrasi ===== */}
        <section className="glass-card flex flex-col gap-3 rounded-2xl p-5">
          <h2 className="font-heading text-sm font-bold">Status Integrasi</h2>

          <div className="flex flex-col gap-2.5 text-sm">
            <div className="flex items-start gap-2">
              {partner.ipWhitelist ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="font-medium">Whitelist IP</p>
                <p className="text-xs text-muted-foreground">
                  {partner.ipWhitelist ?? "Kosong — semua IP boleh memanggil. Kunci ke IP servermu kalau bisa."}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              {partner.callbackUrl ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="font-medium">Callback</p>
                <p className="text-xs break-all text-muted-foreground">
                  {partner.callbackUrl ?? "Belum dipasang — kamu harus cek status transaksi sendiri."}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              {partner.hasCallbackSecret ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="font-medium">Tanda tangan callback</p>
                <p className="text-xs text-muted-foreground">
                  {partner.hasCallbackSecret
                    ? "Aktif — verifikasi header X-DannShop-Signature di sisimu."
                    : "Belum ada secret. Callback dikirim tanpa tanda tangan."}
                </p>
              </div>
            </div>
          </div>

          <Link
            href="/mitra/kredensial"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Atur konfigurasi →
          </Link>
        </section>

        {/* ===== Transaksi terakhir ===== */}
        <section className="glass-card flex flex-col gap-3 rounded-2xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-sm font-bold">Transaksi Terakhir</h2>
            <Link href="/mitra/transaksi" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
              Lihat semua
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              Belum ada transaksi lewat API.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/50">
              {recent.map((o) => {
                const status = toPartnerStatus(o.status);
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {o.productName} <span className="text-muted-foreground">· {o.itemName}</span>
                      </p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {o.partnerRefId ?? o.orderNumber} · {DATE_FMT.format(o.createdAt)}
                      </p>
                    </div>
                    <span className="text-sm tabular-nums">{formatRupiah(Number(o.sellingPrice))}</span>
                    <Badge
                      variant={status === "Sukses" ? "success" : status === "Gagal" ? "destructive" : "warning"}
                    >
                      {status}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {balance === 0 && (
        <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5">
          <div>
            <p className="text-sm font-semibold">Saldo kamu kosong</p>
            <p className="text-xs text-muted-foreground">
              Transaksi lewat API akan langsung ditolak <code className="rounded bg-foreground/10 px-1">rc 20</code>{" "}
              selama saldo tidak cukup. Isi saldo lewat QRIS/VA seperti biasa.
            </p>
          </div>
          <Link href="/account/deposit" className={cn(buttonVariants({ size: "lg" }))}>
            <PlusCircle className="size-4" aria-hidden="true" /> Isi Saldo <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      )}

      {failedCallbacks > 0 && partner.callbackUrl && (
        <Link
          href="/mitra/callback"
          className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm transition-colors hover:bg-amber-500/10"
        >
          <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span className="min-w-0 flex-1">Ada callback yang gagal terkirim. Cek log callback untuk melihat sebabnya.</span>
          <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
