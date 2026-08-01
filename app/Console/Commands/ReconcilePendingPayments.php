<?php

namespace App\Console\Commands;

use App\Domain\Payment\Services\PaymentService;
use Illuminate\Console\Command;

/**
 * Architecture v1 §8.4's reconciliation fallback. Confirmed this
 * session: this is NOT a pure safety net for every provider — Midtrans/
 * Xendit have genuinely reliable webhooks, but Duitku's signature
 * scheme uncertainty (DuitkuGateway's docblock) and iPaymu's KYC-gated
 * activation mean this polling job may be the ONLY confirmation path
 * that actually works reliably until those gateways are battle-tested
 * against Wildan's real accounts. Must run frequently — every minute,
 * matching the order-expiry sweep's cadence — since a payment
 * confirmed only by polling is, by definition, slower than one
 * confirmed by webhook, and that gap should be minimized.
 */
class ReconcilePendingPayments extends Command
{
    protected $signature = 'payments:reconcile';

    protected $description = 'Poll the active payment gateway for status updates on orders still pending — the fallback (or, for some gateways, primary) confirmation path per Architecture v1 §8.4.';

    public function __construct(
        private PaymentService $paymentService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        try {
            $count = $this->paymentService->reconcilePendingOrders();
        } catch (\RuntimeException $e) {
            // No active provider configured — not an error worth
            // failing the scheduler over, just nothing to reconcile.
            $this->info('Reconciliation skipped: '.$e->getMessage());

            return self::SUCCESS;
        }

        if ($count > 0) {
            $this->info("Reconciled {$count} order(s) via gateway status poll.");
        }

        return self::SUCCESS;
    }
}
