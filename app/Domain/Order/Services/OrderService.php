<?php

namespace App\Domain\Order\Services;

use App\Domain\Order\DTOs\CreateOrderData;
use App\Domain\Order\Models\Order;
use App\Domain\Order\Models\OrderFulfillment;
use App\Domain\Order\Models\OrderStatusHistory;
use App\Domain\Product\Models\Product;
use App\Domain\Product\Services\ProductService;
use App\Domain\Wallet\Services\CommissionService;
use App\Domain\Wallet\Services\WalletService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Flows v1 Flow 3 (Product, for the price-lock/reservation edge cases)
 * and Flow 4 (Checkout). This is the orchestrator that ties Product,
 * Commission, and Wallet domains together for the order lifecycle —
 * exactly the kind of cross-domain coordination that belongs in a
 * Service, never in a Controller (Phase 1 Domain Architecture's
 * dependency graph: Order depends on Product, Payment, Commission;
 * all of them write to Wallet only through WalletService).
 */
class OrderService
{
    public function __construct(
        private ProductService $productService,
        private CommissionService $commissionService,
        private WalletService $walletService,
    ) {
    }

    /**
     * Flows v1 Flow 4, step 1 + Flow 3's price-lock edge case.
     * gross_amount/commission_amount/net_amount are computed and locked
     * HERE, at creation time — never re-derived from live products.price
     * later. If the product uses an asset pool, the reservation happens
     * inside the same transaction as order creation, so a failure
     * anywhere in this method rolls back both atomically (no leaked
     * 'reserved' asset with no corresponding order).
     */
    public function createOrder(CreateOrderData $data): Order
    {
        return DB::transaction(function () use ($data) {
            $product = Product::query()->lockForUpdate()->findOrFail($data->productId);

            if (! $product->isActive()) {
                throw new \DomainException("Product {$product->id} is not currently available for purchase.");
            }

            $grossAmount = $product->price;
            $rule = $this->commissionService->getActiveRule('store', $product->store_id);
            $commissionAmount = $this->commissionService->calculateCommission($rule, $grossAmount);
            $netAmount = $grossAmount - $commissionAmount;

            $order = Order::create([
                'order_number' => $this->generateOrderNumber(),
                'store_id' => $product->store_id,
                'product_id' => $product->id,
                'buyer_user_id' => $data->buyerUserId,
                'buyer_email' => $data->buyerEmail,
                'buyer_phone' => $data->buyerPhone,
                'gross_amount' => $grossAmount,
                'commission_amount' => $commissionAmount,
                'net_amount' => $netAmount,
                'commission_rule_id' => $rule->id,
                'status' => 'pending',
                // Flows v1 Flow 4 edge case: abandoned pending orders
                // auto-expire — see expireStaleOrders() below.
                'expires_at' => now()->addMinutes(45),
            ]);

            $this->recordStatusChange($order, null, 'pending', 'system', null, 'Order created at checkout.');

            // Reservation happens inside this same transaction. If this
            // throws (out of stock), the whole order creation rolls back
            // — the buyer sees "out of stock," not a phantom pending order.
            if ($product->usesAssetPool()) {
                $this->productService->reserveAsset($product, $order->id);
            } elseif ($product->stock_mode === 'limited') {
                $this->productService->decrementLimitedStock($product);
            }

            return $order;
        });
    }

    /**
     * Flows v1 Flow 5, step 4. Called by PaymentService's webhook
     * handler once a payment is verified and confirmed — never called
     * directly by a controller. This is where the seller's wallet
     * actually gets credited.
     *
     * Handles the edge case from Flows v1 Flow 5: a webhook arriving for
     * an order that already auto-expired due to a timing race with the
     * cleanup job. Real money was received — the order is revived
     * (cancelled/expired → paid) rather than the payment being rejected
     * over an internal scheduling coincidence.
     */
    public function confirmPayment(Order $order): Order
    {
        return DB::transaction(function () use ($order) {
            $lockedOrder = Order::query()->lockForUpdate()->findOrFail($order->id);

            if ($lockedOrder->isPaid()) {
                // Idempotency at the order level, mirroring the
                // payment_transactions unique-index idempotency guarantee
                // — if this is somehow called twice for the same order
                // (e.g. webhook + reconciliation poll both firing), the
                // second call is a safe no-op rather than a double-credit.
                return $lockedOrder;
            }

            $previousStatus = $lockedOrder->status;
            $lockedOrder->status = 'paid';
            $lockedOrder->save();

            $this->recordStatusChange($lockedOrder, $previousStatus, 'paid', 'system', null, 'Payment confirmed via webhook/reconciliation.');

            $wallet = $lockedOrder->store->wallet;
            $this->walletService->recordSale(
                $wallet,
                $lockedOrder->id,
                $lockedOrder->gross_amount,
                $lockedOrder->commission_amount,
                $lockedOrder->net_amount,
            );

            $product = $lockedOrder->product;
            if ($product->usesAssetPool()) {
                $asset = $product->assets()->where('reserved_by_order_id', $lockedOrder->id)->first();
                if ($asset) {
                    $this->productService->markAssetSold($asset, $lockedOrder->id);
                    $this->createFulfillmentRecord($lockedOrder, $asset->id);
                }
            } elseif ($product->usesUnlimitedAsset()) {
                // Bug fix (Wildan-flagged): an unlimited digital_file
                // product (e.g. an ebook) has exactly one product_assets
                // row that is read and delivered to every buyer — it is
                // never reserved, never marked sold, and never
                // decremented. Every order still gets its OWN
                // order_fulfillments row pointing at that shared asset,
                // because Flows v1 Flow 10's dispute evidence ("what
                // exactly was delivered, when") is per-order, not
                // per-product — two different buyers downloading the
                // same file need two distinct delivered_at timestamps.
                $asset = $product->assets()->where('asset_type', 'file')->first();
                if ($asset === null) {
                    throw new \DomainException("Product {$product->id} has no file asset configured for delivery.");
                }
                $this->createFulfillmentRecord($lockedOrder, $asset->id);
            }
            // isManualFulfillment() products intentionally create NO
            // order_fulfillments row here — that row is created later,
            // by the seller's explicit fulfillment action (a future
            // SellerController endpoint, not yet built), which is what
            // "manual" means: payment confirming does not equal
            // delivery happening for this fulfillment_mode.

            // Automatic fulfillment completes the order immediately;
            // manual fulfillment waits for the seller's explicit action
            // (Flows v1 Flow 3 — order_fulfillments tracks that
            // separately from this status).
            if ($product->fulfillment_mode === 'automatic') {
                $this->recordStatusChange($lockedOrder, 'paid', 'fulfilled', 'system', null, 'Automatic fulfillment.');
                $lockedOrder->status = 'fulfilled';
                $lockedOrder->save();
            }

            return $lockedOrder;
        });
    }

