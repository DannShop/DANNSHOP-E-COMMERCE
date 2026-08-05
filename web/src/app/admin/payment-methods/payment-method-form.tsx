"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function PaymentMethodForm({
  method,
  action,
  uploadLogo,
}: {
  method: {
    id: string;
    code: string;
    label: string;
    logoUrl: string | null;
    feeFlat: string;
    feePercent: number;
    sortOrder: number;
    isActive: boolean;
  };
  action: (formData: FormData) => Promise<ActionResult>;
  uploadLogo: (formData: FormData) => Promise<{ url?: string; error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [logoUrl, setLogoUrl] = useState(method.logoUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("code", method.code);
      const result = await uploadLogo(fd);
      if (result.error) {
        setUploadError(result.error);
      } else if (result.url) {
        setLogoUrl(result.url);
      }
    } catch {
      setUploadError("Gagal upload file, coba lagi.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-7 sm:items-end">
      <input type="hidden" name="id" value={method.id} />
      <div className="col-span-2 sm:col-span-1">
        <Label className="text-xs text-muted-foreground">{method.code}</Label>
        <Input name="label" defaultValue={method.label} required />
      </div>
      <div className="col-span-2 sm:col-span-2">
        <Label htmlFor={`logoUrl-${method.id}`} className="text-xs">Logo (URL atau upload file)</Label>
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded border bg-muted/50">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview arbitrary admin-provided URL, tanpa domain whitelist
              <img
                src={logoUrl}
                alt=""
                className="size-full rounded object-contain"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
                onLoad={(e) => {
                  e.currentTarget.style.visibility = "visible";
                }}
              />
            ) : null}
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Input
              id={`logoUrl-${method.id}`}
              name="logoUrl"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="/payment-logos/bca.svg"
            />
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleFileChange}
              disabled={uploading}
              className="text-xs"
            />
            {uploading && <p className="text-xs text-muted-foreground">Mengunggah...</p>}
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
          </div>
        </div>
      </div>
      <div>
        <Label htmlFor={`feeFlat-${method.id}`} className="text-xs">Fee flat (Rp)</Label>
        <Input id={`feeFlat-${method.id}`} name="feeFlat" type="number" min={0} defaultValue={method.feeFlat} />
      </div>
      <div>
        <Label htmlFor={`feePercent-${method.id}`} className="text-xs">Fee (basis point)</Label>
        <Input id={`feePercent-${method.id}`} name="feePercent" type="number" min={0} defaultValue={method.feePercent} />
      </div>
      <div>
        <Label htmlFor={`sortOrder-${method.id}`} className="text-xs">Urutan</Label>
        <Input id={`sortOrder-${method.id}`} name="sortOrder" type="number" defaultValue={method.sortOrder} />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox name="isActive" defaultChecked={method.isActive} />
        <span className="text-sm">Aktif</span>
        <Button type="submit" size="sm" disabled={pending} className="ml-auto">
          {pending ? "..." : "Simpan"}
        </Button>
      </div>
      {(state.ok || state.error) && (
        <p className={`col-span-full text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
