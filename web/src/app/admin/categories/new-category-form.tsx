"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function NewCategoryForm({ action }: { action: (formData: FormData) => Promise<ActionResult> }) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
      <div>
        <Label htmlFor="new-name" className="text-xs">Nama</Label>
        <Input id="new-name" name="name" required />
      </div>
      <div>
        <Label htmlFor="new-slug" className="text-xs">Slug (URL)</Label>
        <Input id="new-slug" name="slug" placeholder="misal: token-game" required />
      </div>
      <div>
        <Label htmlFor="new-sortOrder" className="text-xs">Urutan</Label>
        <Input id="new-sortOrder" name="sortOrder" type="number" defaultValue={0} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "..." : "Tambah"}
      </Button>
      {(state.ok || state.error) && (
        <p className={`col-span-full text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
