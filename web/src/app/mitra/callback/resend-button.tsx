"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resendMitraCallback, type MitraResult } from "@/app/actions/mitra";

const INITIAL_STATE: MitraResult = {};

export function ResendCallbackButton({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(
    (_prev: MitraResult, formData: FormData) => resendMitraCallback(formData),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="submit" size="xs" variant="outline" disabled={pending || Boolean(state.ok)}>
        <Send className="size-3" aria-hidden="true" />
        {pending ? "Mengirim..." : state.ok ? "Dijadwalkan" : "Kirim ulang"}
      </Button>
      {state.error && <span className="text-[11px] text-destructive">{state.error}</span>}
    </form>
  );
}
