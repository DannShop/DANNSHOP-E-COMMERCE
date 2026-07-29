"use client";
import type { ActionResult } from "@/app/actions/orders";

export type ServerAction = (formData: FormData) => Promise<ActionResult>;
export const INITIAL_STATE: ActionResult = {};

export function withPrevState(action: ServerAction) {
  return (_prev: ActionResult, formData: FormData) => action(formData);
}

export function ActionMessage({ state }: { state: ActionResult }) {
  if (!state.ok && !state.error) return null;
  return (
    <p aria-live="polite" className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
      {state.error ?? state.ok}
    </p>
  );
}
