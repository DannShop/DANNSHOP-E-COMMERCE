"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ActionMessage, INITIAL_STATE, withPrevState } from "./action-utils";
import type { ServerAction } from "./action-utils";

export function ProductToggleForm({
  productId,
  isActive,
  itemCount,
  toggleProductActive,
}: {
  productId: string;
  isActive: boolean;
  itemCount: number;
  toggleProductActive: ServerAction;
}) {
  const [state, action, pending] = useActionState(withPrevState(toggleProductActive), INITIAL_STATE);
  const disabled = pending || (!isActive && itemCount === 0);

  return (
    <form action={action} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={productId} />
      <Button type="submit" size="xs" variant={isActive ? "outline" : "default"} disabled={disabled}>
        {pending ? "Memproses..." : isActive ? "Nonaktifkan" : "Aktifkan"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
