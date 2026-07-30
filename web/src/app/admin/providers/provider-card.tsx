"use client";

import { useActionState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { ActionResult } from "@/app/actions/providers";

type ServerAction = (formData: FormData) => Promise<ActionResult>;

const INITIAL_STATE: ActionResult = {};

// useActionState butuh action berbentuk (prevState, formData) => state.
// Server action kita cuma nerima (formData) — adapter tipis ini menjembatani
// tanpa mengubah signature action aslinya (yang di-tes langsung oleh Zod test).
//
// Action-action server diterima lewat props dari page.tsx (Server Component),
// bukan di-import langsung di file "use client" ini — actions/providers.ts
// memakai "use server" inline per-fungsi (supaya bisa tetap meng-export Zod
// schema untuk test), dan Next.js melarang inline "use server" di-import
// langsung oleh Client Component; pola resminya justru "pass them down
// through props from a Server Component".
function withPrevState(action: ServerAction) {
  return (_prev: ActionResult, formData: FormData) => action(formData);
}

const healthLabel: Record<string, string> = {
  HEALTHY: "Sehat",
  DEGRADED: "Menurun",
  DOWN: "Bermasalah",
  UNKNOWN: "Belum dicek",
};

const healthVariant: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  HEALTHY: "success",
  DEGRADED: "warning",
  DOWN: "destructive",
  UNKNOWN: "muted",
};

const balanceAlertLabel: Record<string, string> = {
  OK: "Sehat",
  LOW: "Menipis",
};

const balanceAlertVariant: Record<string, "success" | "warning"> = {
  OK: "success",
  LOW: "warning",
};

function ActionMessage({ state }: { state: ActionResult }) {
  if (!state.ok && !state.error) return null;
  return (
    <p
      aria-live="polite"
      className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}
    >
      {state.error ?? state.ok}
    </p>
  );
}

export interface ProviderCardProps {
  providerKey: string;
  displayName: string;
  isActive: boolean;
  hasCredentials: boolean;
  healthStatus: string;
  balanceDisplay: string;
  lastHealthCheckDisplay: string;
  lastSyncDisplay: string;
  minBalanceAlert: string; // "" kalau alert nonaktif, string angka murni (tanpa "Rp"/titik) kalau aktif - untuk default value <input>
  balanceAlertStatus: string; // "OK" | "LOW"
  toggleProviderActive: ServerAction;
  checkProviderBalance: ServerAction;
  syncProviderNow: ServerAction;
  saveDigiflazzCredentials: ServerAction;
  saveBalanceThreshold: ServerAction;
}

