"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ActionMessage, INITIAL_STATE, withPrevState, type ServerAction } from "../action-utils";

// Actions server diterima lewat props dari page.tsx (Server Component), bukan
// di-import langsung di file "use client" ini - actions/orders.ts memakai
// "use server" inline per-fungsi, dan Next.js melarang inline "use server"
// di-import langsung oleh Client Component. Pola sama persis dengan
// provider-card.tsx (Task 9)/providers/page.tsx.

function RetryFulfillmentForm({
  orderId, orderNumber, retryFulfillmentAction,
}: { orderId: string; orderNumber: string; retryFulfillmentAction: ServerAction }) {
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

function RetryRefundForm({
  orderId, orderNumber, retryRefundAction,
}: { orderId: string; orderNumber: string; retryRefundAction: ServerAction }) {
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

function MarkCompletedManualForm({
  orderId, orderNumber, markCompletedManualAction,
}: { orderId: string; orderNumber: string; markCompletedManualAction: ServerAction }) {
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

function MarkRefundedForm({
  orderId, orderNumber, markRefundedAction,
}: { orderId: string; orderNumber: string; markRefundedAction: ServerAction }) {
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
  retryFulfillmentAction, retryRefundAction, markCompletedManualAction, markRefundedAction,
}: {
  orderId: string;
  orderNumber: string;
  status: string;
  canRetryRefund: boolean;
  retryFulfillmentAction: ServerAction;
  retryRefundAction: ServerAction;
  markCompletedManualAction: ServerAction;
  markRefundedAction: ServerAction;
}) {
  if (status === "NEEDS_REVIEW") {
    return (
      <div className="flex flex-col gap-4 rounded-xl ring-1 ring-foreground/10 p-4">
        <h2 className="text-sm font-semibold">Aksi</h2>
        {canRetryRefund ? (
          <RetryRefundForm orderId={orderId} orderNumber={orderNumber} retryRefundAction={retryRefundAction} />
        ) : (
          <RetryFulfillmentForm orderId={orderId} orderNumber={orderNumber} retryFulfillmentAction={retryFulfillmentAction} />
        )}
        <MarkCompletedManualForm orderId={orderId} orderNumber={orderNumber} markCompletedManualAction={markCompletedManualAction} />
      </div>
    );
  }

  if (status === "REFUND_PENDING") {
    return (
      <div className="flex flex-col gap-4 rounded-xl ring-1 ring-foreground/10 p-4">
        <h2 className="text-sm font-semibold">Aksi</h2>
        <MarkRefundedForm orderId={orderId} orderNumber={orderNumber} markRefundedAction={markRefundedAction} />
      </div>
    );
  }

  if (status === "PROCESSING") {
    return (
      <div className="flex flex-col gap-4 rounded-xl ring-1 ring-foreground/10 p-4">
        <h2 className="text-sm font-semibold">Aksi</h2>
        <MarkCompletedManualForm orderId={orderId} orderNumber={orderNumber} markCompletedManualAction={markCompletedManualAction} />
      </div>
    );
  }

  return null;
}
