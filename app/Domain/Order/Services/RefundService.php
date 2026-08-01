<?php

namespace App\Domain\Order\Services;

use App\Domain\Order\Models\Order;
use App\Domain\Order\Models\Refund;
use App\Domain\Wallet\Services\WalletService;
use Illuminate\Support\Facades\DB;

/**
 * Flows v1 Flow 9 + Database Architecture v2 §6.1a. Refund authority is
 * admin-only, never self-service for sellers or buyers (Flows v1 Flow 9
 * security note) — every public method here expects an $adminId and
 * should only ever be reachable from an Admin-surface controller.
 */
class RefundService
{
    public function __construct(
        private WalletService $walletService,
    ) {
    }

    /**
     * Flows v1 Flow 9, steps 2–3. Approves a refund and immediately
     * attempts the wallet-side clawback via WalletService. If the
     * seller's available balance fully covers it, the refund moves to
     * 'execution_pending' (ready for the manual buyer-side transfer,
     * Architecture v1 §7.3's baseline). If not, WalletService creates a
     * RefundDebt and this method sets status to 'pending_seller_balance'
     * instead — per Wildan's explicit "hold the refund until balance is
     * sufficient" decision.
     */
    public function approveRefund(
        Order $order,
        int $refundAmount,
        string $refundType,
        string $reason,
        int $adminId,
        ?int $disputeId = null,
    ): Refund {
        return DB::transaction(function () use ($order, $refundAmount, $refundType, $reason, $adminId, $disputeId) {
            $refund = Refund::create([
                'order_id' => $order->id,
                'dispute_id' => $disputeId,
                'refund_amount' => $refundAmount,
                'refund_type' => $refundType,
                'reason' => $reason,
                'status' => 'approved',
                'approved_by_admin_id' => $adminId,
            ]);

            $wallet = $order->store->wallet;
            $result = $this->walletService->recordRefundReversal($wallet, $refund->id, $refundAmount);

            if ($result['debt'] !== null) {
                $refund->status = 'pending_seller_balance';
            } else {
                $refund->status = 'execution_pending';
            }
            $refund->save();

            $order->status = $order->status === 'disputed' ? 'disputed' : 'refunded';
            $order->save();

            return $refund;
        });
    }

    /**
     * Flows v1 Flow 9, step 3b. Admin marks the actual buyer-side
     * transfer as done — this is the human-execution-gap step
     * (Architecture v1 §9's manual refund execution baseline, since not
     * all four chosen providers support API-based refunds). Only valid
     * from 'execution_pending' — a refund still in
     * 'pending_seller_balance' cannot be marked complete, since per
     * Wildan's decision the buyer should not receive money back until
     * the debt is resolved (or an admin explicitly overrides, which
     * this method intentionally does NOT support — see
     * markCompletedWithManualOverride() below for that exceptional path).
     */
    public function markCompleted(Refund $refund): Refund
    {
        if ($refund->status !== 'execution_pending') {
            throw new \DomainException(
                "Refund {$refund->id} cannot be marked completed from status '{$refund->status}'. ".
                "If it is held at 'pending_seller_balance', use markCompletedWithManualOverride() instead, ".
                'which requires an explicit admin decision to front the money.'
            );
        }

        $refund->status = 'completed';
        $refund->buyer_payment_returned_at = now();
        $refund->save();

        return $refund;
    }

    /**
     * The exceptional path flagged in Database Architecture v2 §3.10a:
     * an admin decides the platform will front the buyer's refund
     * despite the seller's debt not yet being fully recovered (e.g. a
     * trust/reputation decision for a high-value buyer, or a policy
     * time limit being reached). This does NOT touch the RefundDebt or
     * the seller's wallet at all — the debt continues being recovered
     * from future sales exactly as before; this method only unblocks
     * the buyer-facing side of the refund. This is a deliberate,
     * logged, admin-judgment action, never an automatic fallback.
     */
    public function markCompletedWithManualOverride(Refund $refund, int $adminId, string $overrideReason): Refund
    {
        if (! $refund->isHeldForSellerBalance()) {
            throw new \DomainException('Manual override is only applicable to refunds held at pending_seller_balance.');
        }

        $refund->status = 'completed';
        $refund->buyer_payment_returned_at = now();
        $refund->save();

        \Illuminate\Support\Facades\Log::warning('Refund completed via manual admin override despite outstanding seller debt.', [
            'refund_id' => $refund->id,
            'admin_id' => $adminId,
            'reason' => $overrideReason,
        ]);

        return $refund;
    }
}
