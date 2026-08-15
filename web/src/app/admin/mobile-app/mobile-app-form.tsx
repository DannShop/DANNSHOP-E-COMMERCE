"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PwaIconField } from "./pwa-icon-field";
import {
  SHORT_NAME_MAX,
  resolveAppNames,
  type PwaAppKind,
  type PwaIconSet,
  type PwaSettings,
} from "@/lib/pwa/config";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

/** Kotak warna + kolom teks hex yang saling mengikuti. */
function ColorField({
  id,
  label,
  help,
  value,
  onChange,
  name,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
  name: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-8 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-1"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="w-32 font-mono"
          aria-label={`${label} (hex)`}
        />
      </div>
      <input type="hidden" name={name} value={value} />
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}

function AppSection({
  kind,
  heading,
  description,
  app,
  brandName,
  backgroundColor,
  uploadIcon,
  onUploadingChange,
}: {
  kind: PwaAppKind;
  heading: string;
  description: string;
  app: { name: string; shortName: string; icon: PwaIconSet | null };
  brandName: string;
  backgroundColor: string;
  uploadIcon: (formData: FormData) => Promise<{ icon?: PwaIconSet; error?: string }>;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const [name, setName] = useState(app.name);
  const [shortName, setShortName] = useState(app.shortName);
  const [icon, setIcon] = useState<PwaIconSet | null>(app.icon);

  // Pratinjau nama memakai fungsi yang SAMA dengan yang menyusun manifest, jadi
  // yang tampil di sini tidak bisa berbeda dari yang benar-benar dipasang.
  const preview = resolveAppNames({ name, shortName, icon }, kind, brandName);

  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-sm font-semibold">{heading}</h2>
      <p className="mt-1 mb-4 text-xs text-muted-foreground">{description}</p>

      <div className="space-y-4">
        <PwaIconField
          kind={kind}
          label="Ikon aplikasi"
          value={icon}
          onChange={setIcon}
          backgroundColor={backgroundColor}
          upload={uploadIcon}
          onUploadingChange={onUploadingChange}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${kind}-name`}>Nama aplikasi</Label>
            <Input
              id={`${kind}-name`}
              name={`${kind}.name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder={preview.name}
            />
            <p className="text-xs text-muted-foreground">
              Tampil di layar pemasangan. Kosongkan untuk ikut nama brand di Invoice &amp; Struk.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${kind}-short`}>Nama pendek</Label>
            <Input
              id={`${kind}-short`}
              name={`${kind}.shortName`}
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              maxLength={SHORT_NAME_MAX}
              placeholder={preview.shortName}
            />
            <p className="text-xs text-muted-foreground">
              Label di bawah ikon home screen. Maksimal {SHORT_NAME_MAX} karakter — lebih dari itu
              dipotong sendiri oleh HP.
            </p>
          </div>
        </div>

        <p className="rounded-lg bg-foreground/[0.04] px-3 py-2 text-xs text-muted-foreground">
          Yang akan terpasang: <strong className="font-semibold text-foreground">{preview.name}</strong>,
          dengan label <strong className="font-semibold text-foreground">{preview.shortName}</strong> di
          bawah ikonnya.
        </p>
      </div>
    </div>
  );
}

export function MobileAppForm({
  initial,
  brandName,
  action,
  uploadIcon,
}: {
  initial: PwaSettings;
  brandName: string;
  action: (formData: FormData) => Promise<ActionResult>;
  uploadIcon: (formData: FormData) => Promise<{ icon?: PwaIconSet; error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [themeColor, setThemeColor] = useState(initial.themeColor);
  const [backgroundColor, setBackgroundColor] = useState(initial.backgroundColor);
  const [uploading, setUploading] = useState(false);

  return (
    <form action={formAction} className="space-y-6">
      <AppSection
        kind="toko"
        heading="Aplikasi Toko"
        description="Dipasang pembeli. Dibuka langsung ke halaman depan toko."
        app={initial.toko}
        brandName={brandName}
        backgroundColor={backgroundColor}
        uploadIcon={uploadIcon}
        onUploadingChange={setUploading}
      />

      <AppSection
        kind="admin"
        heading="Aplikasi Admin"
        description="Dipasang kamu sendiri. Dibuka langsung ke panel admin, tanpa lewat halaman toko."
        app={initial.admin}
        brandName={brandName}
        backgroundColor={backgroundColor}
        uploadIcon={uploadIcon}
        onUploadingChange={setUploading}
      />

      <div className="rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Warna</h2>
        <p className="mt-1 mb-4 text-xs text-muted-foreground">
          Berlaku untuk kedua aplikasi. Warna latar juga yang dicat di belakang logo saat ikon
          dibuat — ganti warnanya dulu sebelum mengunggah ikon.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            id="pwa-theme-color"
            name="themeColor"
            label="Warna tema"
            help="Warna bilah status saat app berjalan tanpa bilah alamat browser."
            value={themeColor}
            onChange={setThemeColor}
          />
          <ColorField
            id="pwa-background-color"
            name="backgroundColor"
            label="Warna latar"
            help="Layar pembuka sesaat sebelum app selesai dimuat, dan latar di belakang logo ikon."
            value={backgroundColor}
            onChange={setBackgroundColor}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending || uploading}>
          {pending ? "Menyimpan..." : "Simpan Pengaturan Aplikasi"}
        </Button>
        {uploading && <span className="text-xs text-muted-foreground">Menunggu unggahan ikon selesai...</span>}
      </div>

      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
