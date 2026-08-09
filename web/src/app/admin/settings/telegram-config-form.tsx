"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TELEGRAM_EVENTS, TELEGRAM_EVENT_KEYS, type TelegramNotifyStatus } from "@/lib/notify/telegram-config";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function TelegramConfigForm({
  status,
  action,
  testAction,
}: {
  status: TelegramNotifyStatus;
  action: (formData: FormData) => Promise<ActionResult>;
  testAction: () => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  // Hasil tes disimpan terpisah dari hasil simpan: keduanya bisa terjadi
  // berurutan dan menimpa satu sama lain akan menyembunyikan yang lebih penting
  // ("tersimpan" menutupi "gagal kirim, tokennya salah").
  const [testResult, setTestResult] = useState<ActionResult | null>(null);
  const [testing, startTest] = useTransition();

  return (
    <div className="flex flex-col gap-3">
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
            {status.enabled ? "Aktif" : "Tersimpan tapi saklar induknya MATI"} — chat ID: {status.chatId}
            {status.fromEnv && " (masih dari environment variable, belum disimpan lewat panel ini)"}
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Belum dikonfigurasi — kamu TIDAK akan menerima notifikasi apa pun soal order gagal, refund, atau saldo
            provider habis.
          </span>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-4 rounded-lg border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox name="enabled" defaultChecked={status.enabled} />
          Aktifkan notifikasi Telegram
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tg-token">Bot Token</Label>
            <Input
              id="tg-token"
              name="botToken"
              type="password"
              autoComplete="off"
              placeholder={status.configured ? "Isi untuk mengganti yang tersimpan" : "123456789:AA..."}
            />
            <p className="text-xs text-muted-foreground">
              Dari @BotFather di Telegram: kirim <code>/newbot</code>, lalu salin token yang diberikan.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-chat">Chat ID</Label>
            <Input
              id="tg-chat"
              name="chatId"
              autoComplete="off"
              defaultValue={status.chatId}
              placeholder="123456789 atau -1001234567890"
            />
            <p className="text-xs text-muted-foreground">
              ID numerik, bukan username. Chat pribadi: kirim pesan apa pun ke @userinfobot. Grup: tambahkan botnya ke
              grup, ID grup diawali tanda minus.
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Kirim notifikasi untuk:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TELEGRAM_EVENT_KEYS.map((key) => (
              <label key={key} className="flex items-start gap-2 text-sm">
                <Checkbox name={`event.${key}`} defaultChecked={status.events[key]} className="mt-0.5" />
                <span>{TELEGRAM_EVENTS[key]}</span>
              </label>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Ini bot notifikasi internal untuk kamu sebagai admin — <strong>berbeda</strong> dari kontak CS di atas, yang
          memakai username Telegram aslimu dan dipajang ke pembeli. Token tersimpan terenkripsi dan tidak pernah
          ditampilkan lagi.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Menyimpan..." : "Simpan Notifikasi Telegram"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={testing || !status.configured}
            onClick={() =>
              startTest(async () => {
                setTestResult(null);
                setTestResult(await testAction());
              })
            }
          >
            <Send className="size-3.5" aria-hidden="true" />
            {testing ? "Mengirim..." : "Kirim Tes"}
          </Button>
        </div>

        {(state.ok || state.error) && (
          <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
            {state.error ?? state.ok}
          </p>
        )}
        {testResult && (
          <p className={`text-xs ${testResult.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
            {testResult.error ?? testResult.ok}
          </p>
        )}
      </form>
    </div>
  );
}
