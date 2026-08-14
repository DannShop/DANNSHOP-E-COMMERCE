"use client";

import { useEffect, useRef } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  normalizeFieldName,
  presetForCategorySlug,
  QUICK_ADD_FIELDS,
  type InputFieldDef,
} from "@/lib/catalog/input-field-presets";

/** Dua daftar field dianggap sama kalau nama, label, DAN urutannya sama. */
function sameFields(a: InputFieldDef[], b: InputFieldDef[]): boolean {
  return a.length === b.length && a.every((f, i) => f.name === b[i].name && f.label === b[i].label);
}

/**
 * Penyusun daftar field tujuan yang diminta ke pembeli.
 *
 * Menggantikan textarea JSON mentah. Nilainya tetap dikirim ke server sebagai
 * JSON string lewat <input type="hidden">, jadi kontrak server (productSchema di
 * lib/validation/catalog.ts) TIDAK berubah sama sekali — yang berubah cuma cara
 * admin mengisinya.
 */
export function InputFieldsBuilder({
  fields,
  onChange,
  categorySlug,
  /** Slug kategori saat komponen pertama kali dirender, untuk produk yang sudah ada. */
  initialCategorySlug,
}: {
  fields: InputFieldDef[];
  onChange: (next: InputFieldDef[]) => void;
  categorySlug: string | undefined;
  initialCategorySlug?: string;
}) {
  // Preset hanya diterapkan saat admin BENAR-BENAR mengganti kategori, bukan pada
  // render pertama. Kalau tidak, membuka produk lama sekadar untuk mengedit
  // judulnya akan menimpa susunan field yang sudah dipakai order-order sebelumnya.
  const lastSlug = useRef<string | undefined>(initialCategorySlug);
  useEffect(() => {
    if (categorySlug === undefined || lastSlug.current === categorySlug) return;
    const previousSlug = lastSlug.current;
    lastSlug.current = categorySlug;

    // Preset baru diterapkan HANYA kalau tidak ada pekerjaan tangan yang bisa
    // hilang: daftarnya masih kosong, atau isinya masih persis preset kategori
    // sebelumnya (berarti admin belum menyesuaikan apa pun).
    //
    // SENGAJA TANPA window.confirm: dialog yang muncul sendiri dari efek samping
    // saat admin baru saja mengganti dropdown itu mengagetkan, dan admin cenderung
    // menutupnya refleks — persis kondisi yang membuat konfirmasi jadi tidak ada
    // gunanya. Diam-diam mempertahankan susunan buatan admin lebih aman: preset
    // itu kenyamanan, sedangkan field yang sudah disusun itu keputusan.
    const untouched = fields.length === 0 || sameFields(fields, presetForCategorySlug(previousSlug));
    if (untouched) onChange(presetForCategorySlug(categorySlug));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorySlug]);

  function update(index: number, patch: Partial<InputFieldDef>) {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function remove(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function add(field?: InputFieldDef) {
    onChange([...fields, field ? { ...field } : { name: "", label: "" }]);
  }

  const usedNames = new Set(fields.map((f) => f.name));

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div>
        <Label>Data yang diminta ke pembeli</Label>
        <p className="text-xs text-muted-foreground">
          Urutan menentukan bentuk nomor tujuan yang dikirim ke provider. Untuk game dua-input, letakkan{" "}
          <strong>User ID</strong> di atas <strong>Zone ID</strong>.
        </p>
      </div>

      {fields.length === 0 ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Belum ada field. Pembeli hanya akan diminta email — cocok untuk produk yang tidak butuh nomor tujuan.
        </p>
      ) : (
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-md ring-1 ring-foreground/10 p-2">
              <div className="min-w-[9rem] flex-1 space-y-1">
                <Label htmlFor={`field-label-${i}`} className="text-xs">
                  Label (dilihat pembeli)
                </Label>
                <Input
                  id={`field-label-${i}`}
                  value={f.label}
                  placeholder="User ID"
                  onChange={(e) => {
                    const label = e.target.value;
                    // Nama teknis ikut terisi otomatis dari label SELAMA admin belum
                    // menyentuhnya sendiri — supaya kasus umum benar-benar nol
                    // ketikan teknis, tapi nama yang sudah disesuaikan tidak
                    // tertimpa diam-diam.
                    const autoName = normalizeFieldName(f.label) === f.name;
                    update(i, autoName ? { label, name: normalizeFieldName(label) } : { label });
                  }}
                />
              </div>
              <div className="min-w-[9rem] flex-1 space-y-1">
                <Label htmlFor={`field-name-${i}`} className="text-xs">
                  Nama teknis
                </Label>
                <Input
                  id={`field-name-${i}`}
                  value={f.name}
                  placeholder="user_id"
                  className="font-mono text-xs"
                  onChange={(e) => update(i, { name: normalizeFieldName(e.target.value) })}
                />
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  aria-label="Naikkan"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  aria-label="Turunkan"
                  disabled={i === fields.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  aria-label="Hapus field"
                  onClick={() => remove(i)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="xs" variant="outline" onClick={() => add()}>
          <Plus className="size-3.5" /> Tambah field
        </Button>
        {QUICK_ADD_FIELDS.filter((q) => !usedNames.has(q.name)).map((q) => (
          <Button key={q.name} type="button" size="xs" variant="ghost" onClick={() => add(q)}>
            + {q.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
