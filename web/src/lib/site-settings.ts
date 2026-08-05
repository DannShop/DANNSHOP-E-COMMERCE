import { db } from "@/lib/db";

export interface SiteSettings {
  logoUrl: string | null;
  logoType: "image" | "video";
  trendingMode: "manual" | "auto";
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const rows = await db.siteSetting.findMany({
    where: { key: { in: ["logo_url", "logo_type", "trending_mode"] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    logoUrl: map.get("logo_url") ?? null,
    logoType: map.get("logo_type") === "video" ? "video" : "image",
    trendingMode: map.get("trending_mode") === "auto" ? "auto" : "manual",
  };
}
