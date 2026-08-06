"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function ContentPageForm({
  initial,
  action,
  submitLabel,
}: {
  initial: string;
  action: (formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Format sederhana: baris <code className="rounded bg-muted px-1">## Judul</code> jadi subjudul, baris{" "}
        <code className="rounded bg-muted px-1">- teks</code> jadi bullet list, baris kosong memisahkan paragraf.
      </p>
      <textarea
        name="content"
        defaultValue={initial}
        rows={16}
        className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
      />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Menyimpan..." : submitLabel}
      </Button>
      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
