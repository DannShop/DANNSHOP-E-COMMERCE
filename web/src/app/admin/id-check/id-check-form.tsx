"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, Plus, TriangleAlert, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { IdCheckStatus } from "@/lib/catalog/id-check";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

interface HeaderRow {
  name: string;
  value: string;
}

export function IdCheckForm({
  status,
  action,
  testAction,
}: {
  status: IdCheckStatus;
  action: (formData: FormData) => Promise<ActionResult>;
  // `raw` = balasan mentah penyedia. Hanya dipakai di panel Uji Coba halaman ini
  // (lihat catatan di performIdCheck) — jangan diteruskan ke komponen pembeli.
  testAction: (
    gameCode: string,
    target: Record<string, string>,
  ) => Promise<{ nickname?: string; error?: string; raw?: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [method, setMethod] = useState<"GET" | "POST">(status.method);
  // Menentukan bagian mana dari form ini yang relevan: jalur OkeConnect tidak
  // memakai URL/header/path sama sekali, jadi menampilkannya cuma bikin admin
  // mengisi kolom yang tidak akan pernah dibaca.
  const [provider, setProvider] = useState<"http" | "okeconnect">(status.provider);
  // Nilai header sengaja dimulai kosong walau sudah tersimpan: server
  // memperlakukan kosong sebagai "pertahankan yang lama", jadi API key tidak
  // pernah perlu dikirim ke browser sama sekali.
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>(
    status.headerNames.length > 0 ? status.headerNames.map((name) => ({ name, value: "" })) : [],
  );

  const [testGame, setTestGame] = useState("");
  const [testFields, setTestFields] = useState("user_id=123456789\nzone_id=1234");
  const [testResult, setTestResult] = useState<{ nickname?: string; error?: string; raw?: string } | null>(null);
  const [testing, startTest] = useTransition();

  function runTest() {
    startTest(async () => {
      setTestResult(null);
      const target: Record<string, string> = {};
      for (const line of testFields.split("\n")) {
        const idx = line.indexOf("=");
        if (idx > 0) target[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
      setTestResult(await testAction(testGame.trim(), target));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {status.configured ? (
        <div
          className={`flex items-start gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
            status.enabled
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
          }`}
        >
          {status.enabled ? (
            <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>
            {status.enabled
              ? "Aktif — tombol cek ID muncul di produk yang mengaktifkannya."
              : "Konfigurasi tersimpan tapi saklar induknya MATI — tombol cek ID tidak muncul di mana pun."}
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>Belum dikonfigurasi. Isi URL penyedia di bawah, tes dulu, baru nyalakan.</span>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-4 rounded-lg border p-4">
        <input type="hidden" name="headers" value={JSON.stringify(headerRows)} />

        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox name="enabled" defaultChecked={status.enabled} />
          Aktifkan fitur cek ID untuk pembeli
        </label>

        <div className="space-y-1.5 rounded-lg border p-3">
          <Label htmlFor="provider">Sumber data</Label>
          <select
            id="provider"
            name="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value === "okeconnect" ? "okeconnect" : "http")}
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="okeconnect">OkeConnect — pakai kredensial provider yang sudah ada</option>
            <option value="http">API pihak ketiga (isi URL sendiri)</option>
          </select>
          {provider === "okeconnect" ? (
            <p className="text-xs text-muted-foreground">
              Memakai produk <span className="font-mono">CEK*</span> OkeConnect lewat kredensial di{" "}
              <strong>Admin → Providers</strong> — tidak perlu langganan API terpisah. Isi{" "}
              <strong>Kode cek ID</strong> di tiap produk dengan kode produknya, mis.{" "}
              <span className="font-mono">CEKPLN</span> (nama pemilik token PLN),{" "}
              <span className="font-mono">CEKD</span> (Dana), <span className="font-mono">CEKGJK</span> (Gopay),{" "}
              <span className="font-mono">CEKML</span> (Mobile Legends).
              <br />
              <strong className="text-amber-700 dark:text-amber-400">
                Belum pernah diuji dengan kredensial sungguhan.
              </strong>{" "}
              Pakai tombol Tes di bawah dulu — balasan mentah penyedia akan ditampilkan apa adanya supaya bisa
              dicocokkan.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Adapter HTTP generik: kamu yang menyediakan URL, header, dan letak nickname di dalam respons JSON.
            </p>
          )}
        </div>

        <div className={provider === "okeconnect" ? "hidden" : "grid gap-3 sm:grid-cols-[1fr_auto]"}>
          <div className="space-y-1.5">
            <Label htmlFor="urlTemplate">URL penyedia</Label>
            <Input
              id="urlTemplate"
              name="urlTemplate"
              defaultValue={status.urlTemplate}
              placeholder="https://api-penyedia.com/cek?game={game}&id={user_id}&zone={zone_id}"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="method">Metode</Label>
            <select
              id="method"
              name="method"
              value={method}
              onChange={(e) => setMethod(e.target.value as "GET" | "POST")}
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </div>
        </div>

        {/* Semua isian di bawah ini khusus jalur HTTP generik. Dipakai `hidden`
            (bukan render bersyarat) supaya input yang ber-`required` seperti
            nicknamePath tetap ada di DOM dan form tidak gagal tersubmit saat
            jalur OkeConnect dipilih. */}
        <div className={provider === "okeconnect" ? "hidden" : "contents"}>
        <div className="rounded-md bg-muted/50 p-3 text-xs">
          <p className="font-semibold">Placeholder yang bisa dipakai</p>
          <ul className="mt-1.5 space-y-1 text-muted-foreground">
            <li>
              <code className="font-mono">{"{game}"}</code> — diisi dari kolom{" "}
              <strong>Kode cek ID</strong> di form produk. Nilainya mengikuti penyedia yang kamu pakai (mis.{" "}
              <code className="font-mono">mobile-legends</code> atau <code className="font-mono">ml</code>).
            </li>
            <li>
              <code className="font-mono">{"{nama_field}"}</code> — setiap field input produk, mis.{" "}
              <code className="font-mono">{"{user_id}"}</code> dan <code className="font-mono">{"{zone_id}"}</code>.
              Namanya harus sama persis dengan yang kamu definisikan di form produk.
            </li>
          </ul>
        </div>

        {method === "POST" && (
          <div className="space-y-1.5">
            <Label htmlFor="bodyTemplate">Body request (JSON)</Label>
            <Textarea
              id="bodyTemplate"
              name="bodyTemplate"
              defaultValue={status.bodyTemplate}
              rows={4}
              className="font-mono text-xs"
              placeholder={'{"game":"{game}","user_id":"{user_id}","zone_id":"{zone_id}"}'}
            />
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label>Header tambahan</Label>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => setHeaderRows((r) => [...r, { name: "", value: "" }])}
            >
              <Plus className="size-3" aria-hidden="true" />
              Tambah header
            </Button>
          </div>
          {headerRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Belum ada. Tambahkan kalau penyedia butuh API key, mis. <code className="font-mono">Authorization</code>.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {headerRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={row.name}
                    onChange={(e) =>
                      setHeaderRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, name: e.target.value } : r)))
                    }
                    placeholder="Authorization"
                    className="w-48 font-mono text-xs"
                  />
                  <Input
                    type="password"
                    value={row.value}
                    onChange={(e) =>
                      setHeaderRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)))
                    }
                    placeholder={status.headerNames.includes(row.name) ? "Tersimpan — isi untuk mengganti" : "Bearer ..."}
                    className="flex-1 font-mono text-xs"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setHeaderRows((rows) => rows.filter((_, idx) => idx !== i))}
                    aria-label="Hapus header"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="nicknamePath">Letak nickname di respons</Label>
            <Input
              id="nicknamePath"
              name="nicknamePath"
              defaultValue={status.nicknamePath}
              placeholder="data.username"
              className="font-mono text-xs"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="errorPath">Letak pesan error</Label>
            <Input
              id="errorPath"
              name="errorPath"
              defaultValue={status.errorPath}
              placeholder="message"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timeoutMs">Timeout (ms)</Label>
            <Input id="timeoutMs" name="timeoutMs" defaultValue={status.timeoutMs} inputMode="numeric" />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          Notasi titik untuk masuk ke dalam objek. Kalau penyedia membalas{" "}
          <code className="font-mono">{'{"data":{"username":"Budi"}}'}</code>, isi{" "}
          <code className="font-mono">data.username</code>.
        </p>
        </div>

        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Menyimpan..." : "Simpan Konfigurasi Cek ID"}
        </Button>
        {(state.ok || state.error) && (
          <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
            {state.error ?? state.ok}
          </p>
        )}
      </form>

      <div className="rounded-lg border p-4">
        <h3 className="text-sm font-semibold">Uji Coba</h3>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          Memakai konfigurasi yang <strong>sudah tersimpan</strong>, dan tetap jalan walau saklar induknya masih mati —
          justru begini cara memastikannya benar sebelum dinyalakan.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="test-game">Kode cek ID</Label>
            <Input
              id="test-game"
              value={testGame}
              onChange={(e) => setTestGame(e.target.value)}
              placeholder={provider === "okeconnect" ? "CEKPLN" : "mobile-legends"}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="test-fields">Data akun (satu per baris, format nama=nilai)</Label>
            <Textarea
              id="test-fields"
              value={testFields}
              onChange={(e) => setTestFields(e.target.value)}
              rows={3}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <Button type="button" variant="outline" disabled={testing} onClick={runTest} className="mt-3">
          <Zap className="size-3.5" aria-hidden="true" />
          {testing ? "Mengecek..." : "Jalankan Tes"}
        </Button>
        {testResult && (
          <>
            <p
              className={`mt-2 text-xs ${testResult.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}
            >
              {testResult.error ?? `Nama ditemukan: ${testResult.nickname}`}
            </p>
            {testResult.raw && (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-medium">Balasan mentah penyedia</p>
                <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap break-all">
                  {testResult.raw}
                </pre>
                <p className="text-xs text-muted-foreground">
                  Hanya terlihat di halaman ini, tidak pernah ditampilkan ke pembeli. Kalau namanya jelas terbaca di
                  sini tapi di atas tertulis &quot;tidak ditemukan&quot;, berarti pola pembaca namanya perlu
                  disesuaikan — kirimkan potongan teks ini.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
