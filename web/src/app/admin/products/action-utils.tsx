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

// Diteruskan dari komponen bersama - aturan "sukses jadi toast, error tetap
// menempel" cuma boleh hidup di SATU tempat. Re-export dipertahankan supaya 19
// pemakaian di fitur ini tidak perlu mengubah import-nya.
export { ActionMessage } from "@/components/action-feedback";
