"use client";

import { useActionState, useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiah } from "@/lib/format";
import { labelForBusinessType, labelForMonthlyVolume, labelForPlatform } from "@/lib/partner/application";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export interface ApplicationRow {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  businessName: string;
  businessType: string;
  businessCity: string;
  websiteUrl: string | null;
  picName: string;
  picPhone: string;
  picRole: string | null;
  platform: string | null;
  serverIps: string | null;
  callbackUrl: string | null;
  monthlyVolume: string;
  notes: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  suggestedUsername: string;
  // Konteks akun pemohon — dibaca admin untuk menilai pengajuan tanpa harus
  // membuka Kontrol User di tab lain.
  userName: string;
  userEmail: string;
  userBanned: boolean;
  balance: number;
  tierName: string | null;
  orderCount: number;
  memberSince: string;
  partnerUsername: string | null;
}

const DATE_FMT = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
const fmt = (iso: string) => DATE_FMT.format(new Date(iso));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-sm break-words">{children}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: ApplicationRow["status"] }) {
  if (status === "PENDING") return <Badge variant="warning">Menunggu</Badge>;
  if (status === "APPROVED") return <Badge variant="success">Disetujui</Badge>;
  return <Badge variant="destructive">Ditolak</Badge>;
}

/**
 * Panel keputusan. Approve dan reject punya form terpisah (bukan satu form
 * dengan dua tombol submit) karena keduanya memvalidasi field yang berbeda:
 * approve butuh username yang sah, reject butuh alasan yang layak dibaca
 * pemohon. Satu form berarti salah satunya harus divalidasi setengah hati.
 */
function ReviewPanel({
  row,
  approveAction,
  rejectAction,
}: {
  row: ApplicationRow;
  approveAction: (formData: FormData) => Promise<ActionResult>;
  rejectAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const [mode, setMode] = useState<"none" | "approve" | "reject">("none");
  const [approveState, approveFormAction, approving] = useActionState(
    (_prev: ActionResult, formData: FormData) => approveAction(formData),
    INITIAL_STATE,
  );
  const [rejectState, rejectFormAction, rejecting] = useActionState(
    (_prev: ActionResult, formData: FormData) => rejectAction(formData),
    INITIAL_STATE,
  );

  const state = approveState.ok || approveState.error ? approveState : rejectState;
  const busy = approving || rejecting;
  const done = Boolean(approveState.ok || rejectState.ok);

  if (done) {
    return <p className="text-xs text-emerald-700 dark:text-emerald-400">{approveState.ok ?? rejectState.ok}</p>;
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
      {mode === "none" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setMode("approve")} disabled={row.userBanned}>
            <Check className="size-4" aria-hidden="true" /> Setujui
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setMode("reject")}>
            <X className="size-4" aria-hidden="true" /> Tolak
          </Button>
          {row.userBanned && (
            <span className="self-center text-xs text-destructive">
              Akun pemohon sedang ditangguhkan — cabut ban dulu sebelum bisa disetujui.
            </span>
          )}
        </div>
      )}

      {mode === "approve" && (
        <form action={approveFormAction} className="flex flex-col gap-2">
          <input type="hidden" name="applicationId" value={row.id} />
          <Label htmlFor={`username-${row.id}`}>Username partner</Label>
          <Input
            id={`username-${row.id}`}
            name="username"
            defaultValue={row.suggestedUsername}
            required
            minLength={3}
            maxLength={40}
            pattern="[a-zA-Z0-9_-]+"
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            Masuk ke dalam rumus signature <code className="rounded bg-foreground/10 px-1">md5(username+apiKey+ref_id)</code>{" "}
            dan <strong>tidak bisa diubah</strong> tanpa mematikan integrasi mitra. Huruf, angka, garis bawah, strip.
          </p>
          <p className="text-xs text-muted-foreground">
            API key & secret callback terbit otomatis dan langsung terlihat oleh mitra di portalnya — kamu tidak perlu
            menyalin apa pun.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {approving ? "Menyetujui..." : "Konfirmasi Setujui"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("none")} disabled={busy}>
              Batal
            </Button>
          </div>
        </form>
      )}

      {mode === "reject" && (
        <form action={rejectFormAction} className="flex flex-col gap-2">
          <input type="hidden" name="applicationId" value={row.id} />
          <Label htmlFor={`note-${row.id}`}>Alasan penolakan</Label>
          <Textarea id={`note-${row.id}`} name="reviewNote" rows={3} required minLength={10} maxLength={500} disabled={busy} />
          <p className="text-xs text-muted-foreground">
            Ditampilkan apa adanya ke pemohon di halaman Mitra mereka — tulis sebagai pesan untuk orang luar, bukan
            catatan internal.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="destructive" disabled={busy}>
              {rejecting ? "Menolak..." : "Konfirmasi Tolak"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("none")} disabled={busy}>
              Batal
            </Button>
          </div>
        </form>
      )}

      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}

