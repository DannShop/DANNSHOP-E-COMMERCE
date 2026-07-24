import type { ProviderKey } from "@prisma/client";
import { db } from "@/lib/db";
import { getAdapter } from "@/lib/providers/registry";
import type { ProviderSkuPrice } from "@/lib/providers/types";

export interface CurrentSku {
  id: string;
  providerSkuCode: string;
  costPrice: bigint;
  status: "ACTIVE" | "UNAVAILABLE";
}

export interface SkuUpdate {
  id: string;
  costPrice: bigint;
  status: "ACTIVE" | "UNAVAILABLE";
}

// Pure: bandingkan SKU yang kita punya vs price list provider.
// SKU hilang dari price list atau available=false → UNAVAILABLE (spec §5.5).
// Sync tidak pernah MEMBUAT row — mapping dibuat admin.
export function diffPriceList(
  current: CurrentSku[],
  fetched: ProviderSkuPrice[],
): { updates: SkuUpdate[]; missingCount: number } {
  const byCode = new Map(fetched.map((f) => [f.skuCode, f]));
  const updates: SkuUpdate[] = [];
  let missingCount = 0;

  for (const sku of current) {
    const found = byCode.get(sku.providerSkuCode);
    if (!found) {
      missingCount++;
      updates.push({ id: sku.id, costPrice: sku.costPrice, status: "UNAVAILABLE" });
    } else {
      updates.push({
        id: sku.id,
        costPrice: found.costPrice,
        status: found.available ? "ACTIVE" : "UNAVAILABLE",
      });
    }
  }
  return { updates, missingCount };
}

// Orchestrator: dipanggil job handler (cron) dan tombol "Sync sekarang" admin.
// Idempotent — aman dijalankan dobel; setiap run tercatat di PriceSyncLog.
export async function runPriceSync(providerKey: ProviderKey): Promise<{ updated: number; missing: number }> {
  const log = await db.priceSyncLog.create({ data: { provider: providerKey } });
  try {
    const adapter = await getAdapter(providerKey);
    const fetched = await adapter.fetchPriceList();
    const current = await db.providerSku.findMany({
      where: { provider: providerKey },
      select: { id: true, providerSkuCode: true, costPrice: true, status: true },
    });

    const { updates, missingCount } = diffPriceList(current, fetched);
    const now = new Date();
    for (const u of updates) {
      await db.providerSku.update({
        where: { id: u.id },
        data: { costPrice: u.costPrice, status: u.status, lastSyncedAt: now },
      });
    }

    await db.priceSyncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), skusUpdated: updates.length, skusMissing: missingCount, result: "ok" },
    });
    return { updated: updates.length, missing: missingCount };
  } catch (e) {
    await db.priceSyncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), result: "error", error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
