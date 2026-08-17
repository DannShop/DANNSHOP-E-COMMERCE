"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AndroidApkInfo, PwaAppKind } from "@/lib/pwa/config";
import type { ActionResult } from "@/app/actions/pwa";

/**
 * Unggah berkas APK Android untuk satu app.
 *
 * APK-nya sendiri TIDAK dibangun di sini - ia dibuat di komputer lewat
 * Bubblewrap (docs/12-BUILD-APP-ANDROID-TWA.md), lalu diunggah ke sini supaya
 * bisa dibagikan tanpa Play Store.
 */
export function ApkField({
  kind,
  value,
  upload,
  remove,
}: {
  kind: PwaAppKind;
  value: AndroidApkInfo | null;
  upload: (formData: FormData) => Promise<ActionResult>;
  remove: (formData: FormData) => Promise<ActionResult>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [copied, setCopied] = useState(false);

  const label = kind === "admin" ? "Admin" : "Toko";

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg({ error: "Pilih berkas APK dulu." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("apk", file);
    fd.set("version", version);
    setMsg(await upload(fd));
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleRemove() {
    setBusy(true);
    const fd = new FormData();
    fd.set("kind", kind);
    setMsg(await remove(fd));
    setBusy(false);
  }

  async function copyUrl() {
    if (!value) return;
    await navigator.clipboard.writeText(value.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const sizeMb = value && value.sizeBytes > 0 ? (value.sizeBytes / (1024 * 1024)).toFixed(1) : null;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-semibold">Berkas APK {label}</h3>
        <p className="text-xs text-muted-foreground">
          {kind === "admin"
            ? "Aplikasi Android untuk kamu & karyawan. Jangan dibagikan ke pembeli."
            : "Aplikasi Android untuk pembeli. Tombol unduhnya muncul di halaman Akun Saya, hanya di HP Android."}
        </p>
      </div>

      {value ? (
        <div className="space-y-2 rounded-md bg-muted/40 p-3">
          <p className="text-xs">
            <span className="font-medium">Terunggah</span>
            {value.version && <> · versi {value.version}</>}
            {sizeMb && <> · {sizeMb} MB</>}
            {value.uploadedAt && (
              <> · {new Date(value.uploadedAt).toLocaleDateString("id-ID")}</>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={value.url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded border bg-background px-2 py-1 font-mono text-[11px]"
            />
            <Button type="button" variant="outline" size="xs" onClick={copyUrl}>
              {copied ? "Tersalin" : "Salin tautan"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Tautan ini bisa dibagikan langsung, atau ditaruh sendiri di halaman mana pun lewat
            Tampilan &amp; Tema → slot HTML.
          </p>
          <Button type="button" variant="outline" size="xs" onClick={handleRemove} disabled={busy}>
            Cabut dari situs
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Belum ada APK. Buat dulu di komputer (lihat panduan{" "}
          <span className="font-mono">docs/12-BUILD-APP-ANDROID-TWA.md</span>), lalu unggah
          berkas <span className="font-mono">.apk</span>-nya di sini.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t pt-3">
        <label className="flex-1 space-y-1">
          <span className="text-xs font-medium">Berkas .apk</span>
          <input
            ref={fileRef}
            type="file"
            accept=".apk,application/vnd.android.package-archive"
            disabled={busy}
            className="block w-full text-xs file:mr-2 file:rounded file:border file:bg-background file:px-2 file:py-1 file:text-xs"
          />
        </label>
        <label className="w-24 space-y-1">
          <span className="text-xs font-medium">Versi</span>
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.0.0"
            disabled={busy}
            className="block w-full rounded border bg-background px-2 py-1 text-xs"
          />
        </label>
        <Button type="button" size="sm" onClick={handleUpload} disabled={busy}>
          {busy ? "Mengunggah..." : "Unggah"}
        </Button>
      </div>

      {msg?.error && <p className="text-xs text-destructive">{msg.error}</p>}
      {msg?.ok && <p className="text-xs text-emerald-600 dark:text-emerald-400">{msg.ok}</p>}
    </div>
  );
}
