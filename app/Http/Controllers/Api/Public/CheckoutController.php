<?php

namespace App\Http\Controllers\Api\Public;

use App\Domain\Order\DTOs\CreateOrderData;
use App\Domain\Order\Models\Order;
use App\Domain\Order\Services\OrderService;
use App\Domain\Payment\Services\PaymentService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Public\CreateOrderRequest;
use App\Http\Resources\OrderResource;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;

/**
 * Flows v1 Flow 4 (Checkout) + Flow 5 (Payment), steps 1-2. This
 * controller is intentionally thin — it does request validation
 * (delegated to CreateOrderRequest) and response shaping (delegated to
 * OrderResource), but ALL business logic (price locking, commission
 * calculation, asset reservation, payment initiation) lives in
 * OrderService and PaymentService, called here, never reimplemented.
 *
 * Per Architecture v1 §9: guest checkout is mandatory, no auth
 * middleware on this controller's routes.
 */
class CheckoutController extends Controller
{
    use ApiResponse;

    public function __construct(
        private OrderService $orderService,
        private PaymentService $paymentService,
    ) {
    }

    /**
     * POST /api/orders
     * Creates the order (price-locked, asset-reserved if applicable),
     * then immediately initiates payment with the active gateway, in
     * one request — the buyer goes straight from "click buy" to seeing
     * a QRIS code, matching Flows v1 Flow 4→5's intended flow with no
     * intermediate step the buyer has to wait through.
     *
     * If asset reservation fails (out of stock — Flows v1 Flow 3's
     * concurrency edge case), OrderService::createOrder() throws before
     * any payment is ever initiated, and the buyer sees a clear
     * "out of stock" response rather than a payment screen for a
     * product that can't actually be delivered.
     */
    public function store(CreateOrderRequest $request): JsonResponse
    {
        try {
            $order = $this->orderService->createOrder(new CreateOrderData(
                productId: $request->integer('product_id'),
                buyerEmail: $request->string('buyer_email'),
                buyerPhone: $request->string('buyer_phone'),
                buyerUserId: $request->user()?->id, // null for guest checkout — Architecture v1 §9
            ));
        } catch (\DomainException $e) {
            // Flows v1 Flow 3: "publishes a product with zero stock" /
            // out-of-stock-at-purchase-time edge case surfaces here as
            // a clear, buyer-facing message rather than a generic 500.
            return $this->error($e->getMessage(), [], 422);
        }

        try {
            $order = $this->paymentService->initiatePayment($order);
        } catch (\RuntimeException $e) {
            // Architecture v1 §8.2: no active provider, or gateway
            // createPayment() call itself failed. Per Flows v1 Flow 5's
            // failure scenario: do NOT leave the buyer on a broken
            // screen — be honest that payment is temporarily
            // unavailable. The order row itself remains valid at
            // 'pending' and will auto-expire normally if never paid
            // (Flows v1 Flow 4) — we deliberately do not delete it here,
            // since the failure was in the payment step, not in order
            // creation itself.
            return $this->error(
                'Pembayaran sedang tidak tersedia, silakan coba beberapa saat lagi.',
                ['order_number' => $order->order_number],
                503
            );
        }

        return $this->success([
            'order' => new OrderResource($order),
            'payment' => $this->extractPaymentDisplayData($order),
        ], 201);
    }

    /**
     * GET /api/orders/{orderNumber}/status
     * Flows v1 Flow 4's failure scenario: a buyer whose payment-step
     * page failed to load after order creation must be able to recover
     * via a revisitable status page — this endpoint is what that page
     * polls/loads from, keyed on the human-readable order_number rather
     * than an internal numeric ID the buyer was never shown.
     */
    public function status(string $orderNumber): JsonResponse
    {
        $order = Order::query()->where('order_number', $orderNumber)->first();

        if ($order === null) {
            return $this->error('Pesanan tidak ditemukan.', [], 404);
        }

        return $this->success(new OrderResource($order));
    }

    /**
     * POST /api/order-lookup
     * Flows v1 §2.2's guest order-lookup flow: email/phone + order
     * number, the only recovery path for a buyer with no account.
     * Deliberately requires BOTH order_number AND the email/phone used
     * at checkout to match — looking up by order_number alone would let
     * anyone who saw a shared screenshot view someone else's order.
     */
    public function lookup(\Illuminate\Http\Request $request): JsonResponse
    {
        $request->validate([
            'order_number' => ['required', 'string'],
            'buyer_email' => ['required', 'email'],
        ]);

        $order = Order::query()
            ->where('order_number', $request->string('order_number'))
            ->where('buyer_email', $request->string('buyer_email'))
            ->with(['product', 'store'])
            ->first();

        if ($order === null) {
            // Deliberately generic — does not reveal whether the order
            // number exists but the email didn't match, vs neither
            // existing at all (same account-enumeration-style caution
            // as Flows v1 Flow 1's registration security note, applied
            // here to order data instead of account existence).
            return $this->error('Pesanan tidak ditemukan. Periksa kembali nomor pesanan dan email Anda.', [], 404);
        }

        return $this->success(new OrderResource($order));
    }

    /**
     * Shapes the payment-method-specific display data (QRIS image URL,
     * redirect URL) from the most recent payment_transactions row —
     * kept as a small private helper here rather than in OrderResource,
     * since this is checkout-flow-specific, not a general property of
     * every order representation.
     */
    private function extractPaymentDisplayData(Order $order): array
    {
        $transaction = $order->paymentTransactions()
            ->where('event_type', 'payment_created')
            ->latest('created_at')
            ->first();

        if ($transaction === null) {
            return [];
        }

        return [
            'qris_image_url' => $transaction->raw_payload['qris_payload'] ?? null,
            'redirect_url' => $transaction->raw_payload['redirect_url'] ?? null,
        ];
    }
}
