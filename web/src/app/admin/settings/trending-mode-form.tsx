"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function TrendingModeForm({
  initial,
  action,
}: {
  initial: "manual" | "auto";
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [mode, setMode] = useState<"manual" | "auto">(initial);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="trendingMode" value={mode} />
      <RadioGroup value={mode} onValueChange={(v) => setMode(v as "manual" | "auto")}>
        <RadioGroupItem value="manual">Manual (pilih produk lewat centang Trending)</RadioGroupItem>
        <RadioGroupItem value="auto">Otomatis (berdasarkan order sukses 7 hari terakhir)</RadioGroupItem>
      </RadioGroup>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "..." : "Simpan"}
      </Button>
      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
