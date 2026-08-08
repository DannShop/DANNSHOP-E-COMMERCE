"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, TriangleAlert, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { MidtransConfigStatus } from "@/lib/payment/gateway-config";
import type { ChannelTestResult } from "@/app/actions/payment-config";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};
const INITIAL_CHANNEL_STATE: ChannelTestResult = {};
// Cerminan CHANNEL_TEST_AMOUNT di actions/payment-config.ts. Sengaja disalin
// sebagai teks, bukan diimpor: modul action itu menarik db + auth, dan
// mengimpor nilai (bukan type) dari sana akan menyeret keduanya ke bundle
// browser. Kalau nominal ujinya diubah, ubah juga di sini.
const CHANNEL_TEST_AMOUNT_LABEL = "10.000";

export function MidtransConfigForm({
  status,
  webhookUrl,
  action,
  testAction,
  channelTestAction,
}: {
  status: MidtransConfigStatus;
  webhookUrl: string;
  action: (formData: FormData) => Promise<ActionResult>;
  testAction: () => Promise<ActionResult>;
  channelTestAction: () => Promise<ChannelTestResult>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  // Form terpisah dari form simpan: uji koneksi memakai kredensial yang SUDAH
  // TERSIMPAN, bukan isi field yang belum disimpan - kalau dijadikan satu form,
  // admin akan mengira key yang baru diketik itulah yang diuji.
  const [testState, testFormAction, testPending] = useActionState(
    () => testAction(),
    INITIAL_STATE,
  );
  const [channelState, channelFormAction, channelPending] = useActionState(
    () => channelTestAction(),
    INITIAL_CHANNEL_STATE,
  );
  const [copied, setCopied] = useState(false);
  // Radio mode dikendalikan state supaya field Client Key bisa BEREAKSI saat
  // admin memilih Snap - bukan cuma mengikuti nilai yang sudah tersimpan.
  // Tanpa ini, admin yang baru memindahkan ke Snap tidak melihat penanda apa
  // pun bahwa client key jadi wajib, lalu simpanannya ditolak server tanpa
  // pernah tahu field mana yang dimaksud.
  const [mode, setMode] = useState(status.integrationMode);
  const snapSelected = mode === "snap";

  async function copyWebhookUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API bisa tidak tersedia — abaikan diam-diam
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {status.configured ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
          Mode {status.isProduction ? "Production" : "Sandbox"} · Integrasi{" "}
          {status.integrationMode === "snap" ? "Snap" : "Core API"} — server key {status.serverKeyMasked}
          {status.source === "env" && " (dari environment variable, belum diatur lewat panel ini)"}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          Belum dikonfigurasi — semua pembayaran non-saldo akan gagal sampai server key diisi.
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="space-y-1.5">
          <Label htmlFor="midtrans-server-key">Server Key</Label>
          <Input
            id="midtrans-server-key"
            name="serverKey"
            type="password"
            autoComplete="off"
            placeholder={status.configured ? "Isi untuk mengganti yang tersimpan" : "Mid-server-..."}
          />
          <p className="text-xs text-muted-foreground">
            Ambil di dashboard Midtrans → Settings → Access Keys, sesuai mode (Sandbox/Production) yang aktif di
            sana. Pastikan togglenya di bawah cocok dengan mode key yang kamu salin.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Metode Integrasi</Label>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm">
            <input
              type="radio"
              name="integrationMode"
              value="core_api"
              defaultChecked={status.integrationMode === "core_api"}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Core API</span> — pembayaran inline di situs ini
              <span className="block text-xs text-muted-foreground">
                Jalur utama. Butuh layanan Core API diaktifkan Midtrans untuk Production.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm">
            <input
              type="radio"
              name="integrationMode"
              value="snap"
              defaultChecked={status.integrationMode === "snap"}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Snap</span> — popup pembayaran Midtrans
              <span className="block text-xs text-muted-foreground">
                Fallback saat Core API Production belum aktif. Pembeli tetap memilih metode di halaman kita; popup
                Snap dibuka terkunci ke metode itu, jadi fee dan kode unik tetap persis.
              </span>
            </span>
          </label>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="midtrans-client-key">Client Key {status.integrationMode === "snap" && "(wajib untuk Snap)"}</Label>
          <Input
            id="midtrans-client-key"
            name="clientKey"
            autoComplete="off"
            defaultValue={status.clientKey}
            placeholder="Mid-client-..."
          />
          <p className="text-xs text-muted-foreground">
            Hanya dipakai mode Snap — popup-nya dimuat di browser dan menolak jalan tanpa ini. Core API tidak
            memerlukannya. Client key memang dirancang untuk publik, jadi tidak disembunyikan seperti server key.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="midtrans-merchant-id">Merchant ID (opsional)</Label>
          <Input
            id="midtrans-merchant-id"
            name="merchantId"
            autoComplete="off"
            defaultValue={status.merchantId ?? ""}
            placeholder="G123456789"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="isProduction" defaultChecked={status.isProduction} />
          Mode Production (jangan dicentang selama masih pakai key sandbox)
        </label>

        <p className="text-xs text-muted-foreground">
          Server key tersimpan terenkripsi dan tidak pernah ditampilkan lagi setelah disimpan. Client key sengaja tidak
          ada di sini — integrasi memakai Core API yang tidak memerlukannya.
        </p>

        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Menyimpan..." : "Simpan Kredensial"}
        </Button>
        {(state.ok || state.error) && (
          <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>{state.error ?? state.ok}</p>
        )}
      </form>

      <form action={testFormAction} className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">Uji Koneksi</p>
        <p className="text-xs text-muted-foreground">
          Memeriksa apakah server key yang tersimpan benar-benar diterima Midtrans pada mode yang aktif. Tidak membuat
          transaksi apa pun. Jalankan ini setiap kali mengganti key atau memindahkan mode — key sandbox dan production
          bisa punya awalan yang sama persis, jadi salah pasang mode cuma ketahuan lewat uji ini.
        </p>
        <Button type="submit" variant="outline" disabled={testPending || !status.configured} className="self-start">
          {testPending ? "Menguji..." : "Test Koneksi"}
        </Button>
        {(testState.ok || testState.error) && (
          <p className={`text-xs ${testState.error ? "text-destructive" : "text-emerald-700"}`}>
            {testState.error ?? testState.ok}
          </p>
        )}
      </form>

      <form action={channelFormAction} className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">Uji Channel Pembayaran</p>
        <p className="text-xs text-muted-foreground">
          Mencoba membuat pembayaran Rp {CHANNEL_TEST_AMOUNT_LABEL} untuk setiap metode yang aktif, lalu langsung
          membatalkannya. Inilah satu-satunya cara mengetahui channel mana yang benar-benar sudah diaktifkan Midtrans
          untuk akun ini — kredensial yang sah tidak menjamin channel-nya hidup. Tidak ada uang yang berpindah.
        </p>
        <Button type="submit" variant="outline" disabled={channelPending || !status.configured} className="self-start">
          {channelPending ? "Menguji channel..." : "Uji Channel Pembayaran"}
        </Button>
        {channelState.error && <p className="text-xs text-destructive">{channelState.error}</p>}
        {channelState.rows && (
          <ul className="flex flex-col gap-1">
            {channelState.rows.map((row) => (
              <li key={row.code} className="flex items-start gap-1.5 text-xs">
                {row.ok ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                ) : (
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
                )}
                <span className={row.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>
                  <span className="font-medium">{row.label}</span>
                  {row.ok ? " — aktif" : ` — ${row.reason ?? "gagal"}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </form>

      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">URL Notifikasi Pembayaran</p>
        <p className="text-xs text-muted-foreground">
          Paste ke dashboard Midtrans → Settings → Configuration → Payment Notification URL. Kalau ini belum terpasang,
          pembayaran yang sudah dibayar customer tidak akan terdeteksi otomatis lewat webhook.
        </p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 rounded bg-muted px-2 py-1.5 text-xs break-all">{webhookUrl}</code>
          <Button type="button" size="xs" variant="outline" className="shrink-0" onClick={copyWebhookUrl}>
            {copied ? (
              <>
                <Check className="size-3.5" /> Tersalin
              </>
            ) : (
              <>
                <Copy className="size-3.5" /> Salin
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
