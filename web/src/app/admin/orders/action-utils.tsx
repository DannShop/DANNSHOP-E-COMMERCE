"use client";
import type { ActionResult } from "@/app/actions/orders";

export type ServerAction = (formData: FormData) => Promise<ActionResult>;
export const INITIAL_STATE: ActionResult = {};

export function withPrevState(action: ServerAction) {
  return (_prev: ActionResult, formData: FormData) => action(formData);
}

// Diteruskan dari komponen bersama — lihat catatan di action-feedback.tsx.
export { ActionMessage } from "@/components/action-feedback";
