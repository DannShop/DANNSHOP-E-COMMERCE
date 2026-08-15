import type { ProviderKey } from "@prisma/client";
import { db } from "@/lib/db";
import { getAdapter } from "@/lib/providers/registry";
import { recalcSellingPrice } from "@/lib/catalog/auto-margin";
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

/**
 * Ciutkan baris berkode SAMA jadi satu. Wajib dijalankan atas SETIAP price list
 * provider sebelum menyentuh database.
 *
 * KENAPA ADA — ini bukan pencegahan teoretis. Price list OkeConnect (8.153 baris)
 * memuat tiga kode yang muncul dua kali: LISTONLY, CEKHONLY, BYRHONLY, masing-masing
 * terdaftar sekali di bawah produk "Indosat Only 4U Baru" dan sekali di bawah
 * "Indosat Only 4U Nonaktif". Bagi mereka itu wajar (satu kode, dua kelompok
 * tampilan); bagi kita fatal, karena ProviderPriceListCache punya
 * @@unique([provider, skuCode]) — createMany atas daftar mentah menabrak unique
 * constraint, SELURUH $transaction di runPriceSync rollback, dan sync harga gagal
 * setiap kali tanpa kecuali. Digiflazz tidak pernah memicunya karena
 * buyer_sku_code mereka unik, jadi bug ini tidur sampai provider kedua masuk.
 *
 * Ditaruh di sini, bukan di adapter OkeConnect, karena yang dilanggar adalah
 * batasan MILIK KITA (unique index tabel cache) — berlaku untuk provider mana pun
 * yang menyusul, bukan cuma yang kebetulan ketahuan hari ini.
 *
 * DUA ATURAN PEMILIHAN, dan keduanya sengaja condong ke sisi yang aman:
 *
 *  - costPrice: ambil yang TERTINGGI. Guard anti-jual-rugi di selectFulfillmentSku
 *    membandingkan modal dengan harga jual; meremehkan modal membuat guard itu
 *    meloloskan SKU yang dijual di bawah modal.
 *  - available: hanya true kalau SEMUA kembarannya tersedia. Sikap yang sama
 *    dengan okeconnect-parse.ts — menahan diri masih bisa diperbaiki, salah
 *    memutuskan tidak. Menandai ACTIVE padahal salah satu varian mati berarti
 *    order diarahkan ke SKU yang dijamin gagal.
 *
 * Sifat lain yang dijaga: costPrice & available TIDAK bergantung urutan baris dari
 * provider (urutan itu bisa berubah kapan saja tanpa pemberitahuan). Kalau harganya
 * seri, deskripsi baris pertama yang dipakai — pilihan sembarang yang disengaja,
 * karena yang seri cuma teksnya dan tidak ada satu pun keputusan uang bergantung
 * padanya. Urutan kemunculan pertama dipertahankan supaya diff antar-sync enak dibaca.
 */
