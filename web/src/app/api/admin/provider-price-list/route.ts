import { NextResponse } from "next/server";
import type { ProviderKey } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getAdapter } from "@/lib/providers/registry";

// Sumber data untuk sku-picker.tsx — admin-only, tidak pernah membocorkan
// kredensial provider (adapter dibuat lewat getAdapter yang men-decrypt
// kredensial di server; hanya baris price list yang dikembalikan ke client).
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
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
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal ambil price list" }, { status: 502 });
  }
}
