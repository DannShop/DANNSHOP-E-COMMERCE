import { db } from "@/lib/db";
import { createBanner, updateBanner, deleteBanner, uploadBannerImage } from "@/app/actions/banners";
import { BannerForm } from "./banner-form";
import { NewBannerForm } from "./new-banner-form";

export default async function BannersPage() {
  const banners = await db.banner.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Banner</h1>
        <p className="text-sm text-muted-foreground">
          Banner carousel di halaman utama. Kalau tidak ada banner aktif, section carousel tidak ditampilkan.
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Tambah Banner</h2>
        <NewBannerForm action={createBanner} uploadBannerImage={uploadBannerImage} />
      </div>

      <div className="space-y-3">
        {banners.map((b) => (
          <BannerForm
            key={b.id}
            banner={{ id: b.id, imageUrl: b.imageUrl, linkUrl: b.linkUrl, sortOrder: b.sortOrder, isActive: b.isActive }}
            updateAction={updateBanner}
            deleteAction={deleteBanner}
          />
        ))}
        {banners.length === 0 && <p className="text-sm text-muted-foreground">Belum ada banner.</p>}
      </div>
    </div>
  );
}
