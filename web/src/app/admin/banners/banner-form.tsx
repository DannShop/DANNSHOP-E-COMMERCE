"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { MAX_DIMENSION } from "@/lib/image-processing";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function BannerForm({
  banner,
  updateAction,
  deleteAction,
  uploadBannerImage,
}: {
  banner: {
    id: string;
    imageUrl: string;
    imageUrlDesktop: string | null;
    linkUrl: string | null;
    sortOrder: number;
    isActive: boolean;
  };
  updateAction: (formData: FormData) => Promise<ActionResult>;
  deleteAction: (formData: FormData) => Promise<ActionResult>;
  uploadBannerImage: (formData: FormData) => Promise<{ url?: string; error?: string }>;
}) {
  const [updateState, updateFormAction, updatePending] = useActionState(
    (_prev: ActionResult, formData: FormData) => updateAction(formData),
    INITIAL_STATE,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    (_prev: ActionResult, formData: FormData) => deleteAction(formData),
    INITIAL_STATE,
  );
  const [imageUrl, setImageUrl] = useState(banner.imageUrl);
  const [imageUrlDesktop, setImageUrlDesktop] = useState(banner.imageUrlDesktop ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadingDesktop, setUploadingDesktop] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <form action={updateFormAction} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={banner.id} />
        <input type="hidden" name="imageUrl" value={imageUrl} />
        <input type="hidden" name="imageUrlDesktop" value={imageUrlDesktop} />

        <ImageUploadField
          id={`imageFile-${banner.id}`}
          label="Gambar — HP (21:9)"
          value={imageUrl}
          onChange={setImageUrl}
          upload={uploadBannerImage}
          aspect={21 / 9}
          maxDimension={MAX_DIMENSION.heroBanner}
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          helpText="Disarankan 1920×823px. Tampil utuh di HP."
          previewClassName="aspect-21/9 w-40 rounded-md"
          onUploadingChange={setUploading}
        />

        <ImageUploadField
          id={`imageFileDesktop-${banner.id}`}
          label="Gambar — Desktop (32:9, opsional)"
          value={imageUrlDesktop}
          onChange={setImageUrlDesktop}
          upload={uploadBannerImage}
          aspect={32 / 9}
          maxDimension={MAX_DIMENSION.heroBanner}
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          helpText="Disarankan 1920×540px. Kosong = desktop pakai gambar HP dan terpotong atas-bawah."
          previewClassName="aspect-32/9 w-40 rounded-md"
          onUploadingChange={setUploadingDesktop}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
          <div className="col-span-2">
            <Label htmlFor={`linkUrl-${banner.id}`} className="text-xs">Link Tujuan</Label>
            <Input id={`linkUrl-${banner.id}`} name="linkUrl" defaultValue={banner.linkUrl ?? ""} placeholder="https://..." />
          </div>
          <div>
            <Label htmlFor={`sortOrder-${banner.id}`} className="text-xs">Urutan</Label>
            <Input id={`sortOrder-${banner.id}`} name="sortOrder" type="number" defaultValue={banner.sortOrder} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox name="isActive" defaultChecked={banner.isActive} />
            <span className="text-sm">Aktif</span>
          </div>
        </div>

        <Button
          type="submit"
          size="sm"
          disabled={updatePending || uploading || uploadingDesktop || !imageUrl}
          className="self-start"
        >
          {updatePending ? "..." : "Simpan"}
        </Button>
      </form>

      <form
        action={deleteFormAction}
        onSubmit={(e) => {
          if (!window.confirm("Hapus banner ini? Aksi ini tidak bisa dibatalkan.")) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={banner.id} />
        <Button type="submit" size="sm" variant="outline" disabled={deletePending}>
          {deletePending ? "..." : "Hapus"}
        </Button>
      </form>

      {(updateState.ok || updateState.error) && (
        <p className={`text-xs ${updateState.error ? "text-destructive" : "text-emerald-700"}`}>
          {updateState.error ?? updateState.ok}
        </p>
      )}
      {(deleteState.ok || deleteState.error) && (
        <p className={`text-xs ${deleteState.error ? "text-destructive" : "text-emerald-700"}`}>
          {deleteState.error ?? deleteState.ok}
        </p>
      )}
    </div>
  );
}
