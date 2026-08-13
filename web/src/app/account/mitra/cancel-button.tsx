"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cancelPartnerApplication, type ApplicationResult } from "@/app/actions/partner-application";

const INITIAL_STATE: ApplicationResult = {};

export function CancelApplicationButton() {
  const [state, formAction, pending] = useActionState(
    () => cancelPartnerApplication(),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        {pending ? "Membatalkan..." : "Batalkan pengajuan"}
      </Button>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
