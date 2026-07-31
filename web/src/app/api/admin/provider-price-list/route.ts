import { NextResponse } from "next/server";
import type { ProviderKey } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Sumber data untuk sku-picker.tsx — admin-only. Baca dari ProviderPriceListCache
// (diisi tombol "Sync Harga"/job cron lewat runPriceSync), BUKAN live ke API
// provider tiap ketikan — price list Digiflazz punya rate limit ketat (rc 83)
// yang langsung kena kalau di-hit per keystroke pencarian.
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }
  const fresh = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, updatedAt: true } });
  if (!fresh || fresh.role !== "ADMIN" || fresh.updatedAt.getTime() !== session.user.updatedAt) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") as ProviderKey | null;
  const q = url.searchParams.get("q") ?? "";
  if (!provider) return NextResponse.json({ error: "provider wajib" }, { status: 400 });

  try {
    const cached = await db.providerPriceListCache.findMany({
      where: {
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
      },
      orderBy: { productName: "asc" },
      take: 50,
    });
    const rows = cached.map((r) => ({
      skuCode: r.skuCode,
      productName: r.productName,
      brand: r.brand,
      costPrice: r.costPrice.toString(),
      available: r.available,
    }));
    return NextResponse.json(
      { rows, syncedAt: cached[0]?.syncedAt ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("GET provider-price-list: gagal ambil price list dari cache", { provider, error: e });
    return NextResponse.json({ error: "Gagal ambil price list, coba lagi." }, { status: 502 });
  }
}