export function PartnershipClient({
  applications,
  approveAction,
  rejectAction,
}: {
  applications: ApplicationRow[];
  approveAction: (formData: FormData) => Promise<ActionResult>;
  rejectAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const [tab, setTab] = useState<"PENDING" | "ALL">("PENDING");
  const pending = applications.filter((a) => a.status === "PENDING");
  const shown = tab === "PENDING" ? pending : applications;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["PENDING", `Menunggu (${pending.length})`],
            ["ALL", `Semua (${applications.length})`],
          ] as const
        ).map(([value, label]) => (
          <Button key={value} size="sm" variant={tab === value ? "default" : "outline"} onClick={() => setTab(value)}>
            {label}
          </Button>
        ))}
      </div>

      {shown.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {tab === "PENDING" ? "Tidak ada pengajuan yang menunggu ditinjau." : "Belum ada pengajuan mitra sama sekali."}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {shown.map((row) => (
          <article key={row.id} className="flex flex-col gap-3 rounded-xl border border-border/70 p-4">
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{row.businessName}</h2>
                  <StatusBadge status={row.status} />
                  {row.userBanned && <Badge variant="destructive">Akun ditangguhkan</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {labelForBusinessType(row.businessType)} · {row.businessCity} · diajukan {fmt(row.createdAt)}
                </p>
              </div>
              {row.partnerUsername && (
                <Badge variant="outline">
                  username: <span className="font-mono">{row.partnerUsername}</span>
                </Badge>
              )}
            </header>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Penanggung jawab">
                {row.picName}
                {row.picRole ? ` (${row.picRole})` : ""} — {row.picPhone}
              </Field>
              <Field label="Akun DannShop">
                {row.userName} · {row.userEmail}
              </Field>
              <Field label="Website">
                {row.websiteUrl ? (
                  <a
                    href={row.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                  >
                    {row.websiteUrl} <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Sistem yang dipakai">{labelForPlatform(row.platform)}</Field>
              <Field label="Estimasi volume">{labelForMonthlyVolume(row.monthlyVolume)}</Field>
              <Field label="IP server">
                {row.serverIps ? <span className="font-mono text-xs">{row.serverIps}</span> : "Tidak dibatasi"}
              </Field>
              <Field label="URL callback">
                {row.callbackUrl ? <span className="font-mono text-xs break-all">{row.callbackUrl}</span> : "Polling sendiri"}
              </Field>
              {/* Riwayat sebagai member adalah sinyal terbaik yang kita punya untuk
                  menilai pengajuan: akun yang sudah lama, punya saldo, dan pernah
                  bertransaksi jelas berbeda dari akun yang dibuat kemarin. */}
              <Field label="Riwayat member">
                {row.orderCount} order · saldo {formatRupiah(row.balance)} · gabung {fmt(row.memberSince)}
              </Field>
              <Field label="Tier saat ini">
                {row.tierName ?? "Free — harga API sama dengan harga retail"}
              </Field>
            </div>

            {row.notes && (
              <div className="rounded-lg bg-foreground/[0.04] p-3">
                <span className="text-[11px] text-muted-foreground">Catatan pemohon</span>
                <p className="text-sm whitespace-pre-wrap">{row.notes}</p>
              </div>
            )}

            {row.status === "PENDING" ? (
              <ReviewPanel row={row} approveAction={approveAction} rejectAction={rejectAction} />
            ) : (
              <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
                Ditinjau {row.reviewedAt ? fmt(row.reviewedAt) : "—"}
                {row.reviewNote ? ` · alasan: ${row.reviewNote}` : ""}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
