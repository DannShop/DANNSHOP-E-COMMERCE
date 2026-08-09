"use client";

import { useActionState, useState, useTransition } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SLOT_KEYS, SLOT_META, type StorefrontAppearance } from "@/lib/storefront/appearance";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function AppearanceForm({
  initial,
  action,
  preview,
}: {
  initial: StorefrontAppearance;
  action: (formData: FormData) => Promise<ActionResult>;
  preview: (html: string) => Promise<{ html?: string; error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor || "#7C3AED");
  const [useCustomColor, setUseCustomColor] = useState(initial.primaryColor !== "");
  const [slotDrafts, setSlotDrafts] = useState<Record<string, string>>(initial.slots);
  const [previewFor, setPreviewFor] = useState<{ key: string; html: string } | null>(null);
  const [busy, startBusy] = useTransition();

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Tema</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Warna utama</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useCustomColor}
                onChange={(e) => setUseCustomColor(e.target.checked)}
                className="size-4"
              />
              Pakai warna sendiri
            </label>
            {/* Nilai dikirim kosong saat centang dimatikan - kosong berarti
                "pakai warna bawaan tema", bukan "warna hitam". */}
            <input type="hidden" name="primaryColor" value={useCustomColor ? primaryColor : ""} />
            {useCustomColor && (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded border bg-transparent p-1"
                  aria-label="Warna utama"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-32 font-mono"
                  aria-label="Kode warna utama"
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="radiusPx">Kelengkungan sudut (px)</Label>
            <Input
              id="radiusPx"
              name="radiusPx"
              type="number"
              min={0}
              max={32}
              defaultValue={initial.radiusPx}
              className="w-28"
            />
            <p className="text-xs text-muted-foreground">0 = sudut siku, 10 = bawaan, 20+ = sangat membulat.</p>
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="customCss">CSS kustom</Label>
          <Textarea
            id="customCss"
            name="customCss"
            defaultValue={initial.customCss}
            rows={8}
            className="font-mono text-xs"
            placeholder={".site-header { box-shadow: none; }"}
          />
          <p className="text-xs text-muted-foreground">
            Hanya berlaku di halaman storefront publik — <strong>panel admin sengaja tidak ikut terpengaruh</strong>,
            supaya satu baris CSS yang salah tidak mengunci kamu dari halaman ini. <code>@import</code>,{" "}
            <code>url()</code> ke server luar, dan <code>expression()</code> dibuang otomatis.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold">Slot HTML per Halaman</h2>
          <p className="text-xs text-muted-foreground">
            Potongan HTML yang disisipkan ke titik-titik tertentu di storefront. Tag yang diizinkan: teks &amp; judul,
            daftar, tabel, <code>a</code>, <code>img</code>, <code>div</code>/<code>span</code> beserta{" "}
            <code>class</code> dan <code>style</code>. <code>script</code>, <code>iframe</code>, <code>form</code>, dan
            semua atribut <code>on…</code> dibuang otomatis — termasuk kalau kamu yang menuliskannya.
          </p>
        </div>

        {SLOT_KEYS.map((key) => (
          <details key={key} className="rounded-lg border">
            <summary className="cursor-pointer list-none px-4 py-2.5">
              <span className="text-sm font-medium">{SLOT_META[key].label}</span>
              {(slotDrafts[key] ?? "").trim() !== "" && (
                <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  terisi
                </span>
              )}
              <span className="block text-xs text-muted-foreground">{SLOT_META[key].description}</span>
            </summary>
            <div className="border-t p-3">
              <Textarea
                name={`slot.${key}`}
                value={slotDrafts[key] ?? ""}
                onChange={(e) => setSlotDrafts((d) => ({ ...d, [key]: e.target.value }))}
                rows={5}
                className="font-mono text-xs"
                placeholder="<p>Contoh: <strong>Promo!</strong> Diskon 10% khusus hari ini.</p>"
              />
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="mt-2"
                disabled={busy}
                onClick={() =>
                  startBusy(async () => {
                    const result = await preview(slotDrafts[key] ?? "");
                    setPreviewFor({ key, html: result.html ?? "" });
                  })
                }
              >
                <Eye className="size-3" aria-hidden="true" />
                Lihat hasil setelah disaring
              </Button>
              {previewFor?.key === key && (
                <div className="mt-2 rounded-md border bg-muted/30 p-3">
                  <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
                    Yang benar-benar akan tampil:
                  </p>
                  {previewFor.html.trim() === "" ? (
                    <p className="text-xs text-muted-foreground">(kosong — semua isinya terbuang oleh penyaring)</p>
                  ) : (
                    <>
                      {/* Pratinjau merender hasil PENYARING, bukan masukan
                          mentah - jadi yang terlihat di sini persis sama dengan
                          yang akan dilihat pembeli, termasuk bagian yang hilang. */}
                      <div
                        className="prose-sm text-sm"
                        dangerouslySetInnerHTML={{ __html: previewFor.html }}
                      />
                      <pre className="mt-2 max-h-32 overflow-auto rounded bg-background p-2 text-[10px]">
                        {previewFor.html}
                      </pre>
                    </>
                  )}
                </div>
              )}
            </div>
          </details>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : "Simpan Tampilan"}
        </Button>
        {(state.ok || state.error) && (
          <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
            {state.error ?? state.ok}
          </p>
        )}
      </div>
    </form>
  );
}
