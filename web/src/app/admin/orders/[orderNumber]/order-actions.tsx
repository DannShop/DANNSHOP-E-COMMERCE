"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConfirmSubmit } from "@/components/ui/confirm-dialog";
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
  const formId = `retry-fulfillment-${orderId}`;
  return (
    <form id={formId} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <ConfirmSubmit
        formId={formId}
        tone="normal"
        title={`Kirim ulang ${orderNumber}?`}
        confirmLabel="Kirim ulang"
        trigger={
          <Button type="button" disabled={pending}>
            {pending ? "Memproses..." : "Coba Lagi"}
          </Button>
        }
        description={
          <p>
            Order ini akan dikirim ulang ke provider. Kalau percobaan sebelumnya ternyata <em>sudah</em> berhasil di
            sisi provider, pengiriman kedua bisa berujung barang terkirim dua kali — pastikan statusnya benar-benar
            gagal dulu.
          </p>
        }
      />
      <ActionMessage state={state} />
    </form>
  );
}

function RetryRefundForm({
  orderId, orderNumber, retryRefundAction,
}: { orderId: string; orderNumber: string; retryRefundAction: ServerAction }) {
  const [state, formAction, pending] = useActionState(withPrevState(retryRefundAction), INITIAL_STATE);
  const formId = `retry-refund-${orderId}`;
  return (
    <form id={formId} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <ConfirmSubmit
        formId={formId}
        tone="normal"
        title={`Ulangi kredit refund ${orderNumber}?`}
        confirmLabel="Kredit ulang"
        trigger={
          <Button type="button" disabled={pending} variant="outline">
            {pending ? "Memproses..." : "Coba Refund Ulang"}
          </Button>
        }
        description={<p>Saldo member akan dikredit ulang sebesar nilai refund order ini.</p>}
      />
      <ActionMessage state={state} />
    </form>
  );
}

function MarkCompletedManualForm({
  orderId, orderNumber, markCompletedManualAction,
}: { orderId: string; orderNumber: string; markCompletedManualAction: ServerAction }) {
  const [state, formAction, pending] = useActionState(withPrevState(markCompletedManualAction), INITIAL_STATE);
  const formId = `mark-completed-${orderId}`;
  return (
    <form id={formId} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <Label htmlFor="sn">SN / kode voucher</Label>
      <Textarea id="sn" name="sn" rows={2} maxLength={191} placeholder="Isi SN/kode voucher yang diberikan ke pembeli" required />
      <ConfirmSubmit
        formId={formId}
        title={`Tandai ${orderNumber} selesai?`}
        confirmLabel="Tandai selesai"
        trigger={
          <Button type="button" disabled={pending} variant="secondary">
            {pending ? "Memproses..." : "Tandai Selesai Manual"}
          </Button>
        }
        description={
          <>
            <p>Pastikan barang/voucher-nya sudah benar-benar terkirim ke pembeli.</p>
            <p>SN yang kamu isi akan tampil di invoice dan email pembeli.</p>
          </>
        }
      />
      <ActionMessage state={state} />
    </form>
  );
}

function MarkRefundedForm({
  orderId, orderNumber, markRefundedAction,
}: { orderId: string; orderNumber: string; markRefundedAction: ServerAction }) {
  const [state, formAction, pending] = useActionState(withPrevState(markRefundedAction), INITIAL_STATE);
  const formId = `mark-refunded-${orderId}`;
  return (
    <form id={formId} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <Label htmlFor="note">Catatan (nomor referensi transfer)</Label>
      <Textarea id="note" name="note" rows={2} maxLength={191} placeholder="Mis. transfer BCA 29/07 12:34, ref 123456" required />
      <ConfirmSubmit
        formId={formId}
        title={`Tandai ${orderNumber} sudah direfund?`}
        confirmLabel="Tandai direfund"
        trigger={
          <Button type="button" disabled={pending} variant="secondary">
            {pending ? "Memproses..." : "Tandai Sudah Direfund"}
          </Button>
        }
        description={
          <p>
            Pastikan transfernya sudah benar-benar dilakukan. Menandai lebih dulu membuat order terlihat beres padahal
            uangnya belum sampai ke pembeli.
          </p>
        }
      />
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
