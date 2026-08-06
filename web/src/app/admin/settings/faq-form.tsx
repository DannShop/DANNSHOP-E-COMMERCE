"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FaqItem } from "@/lib/site-settings";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function FaqForm({
  initial,
  action,
}: {
  initial: FaqItem[];
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [items, setItems] = useState<FaqItem[]>(initial);
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );

  function updateItem(index: number, field: "q" | "a", value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [...prev, { q: "", a: "" }]);
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor={`faq-q-${i}`} className="text-xs">
                  Pertanyaan
                </Label>
                <Input
                  id={`faq-q-${i}`}
                  value={item.q}
                  onChange={(e) => updateItem(i, "q", e.target.value)}
                  placeholder="Berapa lama proses topup?"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="mt-5 text-destructive"
                onClick={() => removeItem(i)}
                aria-label="Hapus pertanyaan"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`faq-a-${i}`} className="text-xs">
                Jawaban
              </Label>
              <textarea
                id={`faq-a-${i}`}
                value={item.a}
                onChange={(e) => updateItem(i, "a", e.target.value)}
                rows={2}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada pertanyaan. Tambahkan minimal satu.</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          + Tambah Pertanyaan
        </Button>
        <Button type="submit" disabled={pending || items.length === 0}>
          {pending ? "Menyimpan..." : "Simpan FAQ"}
        </Button>
      </div>

      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
