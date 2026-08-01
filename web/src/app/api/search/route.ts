import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/catalog/public";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const results = await searchProducts(q);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
