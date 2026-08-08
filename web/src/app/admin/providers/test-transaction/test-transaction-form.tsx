"use client";

import { useActionState, useState } from "react";
import { TriangleAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { ActionResult } from "@/app/actions/providers";

type TestTrxResult = {
  refId: string;
  status: string;
  sn: string | null;
  message: string;
  // Hanya ada di hasil pengiriman awal, bukan di hasil cek status - dipakai untuk
  // mengirim ulang request identik saat mengecek status.
  skuCode?: string;
  target?: string;
  testing?: boolean;
};
type TestTrxState = ActionResult & { result?: TestTrxResult };
type ServerAction = (formData: FormData) => Promise<TestTrxState>;

const INITIAL_STATE: TestTrxState = {};

// Adapter useActionState (prevState, formData) => state di atas server action
// (formData) => state — pola sama dengan provider-card.tsx (Task 9). Action
// diterima lewat props dari page.tsx (Server Component) karena "use server"
// di providers.ts dipasang inline per-fungsi, bukan di level file.
function withPrevState(action: ServerAction) {
  return (_prev: TestTrxState, formData: FormData) => action(formData);
}

const statusLabel: Record<string, string> = {
  success: "Sukses",
  pending: "Pending",
  failed: "Gagal",
};

const statusVariant: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  success: "success",
  pending: "warning",
  failed: "destructive",
};

export function TestTransactionForm({
  sendTestTransaction,
  checkTestTransactionStatus,
}: {
  sendTestTransaction: ServerAction;
  checkTestTransactionStatus: ServerAction;
}) {
  const [testing, setTesting] = useState(true);
  const [state, formAction, pending] = useActionState(withPrevState(sendTestTransaction), INITIAL_STATE);
  const [checkState, checkAction, checkPending] = useActionState(
    withPrevState(checkTestTransactionStatus),
    INITIAL_STATE,
  );
  // Hasil pengecekan LEBIH BARU daripada balasan awal, jadi dia yang ditampilkan
  // begitu ada. Balasan awal Digiflazz hampir selalu "Pending" - kalau yang lama
  // tetap dipajang, halaman ini terus bilang "Diproses" walau transaksinya sudah
  // sukses, persis kebingungan yang bikin fitur ini ditambahkan.
  const shown = checkState.result ?? state.result;

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="space-y-4"
        onSubmit={(e) => {
          if (!testing && !window.confirm(
            "Mode testing MATI — transaksi ini akan NYATA dan memotong saldo Digiflazz sungguhan. Lanjutkan?",
          )) {
            e.preventDefault();
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="skuCode">Kode SKU</Label>
          <Input
            id="skuCode"
            name="skuCode"
            placeholder={testing ? "xld10" : "mis. Aybt69 (SKU asli dari price list)"}
            required
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="target">Nomor tujuan</Label>
          <Input
            id="target"
            name="target"
            placeholder={testing ? "087800001230" : "mis. 081234567890"}
            required
            autoComplete="off"
          />
        </div>

        {testing && (
          <div className="rounded-md border bg-muted px-2.5 py-2 text-xs text-muted-foreground">
            <p>
              Mode testing Digiflazz <strong>cuma mengenali SKU dummy <code className="font-mono">xld10</code></strong> —
              SKU produk asli (mis. dari price list kamu) akan ditolak, biasanya dengan pesan{" "}
              <em>&quot;Signature Anda salah&quot;</em> yang membingungkan karena sebabnya sebenarnya bukan
              signature.
            </p>
            <p className="mt-1">
              Pakai kombinasi ini untuk simulasi (nol biaya):
            </p>
            <ul className="mt-0.5 list-disc pl-4">
              <li><code className="font-mono">087800001230</code> → sukses</li>
              <li><code className="font-mono">087800001232</code> → gagal</li>
              <li><code className="font-mono">087800001233</code> → pending, lalu callback sukses</li>
            </ul>
            <p className="mt-1">
              Untuk menguji SKU produk yang sebenarnya (mis. memverifikasi relay/whitelist IP), matikan mode testing —
              itu jadi transaksi <strong>nyata</strong> yang memotong saldo Digiflazz sungguhan.
            </p>
          </div>
        )}

        <div className="flex items-start gap-2">
          <Checkbox
            id="testing"
            name="testing"
            checked={testing}
            onCheckedChange={setTesting}
          />
          <div className="grid gap-0.5 leading-none">
            <Label htmlFor="testing">Mode testing</Label>
            <p className="text-xs text-muted-foreground">
              Transaksi simulasi Digiflazz — tidak memotong saldo.
            </p>
          </div>
        </div>

        {testing ? (
          <div className="flex items-center gap-1.5 rounded-md border bg-muted px-2.5 py-1.5">
            <ShieldCheck className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">
              Mode testing aktif — aman, transaksi disimulasikan oleh Digiflazz.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-md border-2 border-destructive bg-destructive/20 px-2.5 py-1.5">
            <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            <span className="text-xs font-bold text-destructive">
              Mode testing MATI — transaksi NYATA, memotong saldo Digiflazz sungguhan.
            </span>
          </div>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Mengirim..." : "Kirim transaksi tes"}
        </Button>
      </form>

      {state.error && (
        <p aria-live="polite" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      {checkState.error && (
        <p aria-live="polite" className="text-sm text-destructive">
          {checkState.error}
        </p>
      )}

      {shown && (
        <div aria-live="polite" className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {checkState.result ? "Status terkini" : "Hasil transaksi tes"}
            </p>
            <Badge variant={statusVariant[shown.status] ?? "muted"}>
              {statusLabel[shown.status] ?? shown.status}
            </Badge>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Ref ID</dt>
            <dd className="font-mono text-xs">{shown.refId}</dd>
            <dt className="text-muted-foreground">SN</dt>
            <dd className="font-mono text-xs">{shown.sn ?? "-"}</dd>
            <dt className="text-muted-foreground">Pesan</dt>
            <dd>{shown.message}</dd>
          </dl>

          {shown.status === "pending" && (
            <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
              <strong>&quot;Diproses&quot; itu WAJAR di balasan pertama.</strong> Digiflazz hampir selalu menjawab
              Pending secara langsung, lalu mengirim hasil finalnya belakangan lewat callback. Klik{" "}
              <em>Cek Status Sekarang</em> untuk menanyakan status terkini — aman diulang berkali-kali karena
              Digiflazz idempotent by ref_id (tidak akan membuat transaksi kedua).
            </p>
          )}

          {/* Nilai form dikirim ulang lewat hidden input: cek status Digiflazz =
              mengirim ulang request transaksi yang sama persis (SKU + tujuan +
              ref_id), bukan sekadar menanyakan ref_id saja. */}
          <form action={checkAction} className="pt-1">
            <input type="hidden" name="refId" value={shown.refId} />
            <input type="hidden" name="skuCode" value={state.result?.skuCode ?? ""} />
            <input type="hidden" name="target" value={state.result?.target ?? ""} />
            <input type="hidden" name="testing" value={String(state.result?.testing ?? false)} />
            <Button type="submit" size="sm" variant="outline" disabled={checkPending}>
              {checkPending ? "Mengecek..." : "Cek Status Sekarang"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
