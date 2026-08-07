"use client";

import { BENEFIT_CATALOG } from "@/lib/membership/benefits";
import { Checkbox } from "@/components/ui/checkbox";

// Checklist benefit yang dicentang/tidak - dipakai form create & edit. Satu
// komponen supaya katalog benefit (lib/membership/benefits.ts) cuma perlu
// diubah di SATU tempat kalau nanti nambah/ubah benefit, form otomatis ikut.
//
// Sengaja SATU CHECKBOX PER KEY (name="benefit_<key>", dibaca "on"/tidak ada),
// BUKAN banyak checkbox senama + formData.getAll(). Seluruh checkbox lain di
// codebase ini (isActive, dsb.) memakai pola boolean-tunggal-"on" yang sudah
// terbukti jalan; getAll() dengan `value` per-checkbox tidak punya preseden
// di sini, jadi tidak dipakai untuk sesuatu yang menentukan benefit uang nyata.
export function BenefitChecklist({ enabled, idPrefix }: { enabled: string[]; idPrefix: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Benefit yang didapat</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {BENEFIT_CATALOG.map((b) => (
          <label
            key={b.key}
            htmlFor={`${idPrefix}-${b.key}`}
            className="flex items-start gap-2 rounded-md border p-2.5 text-sm hover:bg-muted/50"
          >
            <Checkbox id={`${idPrefix}-${b.key}`} name={`benefit_${b.key}`} defaultChecked={enabled.includes(b.key)} />
            <span>
              <span className="block font-medium">{b.label}</span>
              <span className="block text-xs text-muted-foreground">{b.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
