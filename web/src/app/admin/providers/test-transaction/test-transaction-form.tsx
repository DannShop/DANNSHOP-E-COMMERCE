"use client";

import { useActionState, useState } from "react";
import { TriangleAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { ActionResult } from "@/app/actions/providers";

type TestTrxResult = { refId: string; status: string; sn: string | null; message: string };
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

export function TestTransactionForm({ sendTestTransaction }: { sendTestTransaction: ServerAction }) {
  const [testing, setTesting] = useState(true);
  const [state, formAction, pending] = useActionState(withPrevState(sendTestTransaction), INITIAL_STATE);

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
          <Input id="skuCode" name="skuCode" placeholder="mis. Aybt69" required autoComplete="off" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="target">Nomor tujuan</Label>
          <Input id="target" name="target" placeholder="mis. 081234567890" required autoComplete="off" />
        </div>

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

      {state.result && (
        <div aria-live="polite" className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Hasil transaksi tes</p>
            <Badge variant={statusVariant[state.result.status] ?? "muted"}>
              {statusLabel[state.result.status] ?? state.result.status}
            </Badge>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Ref ID</dt>
            <dd className="font-mono text-xs">{state.result.refId}</dd>
            <dt className="text-muted-foreground">SN</dt>
            <dd className="font-mono text-xs">{state.result.sn ?? "-"}</dd>
            <dt className="text-muted-foreground">Pesan</dt>
            <dd>{state.result.message}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