    /**
     * Flows v1 Flow 4 edge case: abandoned pending orders auto-expire
     * after the window set in createOrder(). Run as a scheduled command
     * (see Console/Commands), never called synchronously from a
     * request. Releases any reserved asset back to available stock.
     */
    public function expireStaleOrders(): int
    {
        $expired = 0;

        Order::query()
            ->where('status', 'pending')
            ->where('expires_at', '<', now())
            ->each(function (Order $order) use (&$expired) {
                DB::transaction(function () use ($order) {
                    $lockedOrder = Order::query()->lockForUpdate()->findOrFail($order->id);

                    if ($lockedOrder->status !== 'pending') {
                        // Payment won the race against this expiry sweep
                        // between the query above and this lock — leave
                        // it alone, per Flows v1 Flow 5's edge case.
                        return;
                    }

                    $this->recordStatusChange($lockedOrder, 'pending', 'expired', 'system', null, 'Auto-expired: no payment received within window.');
                    $lockedOrder->status = 'expired';
                    $lockedOrder->save();

                    $product = $lockedOrder->product;
                    if ($product->usesAssetPool()) {
                        $asset = $product->assets()->where('reserved_by_order_id', $lockedOrder->id)->first();
                        if ($asset) {
                            $this->productService->releaseAsset($asset);
                        }
                    }
                });

                $expired++;
            });

        return $expired;
    }

    private function recordStatusChange(
        Order $order,
        ?string $fromStatus,
        string $toStatus,
        string $changedByType,
        ?int $changedById,
        ?string $note = null,
    ): void {
        OrderStatusHistory::create([
            'order_id' => $order->id,
            'from_status' => $fromStatus,
            'to_status' => $toStatus,
            'changed_by_type' => $changedByType,
            'changed_by_id' => $changedById,
            'note' => $note,
            'created_at' => now(),
        ]);
    }

    /**
     * Closes the order_fulfillments gap flagged by Wildan: every order
     * that gets delivered via an asset (license_pool or unlimited
     * digital_file) gets its own fulfillment record, with delivered_at
     * set immediately since both these fulfillment_modes are
     * 'automatic' — there is no human action to wait for. delivered_by
     * stays null, since that column is reserved for the seller's
     * user_id on manual fulfillment (Database Architecture v2 §3.8) —
     * an automatic delivery has no human "deliverer."
     *
     * This is deliberately NOT called for isManualFulfillment()
     * products — see the comment at the confirmPayment() call site for
     * why that case creates its fulfillment record later instead.
     */
    private function createFulfillmentRecord(Order $order, int $assetId): OrderFulfillment
    {
        return OrderFulfillment::create([
            'order_id' => $order->id,
            'delivered_asset_id' => $assetId,
            'delivered_at' => now(),
            'delivered_by' => null,
            'notes' => null,
        ]);
    }

    private function generateOrderNumber(): string
    {
        // DS-20260620-00001 style — human-readable, per Database
        // Architecture v2 §3.7. The random suffix avoids a sequential
        // counter query under concurrent order creation; collision risk
        // is negligible at this scale (36^6 combinations per day) and
        // the column is UNIQUE-enforced regardless.
        //
        // HONEST GAP, flagged rather than hidden: if a collision does
        // occur, Order::create() above will throw a DB unique-constraint
        // exception and the whole createOrder() transaction rolls back
        // — the buyer would see a generic error rather than a
        // transparent retry. A production-hardened version should wrap
        // the create() call in a small retry loop (e.g. 3 attempts with
        // a fresh random suffix) before surfacing a failure. Deferred
        // here deliberately rather than adding untested retry logic
        // during this architecture pass — flag this as a Phase 2
        // hardening item, not a solved problem.
        return 'DS-'.now()->format('Ymd').'-'.Str::upper(Str::random(6));
    }
}
