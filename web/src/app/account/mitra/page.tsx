import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock, XCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMembershipContext } from "@/lib/membership/tier";
import QRCode from "qrcode";
import { labelForBusinessType, labelForMonthlyVolume, labelForPlatform } from "@/lib/partner/application";
import { getPartnerPackage } from "@/lib/partner/package";
import { getSnapBrowserConfig } from "@/lib/payment/gateway-config";
import { payPartnerJoinFee } from "@/app/actions/partner-application";
import type { PaymentActions } from "@/lib/midtrans/client";
import { PartnerApplicationForm } from "./application-form";
import { JoinPaymentPanel } from "./join-payment";
import { CancelApplicationButton } from "./cancel-button";

export const metadata: Metadata = { title: "Gabung Mitra" };
export const dynamic = "force-dynamic";

const DATE_FMT = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" });

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-sm font-medium break-words sm:text-right">{value}</span>
    </div>
  );
}

/**
 * Pintu masuk kemitraan H2H — sengaja hidup DI DALAM panel user.
 *
 * Program mitra ini tidak terbuka untuk publik: yang boleh mengajukan hanya
 * member DannShop yang sudah terdaftar. Halaman ini punya empat wajah yang
 * ditentukan status pemohon, bukan empat route terpisah, supaya satu tautan
 * "Mitra" di menu selalu membawa ke tempat yang benar.
 */
