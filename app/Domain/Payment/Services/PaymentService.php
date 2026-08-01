<?php

namespace App\Domain\Payment\Services;

use App\Domain\Order\Models\Order;
use App\Domain\Order\Services\OrderService;
use App\Domain\Payment\DTOs\PaymentRequestData;
use App\Domain\Payment\Gateways\PaymentGatewayManager;
use App\Domain\Payment\Models\PaymentProvider;
use App\Domain\Payment\Models\PaymentTransaction;
use App\Domain\Payment\Models\UnmatchedPayment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Architecture v1 §8.3, §8.4. Orchestrates the payment lifecycle:
 * initiating a payment via the active gateway, processing inbound
 * webhooks with idempotency, and reconciling stale pending orders by
 * polling. PaymentService never calls a concrete Gateway class
 * directly — always through PaymentGatewayManager, never bypassing the
 * abstraction even internally.
 */
class PaymentService
{
    public function __construct(
        private PaymentGatewayManager $gatewayManager,
        private OrderService $orderService,
    ) {
    }

    /**
     * Flows v1 Flow 5, step 1. Computes the static-QRIS uniqueness
     * offset (Architecture v1 §8.3) ONLY when the active gateway
     * doesn't support dynamic QRIS. This check is fully dynamic
     * (reads gateway->supportsDynamicQris()) so it requires no changes
     * as gateways are added/swapped — Midtrans, Xendit, and iPaymu are
     * all confirmed dynamic-QRIS (no offset applied); Duitku's dynamic-
     * QRIS support is assumed but not independently confirmed this
     * session (see DuitkuGateway's docblock) — if that assumption is
     * wrong, this offset logic activates automatically as a safety net,
     * since supportsDynamicQris() would need to be corrected to false
     * to reflect reality. Stores payable_amount distinctly from
     * gross_amount per Database Architecture v2 §9.3 — wallet/commission
     * calculations must never read payable_amount.
     */
    public function initiatePayment(Order $order): Order
    {
        $gateway = $this->gatewayManager->resolveActive();
        $provider = PaymentProvider::query()->where('provider_key', $gateway->providerKey())->firstOrFail();

        $payableAmount = $order->gross_amount;
        if (! $gateway->supportsDynamicQris()) {
            // Small randomized offset (Rp 1–99) for amount-matching
            // disambiguation — never used in any wallet/commission
            // calculation, which always derive from gross_amount.
            $payableAmount += random_int(1, 99);
        }

        $response = $gateway->createPayment(new PaymentRequestData(
            orderId: $order->id,
            orderNumber: $order->order_number,
            amount: $payableAmount,
            buyerEmail: $order->buyer_email,
            buyerPhone: $order->buyer_phone,
        ));

        $order->payment_provider_id = $provider->id;
        $order->payable_amount = $payableAmount;
        $order->save();

        PaymentTransaction::create([
            'order_id' => $order->id,
            'payment_provider_id' => $provider->id,
            'provider_reference' => $response->providerReference,
            'event_type' => 'payment_created',
            'raw_payload' => ['qris_payload' => $response->qrisPayload, 'redirect_url' => $response->redirectUrl],
            'status' => 'pending',
            'attempted_at' => now(),
            'created_at' => now(),
        ]);

        return $order;
    }