export function dedupePriceList(fetched: ProviderSkuPrice[]): ProviderSkuPrice[] {
  const byCode = new Map<string, ProviderSkuPrice>();
  for (const row of fetched) {
    const seen = byCode.get(row.skuCode);
    if (!seen) {
      byCode.set(row.skuCode, row);
      continue;
    }
    byCode.set(row.skuCode, {
      // Baris pemenang menyumbang deskripsinya (nama/kategori/brand) supaya isi
      // cache tetap konsisten dengan harga yang dipakai, bukan campuran dua baris.
      ...(row.costPrice > seen.costPrice ? row : seen),
      costPrice: row.costPrice > seen.costPrice ? row.costPrice : seen.costPrice,
      available: seen.available && row.available,
    });
  }
  return [...byCode.values()];
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

interface PriceMove {
  productItemId: string;
  newSelling: bigint;
  logRow: {
    productItemId: string;
    productName: string;
    itemName: string;
    oldSelling: bigint;
    newSelling: bigint;
    oldCost: bigint;
    newCost: bigint;
    source: string;
    note: string | null;
  };
}

/**
 * Susun daftar harga jual yang perlu bergeser karena modalnya berubah.
 *
 * Hanya bagian IO-nya yang ada di sini; SELURUH keputusan angkanya ada di
 * recalcSellingPrice() yang murni dan sudah dikunci tes (termasuk ketiga
 * penjaganya: lonjakan modal tak wajar, jangan sampai jual rugi, jangan rusak
 * flash sale).
 *
 * Item yang kategorinya masih OFF tidak pernah sampai ke sini — disaring di
 * query, bukan di memori, supaya sync pada katalog besar tidak menarik ribuan
 * baris yang sudah pasti tidak dipakai.
 */
async function planAutoMarginMoves(
  current: { id: string; costPrice: bigint; productItemId: string }[],
  updates: SkuUpdate[],
): Promise<PriceMove[]> {
  const oldCostBySkuId = new Map(current.map((c) => [c.id, c.costPrice]));
  const itemIdBySkuId = new Map(current.map((c) => [c.id, c.productItemId]));

  const affected = updates
    .map((u) => ({
      productItemId: itemIdBySkuId.get(u.id),
      oldCost: oldCostBySkuId.get(u.id),
      newCost: u.costPrice,
    }))
    .filter((a): a is { productItemId: string; oldCost: bigint; newCost: bigint } => Boolean(a.productItemId));
  if (affected.length === 0) return [];

  const items = await db.productItem.findMany({
    where: {
      id: { in: affected.map((a) => a.productItemId) },
      product: { category: { autoMarginMode: { not: "OFF" } } },
    },
    select: {
      id: true,
      name: true,
      sellingPrice: true,
      flashPrice: true,
      product: {
        select: {
          name: true,
          category: {
            select: { autoMarginMode: true, autoMarginBp: true, autoMarginRound: true, autoMarginMaxJumpBp: true },
          },
        },
      },
    },
  });
  const itemById = new Map(items.map((i) => [i.id, i]));

  const moves: PriceMove[] = [];
  for (const a of affected) {
    const item = itemById.get(a.productItemId);
    if (!item) continue; // kategorinya OFF

    const cat = item.product.category;
    const result = recalcSellingPrice(
      {
        mode: cat.autoMarginMode,
        marginBp: cat.autoMarginBp,
        roundTo: cat.autoMarginRound,
        maxJumpBp: cat.autoMarginMaxJumpBp,
      },
      {
        oldCost: a.oldCost,
        newCost: a.newCost,
        currentSelling: item.sellingPrice,
        flashPrice: item.flashPrice,
      },
    );
    if (result.action !== "update") continue;

    moves.push({
      productItemId: item.id,
      newSelling: result.newSelling,
      logRow: {
        productItemId: item.id,
        productName: item.product.name,
        itemName: item.name,
        oldSelling: item.sellingPrice,
        newSelling: result.newSelling,
        oldCost: a.oldCost,
        newCost: a.newCost,
        source: "auto-margin",
        note: `${cat.autoMarginMode}, bulat ke ${cat.autoMarginRound}`,
      },
    });
  }
  return moves;
}

// Orchestrator: dipanggil job handler (cron) dan tombol "Sync sekarang" admin.
// Idempotent — aman dijalankan dobel; setiap run tercatat di PriceSyncLog.
export async function runPriceSync(
  providerKey: ProviderKey,
): Promise<{ updated: number; missing: number; duplicates: number; repriced: number }> {
  const log = await db.priceSyncLog.create({ data: { provider: providerKey } });
  try {
    const adapter = await getAdapter(providerKey);
    const raw = await adapter.fetchPriceList();
    // Dijalankan SEBELUM apa pun menyentuh DB. Lihat dedupePriceList: daftar mentah
    // OkeConnect memuat kode ganda, dan unique index tabel cache akan me-rollback
    // seluruh transaksi di bawah kalau daftar itu diteruskan apa adanya.
    const fetched = dedupePriceList(raw);
    const duplicates = raw.length - fetched.length;
    const current = await db.providerSku.findMany({
      where: { provider: providerKey },
      // productItemId ikut diambil: margin otomatis butuh tahu item mana yang
      // harganya terpengaruh oleh tiap perubahan modal.
      select: { id: true, providerSkuCode: true, costPrice: true, status: true, productItemId: true },
    });

    const { updates, missingCount } = diffPriceList(current, fetched);
    const priceMoves = await planAutoMarginMoves(current, updates);
    const now = new Date();

    // SATU transaksi untuk modal DAN harga jual — ini wajib, bukan kerapian.
    //
    // Mode FOLLOW_DELTA menghitung pergeseran dari selisih antara costPrice yang
    // TERSIMPAN dan yang baru datang. Kalau modal sempat tertulis sementara
    // penyesuaian harganya gagal, sync berikutnya akan melihat modal lama = modal
    // baru dan menyimpulkan tidak ada yang perlu diikuti — pergeserannya hilang
    // PERMANEN, tanpa satu pun error yang menandainya.
    await db.$transaction([
      ...updates.map((u) =>
        db.providerSku.update({
          where: { id: u.id },
          data: { costPrice: u.costPrice, status: u.status, lastSyncedAt: now },
        })
      ),
      ...priceMoves.map((m) =>
        db.productItem.update({ where: { id: m.productItemId }, data: { sellingPrice: m.newSelling } }),
      ),
      ...(priceMoves.length > 0
        ? [db.priceChangeLog.createMany({ data: priceMoves.map((m) => ({ ...m.logRow, createdAt: now })) })]
        : []),
      db.providerPriceListCache.deleteMany({ where: { provider: providerKey } }),
      db.providerPriceListCache.createMany({
        data: fetched.map((f) => ({
          provider: providerKey,
          skuCode: f.skuCode,
          productName: f.productName,
          brand: f.brand,
          costPrice: f.costPrice,
          available: f.available,
          syncedAt: now,
        })),
      }),
    ]);

    await db.priceSyncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), skusUpdated: updates.length, skusMissing: missingCount, result: "ok" },
    });
    return { updated: updates.length, missing: missingCount, duplicates, repriced: priceMoves.length };
  } catch (e) {
    await db.priceSyncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), result: "error", error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
