"use client";

import type { ActionResult } from "@/app/actions/catalog";

// Helper bersama untuk form-form CRUD produk di halaman ini — pola sama persis
// dengan admin/providers/provider-card.tsx (Task 9): useActionState butuh action
// berbentuk (prevState, formData) => state, sedangkan server action kita cuma
// nerima (formData). Diekstrak ke satu file supaya 3 client component di fitur
// ini (toggle, product-form, product-items-manager) tidak menduplikasi ulang.
export type ServerAction = (formData: FormData) => Promise<ActionResult>;

export const INITIAL_STATE: ActionResult = {};

export function withPrevState(action: ServerAction) {
  return (_prev: ActionResult, formData: FormData) => action(formData);
}

export function ActionMessage({ state }: { state: ActionResult }) {
  if (!state.ok && !state.error) return null;
  return (
    <p
      aria-live="polite"
      className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}
    >
      {state.error ?? state.ok}
    </p>
  );
}
