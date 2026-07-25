import type { ProviderKey, ProviderSkuStatus } from "@prisma/client";

export type SelectSkuResult =
  | { ok: true; sku: { provider: ProviderKey; providerSkuCode: string; costPrice: bigint } }
  | { ok: false; reason: "no_provider" | "price_increased" };

export function selectFulfillmentSku(
  item: { sellingPrice: bigint },
  skus: { provider: ProviderKey; providerSkuCode: string; costPrice: bigint; status: ProviderSkuStatus }[],
): SelectSkuResult {
  const digiflazz = skus.find((s) => s.provider === "DIGIFLAZZ" && s.status === "ACTIVE");
  if (!digiflazz) return { ok: false, reason: "no_provider" };
  if (digiflazz.costPrice > item.sellingPrice) return { ok: false, reason: "price_increased" };
  return {
    ok: true,
    sku: { provider: digiflazz.provider, providerSkuCode: digiflazz.providerSkuCode, costPrice: digiflazz.costPrice },
  };
}