    /**
     * Flows v1 Flow 5, steps 3–4 + Architecture v1 §8.4's idempotency
     * requirement. The webhook route handler calls this AFTER
     * verifyWebhookSignature() has already returned true — this method
     * does not re-verify the signature itself, that is the controller's
     * responsibility per the gateway contract.
     *
     * Idempotency is enforced at TWO layers, deliberately: the
     * existence check below is the primary defense (returns a clean
     * "already processed" outcome), and the UNIQUE(payment_provider_id,
     * provider_reference) DB constraint on payment_transactions is the
     * backstop if this check is ever raced or bypassed by a bug.
     *
     * BUG FIX (this session, found while integrating Midtrans): order
     * lookup is now keyed on orderNumber, not providerReference.
     * Midtrans confirmed-documented behavior sends a DIFFERENT
     * transaction_id (providerReference) for each payment attempt on
     * the same order (e.g. a failed card try, then a successful QRIS
     * try) — looking up by providerReference would fail to find the
     * order for any attempt after the first, silently routing real
     * successful payments into the unmatched_payments queue instead of
     * confirming them. orderNumber is the one identifier every gateway
     * echoes back unchanged across every attempt.
     */
    public function handleWebhook(string $providerKey, Request $request): void
    {
        $gateway = $this->gatewayManager->resolve($providerKey);

        if (! $gateway->verifyWebhookSignature($request)) {
            Log::error('Webhook signature verification failed — rejecting.', ['provider' => $providerKey]);
            throw new \RuntimeException('Invalid webhook signature.');
        }

        $payload = $gateway->parseWebhookPayload($request);
        $provider = PaymentProvider::query()->where('provider_key', $providerKey)->firstOrFail();

        $alreadyProcessed = PaymentTransaction::query()
            ->where('payment_provider_id', $provider->id)
            ->where('provider_reference', $payload->providerReference)
            ->where('event_type', 'webhook_received')
            ->exists();

        if ($alreadyProcessed) {
            Log::info('Duplicate webhook ignored (idempotency check).', ['provider_reference' => $payload->providerReference]);
            return;
        }

        DB::transaction(function () use ($payload, $provider) {
            $order = Order::query()->where('order_number', $payload->orderNumber)->first();

            PaymentTransaction::create([
                'order_id' => $order?->id,
                'payment_provider_id' => $provider->id,
                'provider_reference' => $payload->providerReference,
                'event_type' => 'webhook_received',
                'raw_payload' => $payload->rawPayload,
                'status' => $payload->status,
                'confirmed_at' => now(),
                'created_at' => now(),
            ]);

            if ($payload->status === 'success') {
                if ($order) {
                    $this->orderService->confirmPayment($order);
                } else {
                    Log::warning('Webhook reported success but no matching order_number was found.', [
                        'order_number' => $payload->orderNumber,
                        'provider_reference' => $payload->providerReference,
                    ]);
                }
            }
            // Confirmed Midtrans behavior (and assumed similar for other
            // gateways with multi-attempt flows): a 'failed' status here
            // for one attempt does NOT mean the order itself failed — the
            // customer may still succeed via a different payment method
            // on a subsequent attempt. We deliberately do NOT mark the
            // order as failed/cancelled on a single failed notification;
            // we simply log the attempt via the payment_transactions row
            // above and wait for either a success notification or the
            // order's own expires_at to be reached
            // (OrderService::expireStaleOrders()).
        });
    }

    /**
     * Architecture v1 §8.4's reconciliation fallback. For Midtrans and
     * Xendit, webhooks are the primary confirmation path and this is a
     * genuine fallback for missed notifications. If Duitku's webhook
     * support turns out to be less reliable than assumed (see
     * DuitkuGateway's docblock), this job becomes load-bearing for that
     * provider instead of a pure safety net. Run as a scheduled
     * command, never synchronously from a request.
     */
    public function reconcilePendingOrders(): int
    {
        $gateway = $this->gatewayManager->resolveActive();
        $reconciled = 0;

        Order::query()
            ->where('status', 'pending')
            ->whereNotNull('payment_provider_id')
            ->whereNotNull('payable_amount')
            ->where('created_at', '>', now()->subHours(24)) // don't poll indefinitely for very old orders — they'll be caught by expireStaleOrders() instead
            ->each(function (Order $order) use ($gateway, &$reconciled) {
                $transaction = $order->paymentTransactions()->where('event_type', 'payment_created')->first();
                if (! $transaction) {
                    return;
                }

                $status = $gateway->checkStatus($transaction->provider_reference);

                if ($status->status === 'success') {
                    $this->orderService->confirmPayment($order);
                    $reconciled++;
                }
            });

        return $reconciled;
    }

    /**
     * Flows v1 Flow 5: a payment arrived that couldn't be automatically
     * tied to an order — surfaced to the admin's unmatched-payments
     * review queue rather than silently dropped or incorrectly applied.
     * Retained for static-QRIS scenarios (relevant if Duitku's dynamic-
     * QRIS support, assumed but not confirmed this session, turns out
     * to be incorrect) — not currently called from handleWebhook()'s
     * main path, since Midtrans/Xendit always provide a matchable
     * order_number and a missing match there indicates a real anomaly
     * worth a direct warning log instead, not a static-QRIS-style
     * ambiguity queue entry.
     */
    private function recordUnmatched(PaymentProvider $provider, $payload): void
    {
        UnmatchedPayment::create([
            'payment_provider_id' => $provider->id,
            'amount_received' => $payload->amountPaid,
            'provider_reference' => $payload->providerReference,
            'raw_payload' => $payload->rawPayload,
            'status' => 'unmatched',
        ]);

        Log::warning('Payment received but could not be matched to an order — added to unmatched_payments queue.', [
            'provider_reference' => $payload->providerReference,
            'amount' => $payload->amountPaid,
        ]);
    }
}
