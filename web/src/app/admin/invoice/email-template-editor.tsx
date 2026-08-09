"use client";

import { useActionState, useState, useTransition } from "react";
import { Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EmailTemplate, EmailTemplateKey, EmailTemplateMeta } from "@/lib/notify/email-templates";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function EmailTemplateEditor({
  templateKey,
  meta,
  initial,
  save,
  reset,
  preview,
}: {
  templateKey: EmailTemplateKey;
  meta: EmailTemplateMeta;
  initial: EmailTemplate;
  save: (formData: FormData) => Promise<ActionResult>;
  reset: (key: EmailTemplateKey) => Promise<ActionResult>;
  preview: (key: EmailTemplateKey, subject: string, body: string) => Promise<{ html?: string; error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => save(formData),
    INITIAL_STATE,
  );
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  function insertPlaceholder(name: string) {
    setBody((current) => `${current}\n{{${name}}}`);
  }

  return (
    <details className="rounded-lg border">
      <summary className="cursor-pointer list-none px-4 py-3">
        <span className="text-sm font-semibold">{meta.label}</span>
        <span className="block text-xs text-muted-foreground">{meta.description}</span>
      </summary>

      <div className="border-t p-4">
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="key" value={templateKey} />

          <div className="space-y-1.5">
            <Label htmlFor={`subject-${templateKey}`}>Subjek email</Label>
            <Input
              id={`subject-${templateKey}`}
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`body-${templateKey}`}>Isi email (HTML)</Label>
            <Textarea
              id={`body-${templateKey}`}
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="font-mono text-xs"
              required
            />
            <p className="text-xs text-muted-foreground">
              Logo, header, dan kaki email datang dari <strong>Identitas Dokumen</strong> di atas dan otomatis dipasang
              di sekeliling isi ini — tidak perlu ditulis ulang di sini.
            </p>
          </div>

          <div className="rounded-md bg-muted/50 p-3">
            <p className="mb-2 text-xs font-semibold">Placeholder yang tersedia (klik untuk menyisipkan)</p>
            <div className="flex flex-wrap gap-1.5">
              {meta.blocks.map((b) => (
                <button
                  key={b.name}
                  type="button"
                  title={b.description}
                  onClick={() => insertPlaceholder(b.name)}
                  className="rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[11px] text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300"
                >
                  {`{{${b.name}}}`}
                </button>
              ))}
              {meta.vars.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  title={v.description}
                  onClick={() => insertPlaceholder(v.name)}
                  className="rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted"
                >
                  {`{{${v.name}}}`}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Yang berwarna adalah <strong>blok</strong> — potongan siap pakai yang dibangun sistem (tabel rincian,
              tombol, kotak SN). Yang putih adalah nilai teks biasa.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan..." : "Simpan Template"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                startBusy(async () => {
                  setPreviewError(null);
                  const result = await preview(templateKey, subject, body);
                  if (result.error) setPreviewError(result.error);
                  else setPreviewHtml(result.html ?? "");
                })
              }
            >
              <Eye className="size-3.5" aria-hidden="true" />
              Pratinjau
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                startBusy(async () => {
                  const result = await reset(templateKey);
                  if (result.ok) window.location.reload();
                })
              }
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Kembalikan ke Bawaan
            </Button>
          </div>

          {(state.ok || state.error) && (
            <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
              {state.error ?? state.ok}
            </p>
          )}
          {previewError && <p className="text-xs text-destructive">{previewError}</p>}
        </form>

        {previewHtml !== null && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold">Pratinjau (data contoh)</p>
            {/* iframe bersandbox, BUKAN dangerouslySetInnerHTML: isi ini HTML
                yang baru saja diketik admin dan akan dirender apa adanya.
                Menyuntikkannya ke DOM panel admin berarti skrip di dalamnya
                berjalan dengan sesi admin yang sedang login. sandbox tanpa
                allow-scripts membuat pratinjau tetap sekadar gambar. */}
            <iframe
              title="Pratinjau email"
              srcDoc={previewHtml}
              sandbox=""
              className="h-[520px] w-full rounded-lg border bg-white"
            />
          </div>
        )}
      </div>
    </details>
  );
}
