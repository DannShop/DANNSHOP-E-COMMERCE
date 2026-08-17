"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PwaIconField } from "./pwa-icon-field";
import { PwaSplashField } from "./pwa-splash-field";
import {
  SHORT_NAME_MAX,
  resolveAppNames,
  resolveIcon,
  type PwaAppKind,
  type PwaAppSettings,
  type PwaIconSet,
  type PwaImage,
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
  uploadIcon,
  uploadSplash,
  onUploadingChange,
}: {
  kind: PwaAppKind;
  heading: string;
  description: string;
  app: PwaAppSettings;
  brandName: string;
  uploadIcon: (formData: FormData) => Promise<{ icon?: PwaIconSet; error?: string }>;
  uploadSplash: (formData: FormData) => Promise<{ image?: PwaImage; error?: string }>;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const [name, setName] = useState(app.name);
  const [shortName, setShortName] = useState(app.shortName);
  const [icon, setIcon] = useState<PwaIconSet | null>(app.icon);
  const [themeColor, setThemeColor] = useState(app.themeColor);
  const [backgroundColor, setBackgroundColor] = useState(app.backgroundColor);
  const [portrait, setPortrait] = useState<PwaImage | null>(app.splash.portrait);
  const [landscape, setLandscape] = useState<PwaImage | null>(app.splash.landscape);

  // Pratinjau nama memakai fungsi yang SAMA dengan yang menyusun manifest, jadi
  // yang tampil di sini tidak bisa berbeda dari yang benar-benar dipasang.
  const preview = resolveAppNames({ name, shortName }, kind, brandName);
  const logoUrl = resolveIcon({ icon }, kind).any;

  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-sm font-semibold">{heading}</h2>
      <p className="mt-1 mb-4 text-xs text-muted-foreground">{description}</p>

      <div className="space-y-5">
        <PwaIconField
          kind={kind}
          label="Ikon aplikasi"
          value={icon}
          onChange={setIcon}
          backgroundColor={backgroundColor}
          onBackgroundColorChange={setBackgroundColor}
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

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <ColorField
            id={`${kind}-theme-color`}
            name={`${kind}.themeColor`}
            label="Warna tema"
            help="Warna bilah status saat app berjalan tanpa bilah alamat browser."
            value={themeColor}
            onChange={setThemeColor}
          />
          <ColorField
            id={`${kind}-background-color`}
            name={`${kind}.backgroundColor`}
            label="Warna latar"
            help="Layar pembuka Android, dan latar yang dicat di belakang logo saat ikon dibuat — ganti warnanya dulu sebelum mengunggah ikon."
            value={backgroundColor}
            onChange={setBackgroundColor}
          />
        </div>

        <div className="space-y-4 border-t pt-4">
          <div>
            <h3 className="text-sm font-semibold">Layar pembuka</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Yang tampil beberapa saat setelah app dibuka. Kosongkan untuk dirakit otomatis dari
              warna latar + logo di atas. Taruh bagian penting di TENGAH gambar: layar HP dan tablet
              punya perbandingan sisi yang berbeda-beda, jadi tepinya bisa terpotong.
            </p>
          </div>

          <PwaSplashField
            kind={kind}
            orientation="portrait"
            label="Gambar layar pembuka (potret)"
            help="Disarankan 1080×1920 atau lebih besar. Dipakai juga untuk lanskap kalau gambar lanskap tidak diisi."
            value={portrait}
            onChange={setPortrait}
            backgroundColor={backgroundColor}
            upload={uploadSplash}
            onUploadingChange={onUploadingChange}
          />

          {portrait && (
            <PwaSplashField
              kind={kind}
              orientation="landscape"
              label="Gambar layar pembuka (lanskap) — opsional"
              help="Hanya perlu kalau app sering dibuka sambil HP/tablet dimiringkan. Disarankan 1920×1080."
              value={landscape}
              onChange={setLandscape}
              backgroundColor={backgroundColor}
              upload={uploadSplash}
              onUploadingChange={onUploadingChange}
            />
          )}

          {/* Pratinjau memakai bahan yang sama persis dengan yang dipakai layar
              pembuka sungguhan: gambar kalau ada, kalau tidak warna latar +
              logo. Kalau keduanya bisa berbeda, admin akan menyetel yang ini
              sampai terlihat benar lalu mendapat hasil yang lain di HP. */}
          <div className="flex items-center gap-4">
            <div
              className="relative h-40 w-[5.6rem] shrink-0 overflow-hidden rounded-xl bg-cover bg-center ring-1 ring-foreground/10"
              style={{
                backgroundColor,
                backgroundImage: portrait ? `url(${JSON.stringify(portrait.url)})` : undefined,
              }}
            >
              {!portrait && (
                // 42% sisi terpendek, angka yang sama dipakai autoLogoSize().
                // eslint-disable-next-line @next/next/no-img-element -- URL blob arbitrer milik admin, tanpa domain whitelist
                <img
                  src={logoUrl}
                  alt=""
                  className="absolute top-1/2 left-1/2 w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-[22%]"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Pratinjau layar pembuka {portrait ? "dari gambar yang diunggah" : "otomatis"}.
              <br />
              Di Android, layar bawaan sistem tetap muncul sesaat sebelum ini — itu dirakit sendiri
              oleh HP dari warna latar &amp; ikon, dan tidak bisa diganti gambar.
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
  uploadSplash,
}: {
  initial: PwaSettings;
  brandName: string;
  action: (formData: FormData) => Promise<ActionResult>;
  uploadIcon: (formData: FormData) => Promise<{ icon?: PwaIconSet; error?: string }>;
  uploadSplash: (formData: FormData) => Promise<{ image?: PwaImage; error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [uploading, setUploading] = useState(false);

  return (
    <form action={formAction} className="space-y-6">
      <AppSection
        kind="toko"
        heading="Aplikasi Toko"
        description="Dipasang pembeli. Dibuka langsung ke halaman depan toko."
        app={initial.toko}
        brandName={brandName}
        uploadIcon={uploadIcon}
        uploadSplash={uploadSplash}
        onUploadingChange={setUploading}
      />

      <AppSection
        kind="admin"
        heading="Aplikasi Admin"
        description="Dipasang kamu sendiri. Dibuka langsung ke panel admin, tanpa lewat halaman toko."
        app={initial.admin}
        brandName={brandName}
        uploadIcon={uploadIcon}
        uploadSplash={uploadSplash}
        onUploadingChange={setUploading}
      />

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending || uploading}>
          {pending ? "Menyimpan..." : "Simpan Pengaturan Aplikasi"}
        </Button>
        {uploading && <span className="text-xs text-muted-foreground">Menunggu unggahan selesai...</span>}
      </div>

      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
