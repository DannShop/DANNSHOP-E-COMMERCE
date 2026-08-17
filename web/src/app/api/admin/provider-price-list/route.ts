import { NextResponse } from "next/server";
import type { ProviderKey } from "@prisma/client";
import { requireAdminSession } from "@/lib/auth/admin-gate";
import { db } from "@/lib/db";
import { selectBrandsWithinBudget } from "@/lib/catalog/bulk-import";

// Berapa baris yang boleh pulang dalam sekali cari.
//
// Dulu nilainya 50 dan dipakai sebagai `take` polos. Itu terlalu kecil untuk
// OkeConnect (5.571 baris / 471 brand: "tsel" saja mengembalikan 962 baris) DAN
// dilakukan tanpa memberi tahu bahwa ada sisa — dua masalah berbeda yang keduanya
// diperbaiki di bawah: batasnya dinaikkan, dan jumlah sebenarnya selalu ikut
// dikirim supaya layar bisa mengatakan "menampilkan 120 dari 962".
const FLAT_LIMIT = 120;

// Anggaran baris untuk mode brand-utuh. Lebih longgar dari FLAT_LIMIT karena satu
// brand saja bisa berisi 114 denominasi dan brand tidak boleh dipotong.
const BRAND_ROW_BUDGET = 300;

// Sumber data untuk sku-picker.tsx dan bulk-import-picker.tsx — admin-only. Baca
// dari ProviderPriceListCache (diisi tombol "Sync Harga"/job cron lewat
// runPriceSync), BUKAN live ke API provider tiap ketikan — price list Digiflazz
// punya rate limit ketat (rc 83) yang langsung kena kalau di-hit per keystroke.
//
// DUA MODE, sengaja dibedakan karena dua pemanggilnya butuh bentuk yang berbeda:
//
//  - Default (flat): daftar baris apa adanya. Dipakai sku-picker.tsx, yang mencari
//    SATU SKU untuk dipetakan ke satu item — di situ brand tidak relevan.
//  - `groupByBrand=1`: hanya brand UTUH. Dipakai bulk-import-picker.tsx, yang
//    mengimpor per brand; brand setengah di sana berarti produk yang diam-diam
//    kekurangan denominasi (lihat selectBrandsWithinBudget).
export async function GET(request: Request) {
  // Gerbang bersama - lihat lib/auth/admin-gate.ts. Termasuk cek ulang ke DB,
  // karena JWT di sini stateless dan sesi yang haknya sudah dicabut tetap
  // membawa role lama sampai tokennya kedaluwarsa.
  const admin = await requireAdminSession("payments.manage");
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: 403 });
  }
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") as ProviderKey | null;
  const q = url.searchParams.get("q") ?? "";
  const groupByBrand = url.searchParams.get("groupByBrand") === "1";
  if (!provider) return NextResponse.json({ error: "provider wajib" }, { status: 400 });

  const where = {
    provider,
    ...(q
      ? {
          OR: [
            { productName: { contains: q } },
            { brand: { contains: q } },
            { skuCode: { contains: q } },
          ],
        }
      : {}),
  };

  try {
    if (groupByBrand) {
      // Langkah 1: brand apa saja yang cocok, dan masing-masing berapa baris.
      const buckets = await db.providerPriceListCache.groupBy({
        by: ["brand"],
        where,
        _count: { _all: true },
        orderBy: { brand: "asc" },
      });
      if (buckets.length === 0) {
        // syncedAt tetap dijawab supaya layar bisa membedakan "provider ini belum
        // pernah di-sync" dari "sudah di-sync tapi kata kuncinya tidak ketemu" —
        // dua keadaan dengan tindakan yang sama sekali berbeda.
        const any = await db.providerPriceListCache.findFirst({ where: { provider }, select: { syncedAt: true } });
        return NextResponse.json(
          { rows: [], brandsShown: 0, brandsTotal: 0, rowsTotal: 0, syncedAt: any?.syncedAt ?? null },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      // Langkah 2: potong per BRAND, tidak pernah per baris.
      const chosen = selectBrandsWithinBudget(
        buckets.map((b) => ({ brand: b.brand, rowCount: b._count._all })),
        BRAND_ROW_BUDGET,
      );
      const chosenNames = chosen.map((c) => c.brand);

      // Langkah 3: tarik SELURUH baris milik brand terpilih. Tidak ada `take` di
      // sini dengan sengaja — `take` di titik ini akan mengembalikan lagi brand
      // setengah yang justru sedang dicegah.
      const cached = await db.providerPriceListCache.findMany({
        where: { ...where, brand: { in: chosenNames } },
        orderBy: [{ brand: "asc" }, { costPrice: "asc" }],
      });

      return NextResponse.json(
        {
          rows: cached.map(serializeRow),
          brandsShown: chosen.length,
          brandsTotal: buckets.length,
          rowsTotal: buckets.reduce((sum, b) => sum + b._count._all, 0),
          syncedAt: cached[0]?.syncedAt ?? null,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    // Mode flat — bentuk respons lama, ditambah rowsTotal supaya pemotongan tidak
    // lagi senyap.
    const [cached, rowsTotal] = await Promise.all([
      db.providerPriceListCache.findMany({ where, orderBy: { productName: "asc" }, take: FLAT_LIMIT }),
      db.providerPriceListCache.count({ where }),
    ]);
    return NextResponse.json(
      { rows: cached.map(serializeRow), rowsTotal, syncedAt: cached[0]?.syncedAt ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("GET provider-price-list: gagal ambil price list dari cache", { provider, error: e });
    return NextResponse.json({ error: "Gagal ambil price list, coba lagi." }, { status: 502 });
  }
}

// costPrice di-string-kan: BigInt tidak bisa lewat JSON.stringify.
function serializeRow(r: {
  skuCode: string;
  productName: string;
  brand: string;
  costPrice: bigint;
  available: boolean;
}) {
  return {
    skuCode: r.skuCode,
    productName: r.productName,
    brand: r.brand,
    costPrice: r.costPrice.toString(),
    available: r.available,
  };
}
