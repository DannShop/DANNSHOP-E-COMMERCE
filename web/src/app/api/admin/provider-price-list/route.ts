import { NextResponse } from "next/server";
import type { ProviderKey } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAdapter } from "@/lib/providers/registry";

// Sumber data untuk sku-picker.tsx — admin-only, tidak pernah membocorkan
// kredensial provider (adapter dibuat lewat getAdapter yang men-decrypt
// kredensial di server; hanya baris price list yang dikembalikan ke client).
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
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  if (!provider) return NextResponse.json({ error: "provider wajib" }, { status: 400 });

  try {
    const adapter = await getAdapter(provider);
    const rows = (await adapter.fetchPriceList())
      .filter((r) => !q || r.productName.toLowerCase().includes(q) || r.brand.toLowerCase().includes(q) || r.skuCode.toLowerCase().includes(q))
      .slice(0, 50)
      .map((r) => ({ ...r, costPrice: r.costPrice.toString() }));
    return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("GET provider-price-list: gagal ambil price list", { provider, error: e });
    return NextResponse.json({ error: "Gagal ambil price list, coba lagi." }, { status: 502 });
  }
}