export default async function AccountMitraPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [partnerAccount, latestApplication, membership, partnerPackage, methods] = await Promise.all([
    db.partnerAccount.findUnique({ where: { userId }, select: { username: true, isActive: true } }),
    db.partnerApplication.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    getMembershipContext(userId),
    getPartnerPackage(),
    db.paymentMethodConfig.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { code: true, label: true },
    }),
  ]);

  // ===== Wajah 1: sudah jadi mitra =====
  if (partnerAccount) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="glass-card flex flex-col gap-4 rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold">Kamu sudah jadi mitra</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Username partner kamu <span className="font-mono font-medium text-foreground">{partnerAccount.username}</span>
            {!partnerAccount.isActive && " (sedang dinonaktifkan admin)"}. Semua urusan API — kredensial, dokumentasi,
            katalog, riwayat transaksi, dan log callback — ada di portal mitra.
          </p>
          <Link href="/mitra" className={cn(buttonVariants({ size: "lg" }), "self-start")}>
            Buka Portal Mitra <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  // Tagihan biaya join yang masih hidup. Kedaluwarsa dibandingkan di sini
  // (bukan di klien) supaya instruksi bayar tidak pernah tampil untuk tagihan
  // yang sudah mati — nomor VA yang sudah tidak menerima uang jauh lebih buruk
  // daripada tombol bayar yang meminta membuat tagihan baru.
  // `now` dihitung SEKALI di sini, bukan dipanggil di dalam perbandingan:
  // aturan react-hooks/purity menganggap Date.now() di badan komponen tidak
  // murni, dan lint menolaknya. Lihat docs/06-TROUBLESHOOTING-DEPLOY.md §3.8.
  const now = new Date();
  const hasLiveInvoice =
    latestApplication?.joinExpiredAt !== null &&
    latestApplication?.joinExpiredAt !== undefined &&
    latestApplication.joinExpiredAt.getTime() > now.getTime() &&
    latestApplication.joinPaidAt === null &&
    latestApplication.joinTotal !== null;

  const joinActions = hasLiveInvoice
    ? (latestApplication.joinRawResponse as PaymentActions | null)
    : null;
  const qrDataUri =
    joinActions?.kind === "qris" && joinActions.qrString
      ? await QRCode.toDataURL(joinActions.qrString, { width: 240, margin: 1 })
      : null;
  const snapConfig = joinActions?.kind === "snap" ? await getSnapBrowserConfig() : null;

  // ===== Wajah 2: pengajuan sedang ditinjau =====
  if (latestApplication?.status === "PENDING") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="glass-card flex flex-col gap-4 rounded-2xl p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Clock className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold">Pengajuan sedang ditinjau</h2>
            <Badge variant="warning">Menunggu</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Dikirim {DATE_FMT.format(latestApplication.createdAt)}. Kami akan mengabari lewat email atau WhatsApp yang
            kamu cantumkan. Kalau ada data yang keliru, batalkan lalu ajukan ulang.
          </p>

          <div className="rounded-xl border border-border/60 px-4 py-1">
            <Row label="Nama usaha" value={latestApplication.businessName} />
            <Row label="Bentuk usaha" value={labelForBusinessType(latestApplication.businessType)} />
            <Row label="Kota" value={latestApplication.businessCity} />
            <Row label="Penanggung jawab" value={`${latestApplication.picName} — ${latestApplication.picPhone}`} />
            <Row label="Sistem" value={labelForPlatform(latestApplication.platform)} />
            <Row label="Estimasi volume" value={labelForMonthlyVolume(latestApplication.monthlyVolume)} />
            <Row label="IP server" value={latestApplication.serverIps ?? "Belum diisi"} />
            <Row label="URL callback" value={latestApplication.callbackUrl ?? "Belum diisi"} />
          </div>

          <CancelApplicationButton />
        </div>

        {/* Pembayaran biaya join. Muncul hanya kalau pendaftaran sedang dibuka —
            paket yang belum dikonfigurasi admin (isOpen false) tidak boleh
            menawarkan tagihan yang harganya belum ditentukan. */}
        {partnerPackage.isOpen && (
          <JoinPaymentPanel
            joinPrice={partnerPackage.joinPrice}
            pendingTotal={hasLiveInvoice ? latestApplication.joinTotal : null}
            pendingActions={hasLiveInvoice ? joinActions : null}
            qrDataUri={qrDataUri}
            snapConfig={snapConfig}
            methods={methods}
            action={payPartnerJoinFee}
          />
        )}
      </div>
    );
  }

  // ===== Wajah 3 & 4: belum pernah mengajukan, atau pernah ditolak =====
  const rejected = latestApplication?.status === "REJECTED" ? latestApplication : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {rejected && (
        <div className="glass-card flex flex-col gap-2 rounded-2xl border-destructive/30 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <XCircle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
            <h2 className="font-heading text-sm font-bold">Pengajuan sebelumnya ditolak</h2>
            <Badge variant="destructive">Ditolak</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {rejected.reviewNote
              ? `Alasan: ${rejected.reviewNote}`
              : "Tidak ada alasan yang dicantumkan. Hubungi CS kalau butuh penjelasan."}
          </p>
          <p className="text-xs text-muted-foreground">
            Kamu boleh mengajukan lagi dengan data yang sudah diperbaiki lewat form di bawah.
          </p>
        </div>
      )}

      <div className="glass-card flex flex-col gap-3 rounded-2xl p-6">
        <h2 className="font-heading text-base font-bold">Jadi Mitra H2H DannShop</h2>
        <p className="text-sm text-muted-foreground">
          Tarik produk DannShop langsung ke sistem kamu sendiri lewat API. Cocok kalau kamu sudah punya toko online,
          aplikasi H2H, atau bot yang ingin menjual pulsa, top-up game, dan tagihan tanpa mengurus provider satu per satu.
        </p>

        <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <li>• Satu API untuk semua produk, dengan callback otomatis saat transaksi selesai.</li>
          <li>• Bayar dari saldo DannShop yang sama — isi lewat QRIS/VA seperti biasa.</li>
          <li>
            • Harga mengikuti tier akun kamu. Sekarang kamu di{" "}
            <span className="font-medium text-foreground">{membership.tier?.name ?? "Free"}</span>
            {membership.tier ? "" : " — ambil paket reseller untuk harga yang lebih baik"}.{" "}
            <Link href="/account/reseller" className="font-medium text-primary underline-offset-4 hover:underline">
              Lihat tier
            </Link>
          </li>
        </ul>

        <p className="rounded-xl border border-border/60 bg-foreground/[0.03] px-4 py-3 text-xs text-muted-foreground">
          Program mitra hanya terbuka untuk member DannShop yang sudah terdaftar — dan kamu sudah termasuk. Pengajuan
          ditinjau manual oleh admin, biasanya dalam 1×24 jam kerja.
        </p>
      </div>

      <div className="glass-card rounded-2xl p-6">
        <PartnerApplicationForm defaultPicName={session.user.name ?? ""} />
      </div>
    </div>
  );
}
