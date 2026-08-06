import { db } from "@/lib/db";
import {
  saveDigiflazzCredentials,
  toggleProviderActive,
  checkProviderBalance,
  syncProviderNow,
  saveBalanceThreshold,
} from "@/app/actions/providers";
import { ProviderCard } from "./provider-card";

function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "Belum pernah";
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function formatRupiah(balance: bigint): string {
  return `Rp ${Number(balance).toLocaleString("id-ID")}`;
}

function formatSync(log: {
  startedAt: Date;
  finishedAt: Date | null;
  skusUpdated: number;
  skusMissing: number;
  result: string | null;
} | null): string {
  if (!log) return "Belum pernah sync";
  if (!log.finishedAt) return `Sedang berjalan (mulai ${formatDateTime(log.startedAt)})`;
  const status = log.result === "ok" ? "Sukses" : "Gagal";
  return `${status} • ${log.skusUpdated} diupdate, ${log.skusMissing} hilang • ${formatDateTime(log.finishedAt)}`;
}

export default async function AdminProvidersPage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const providers = await db.providerConfig.findMany({ orderBy: { priority: "asc" } });

  const lastSyncs = await Promise.all(
    providers.map((p) =>
      db.priceSyncLog.findFirst({
        where: { provider: p.key },
        orderBy: { startedAt: "desc" },
      }),
    ),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Providers</h1>
        <p className="text-sm text-muted-foreground">
          Kelola kredensial, status aktif, saldo, dan sinkronisasi harga tiap provider topup.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {providers.map((provider, i) => (
          <ProviderCard
            key={provider.key}
            providerKey={provider.key}
            appUrl={appUrl}
            displayName={provider.displayName}
            isActive={provider.isActive}
            hasCredentials={provider.credentials != null}
            healthStatus={provider.healthStatus}
            balanceDisplay={formatRupiah(provider.balance)}
            lastHealthCheckDisplay={formatDateTime(provider.lastHealthCheckAt)}
            lastSyncDisplay={formatSync(lastSyncs[i])}
            minBalanceAlert={provider.minBalanceAlert?.toString() ?? ""}
            balanceAlertStatus={provider.balanceAlertStatus}
            toggleProviderActive={toggleProviderActive}
            checkProviderBalance={checkProviderBalance}
            syncProviderNow={syncProviderNow}
            saveDigiflazzCredentials={saveDigiflazzCredentials}
            saveBalanceThreshold={saveBalanceThreshold}
          />
        ))}
      </div>
    </div>
  );
}