export function ProviderCard({
  providerKey,
  displayName,
  isActive,
  hasCredentials,
  healthStatus,
  balanceDisplay,
  lastHealthCheckDisplay,
  lastSyncDisplay,
  minBalanceAlert,
  balanceAlertStatus,
  toggleProviderActive,
  checkProviderBalance,
  syncProviderNow,
  saveDigiflazzCredentials,
  saveBalanceThreshold,
}: ProviderCardProps) {
  const [toggleState, toggleAction, togglePending] = useActionState(
    withPrevState(toggleProviderActive),
    INITIAL_STATE,
  );
  const [balanceState, balanceAction, balancePending] = useActionState(
    withPrevState(checkProviderBalance),
    INITIAL_STATE,
  );
  const [syncState, syncAction, syncPending] = useActionState(
    withPrevState(syncProviderNow),
    INITIAL_STATE,
  );
  const [credState, credAction, credPending] = useActionState(
    withPrevState(saveDigiflazzCredentials),
    INITIAL_STATE,
  );
  const [thresholdState, thresholdAction, thresholdPending] = useActionState(
    withPrevState(saveBalanceThreshold),
    INITIAL_STATE,
  );

  const actionsDisabled = !hasCredentials;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{displayName}</span>
          <Badge variant={isActive ? "success" : "muted"}>{isActive ? "Aktif" : "Nonaktif"}</Badge>
        </CardTitle>
        <CardDescription>
          <span className="font-mono text-xs">{providerKey}</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Health</dt>
          <dd>
            <Badge variant={healthVariant[healthStatus] ?? "muted"}>{healthLabel[healthStatus] ?? healthStatus}</Badge>
          </dd>

          <dt className="text-muted-foreground">Saldo terakhir</dt>
          <dd className="tabular-nums font-medium">{balanceDisplay}</dd>

          <dt className="text-muted-foreground">Cek terakhir</dt>
          <dd>{lastHealthCheckDisplay}</dd>

          <dt className="text-muted-foreground">Sync harga terakhir</dt>
          <dd>{lastSyncDisplay}</dd>
        </dl>

        <form action={thresholdAction} className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${providerKey}-threshold`}>Ambang alert saldo</Label>
            {minBalanceAlert !== "" &&
              (isActive ? (
                <Badge variant={balanceAlertVariant[balanceAlertStatus] ?? "muted"}>
                  {balanceAlertLabel[balanceAlertStatus] ?? balanceAlertStatus}
                </Badge>
              ) : (
                // Provider nonaktif tidak pernah diproses oleh job check-provider-balance
                // (job memfilter isActive: true) - jangan klaim "Sehat"/"Menipis" yang
                // sebenarnya basi/tidak pernah dievaluasi. Tampilkan indikator netral saja.
                <Badge variant="muted">Tidak dipantau</Badge>
              ))}
          </div>
          <input type="hidden" name="key" value={providerKey} />
          <Input
            id={`${providerKey}-threshold`}
            name="minBalanceAlert"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            defaultValue={minBalanceAlert}
            placeholder="Kosongkan untuk nonaktifkan alert"
            aria-describedby={`${providerKey}-threshold-help`}
          />
          <p id={`${providerKey}-threshold-help`} className="text-xs text-muted-foreground">
            Kirim notifikasi Telegram otomatis kalau saldo turun di bawah angka ini.
          </p>
          <Button type="submit" size="sm" variant="outline" disabled={thresholdPending}>
            {thresholdPending ? "Menyimpan..." : "Simpan Ambang Batas"}
          </Button>
          <ActionMessage state={thresholdState} />
        </form>

        {!hasCredentials && (
          <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
            Belum ada kredensial tersimpan — aksi di bawah nonaktif sampai kredensial diisi.
          </p>
        )}

        {providerKey === "DIGIFLAZZ" && (
          <form action={credAction} className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Kredensial Digiflazz</p>
            <div className="space-y-1.5">
              <Label htmlFor="digiflazz-username">Username</Label>
              <Input id="digiflazz-username" name="username" required autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="digiflazz-apiKey">API Key</Label>
              <Input id="digiflazz-apiKey" name="apiKey" type="password" required autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="digiflazz-webhookSecret">Webhook Secret (opsional)</Label>
              <Input id="digiflazz-webhookSecret" name="webhookSecret" type="password" autoComplete="off" />
            </div>
            <Button type="submit" size="sm" disabled={credPending}>
              {credPending ? "Menyimpan..." : "Simpan kredensial"}
            </Button>
            <ActionMessage state={credState} />
          </form>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap items-start gap-2">
        <form action={toggleAction}>
          <input type="hidden" name="key" value={providerKey} />
          <Button
            type="submit"
            size="sm"
            variant={isActive ? "outline" : "default"}
            disabled={togglePending || (!isActive && actionsDisabled)}
          >
            {togglePending ? "Memproses..." : isActive ? "Nonaktifkan" : "Aktifkan"}
          </Button>
          <ActionMessage state={toggleState} />
        </form>

        <form action={balanceAction}>
          <input type="hidden" name="key" value={providerKey} />
          <Button type="submit" size="sm" variant="outline" disabled={balancePending || actionsDisabled}>
            {balancePending ? "Mengecek..." : "Cek Saldo"}
          </Button>
          <ActionMessage state={balanceState} />
        </form>

        <form action={syncAction}>
          <input type="hidden" name="key" value={providerKey} />
          <Button type="submit" size="sm" variant="outline" disabled={syncPending || actionsDisabled}>
            {syncPending ? "Sinkronisasi..." : "Sync Harga Sekarang"}
          </Button>
          <ActionMessage state={syncState} />
        </form>
      </CardFooter>
    </Card>
  );
}
