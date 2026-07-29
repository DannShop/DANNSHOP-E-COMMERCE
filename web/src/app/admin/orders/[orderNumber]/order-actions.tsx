"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  retryFulfillmentAction, retryRefundAction, markCompletedManualAction, markRefundedAction,
} from "@/app/actions/orders";
import { ActionMessage, INITIAL_STATE, withPrevState } from "../action-utils";

function RetryFulfillmentForm({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [state, formAction, pending] = useActionState(withPrevState(retryFulfillmentAction), INITIAL_STATE);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Coba kirim ulang fulfillment order ini?")) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <Button type="submit" disabled={pending}>{pending ? "Memproses..." : "Coba Lagi"}</Button>
      <ActionMessage state={state} />
    </form>
  );
}

function RetryRefundForm({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [state, formAction, pending] = useActionState(withPrevState(retryRefundAction), INITIAL_STATE);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Coba ulang kredit refund ke saldo member?")) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <Button type="submit" disabled={pending} variant="outline">{pending ? "Memproses..." : "Coba Refund Ulang"}</Button>
      <ActionMessage state={state} />
    </form>
  );
}

function MarkCompletedManualForm({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [state, formAction, pending] = useActionState(withPrevState(markCompletedManualAction), INITIAL_STATE);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Tandai order ini selesai manual? Pastikan barang/voucher sudah benar-benar terkirim.")) {
          e.preventDefault();
        }
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <Label htmlFor="sn">SN / kode voucher</Label>
      <Textarea id="sn" name="sn" rows={2} placeholder="Isi SN/kode voucher yang diberikan ke pembeli" required />
      <Button type="submit" disabled={pending} variant="secondary">{pending ? "Memproses..." : "Tandai Selesai Manual"}</Button>
      <ActionMessage state={state} />
    </form>
  );
}

function MarkRefundedForm({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [state, formAction, pending] = useActionState(withPrevState(markRefundedAction), INITIAL_STATE);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Tandai order ini sudah direfund? Pastikan transfer sudah benar-benar dilakukan.")) {
          e.preventDefault();
        }
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <Label htmlFor="note">Catatan (nomor referensi transfer)</Label>
      <Textarea id="note" name="note" rows={2} placeholder="Mis. transfer BCA 29/07 12:34, ref 123456" required />
      <Button type="submit" disabled={pending} variant="secondary">{pending ? "Memproses..." : "Tandai Sudah Direfund"}</Button>
      <ActionMessage state={state} />
    </form>
  );
}

export function OrderActions({
  orderId, orderNumber, status, canRetryRefund,
}: {
  orderId: string;
  orderNumber: string;
  status: string;
  canRetryRefund: boolean;
}) {
  if (status === "NEEDS_REVIEW") {
    return (
      <div className="flex flex-col gap-4 rounded-xl ring-1 ring-foreground/10 p-4">
        <h2 className="text-sm font-semibold">Aksi</h2>
        {canRetryRefund ? (
          <RetryRefundForm orderId={orderId} orderNumber={orderNumber} />
        ) : (
          <RetryFulfillmentForm orderId={orderId} orderNumber={orderNumber} />
        )}
        <MarkCompletedManualForm orderId={orderId} orderNumber={orderNumber} />
      </div>
    );
  }

  if (status === "REFUND_PENDING") {
    return (
      <div className="flex flex-col gap-4 rounded-xl ring-1 ring-foreground/10 p-4">
        <h2 className="text-sm font-semibold">Aksi</h2>
        <MarkRefundedForm orderId={orderId} orderNumber={orderNumber} />
      </div>
    );
  }

  if (status === "PROCESSING") {
    return (
      <div className="flex flex-col gap-4 rounded-xl ring-1 ring-foreground/10 p-4">
        <h2 className="text-sm font-semibold">Aksi</h2>
        <MarkCompletedManualForm orderId={orderId} orderNumber={orderNumber} />
      </div>
    );
  }

  return null;
}
