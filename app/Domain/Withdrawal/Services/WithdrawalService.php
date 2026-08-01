<?php

namespace App\Domain\Withdrawal\Services;

use App\Domain\Wallet\Models\SellerPayoutMethod;
use App\Domain\Wallet\Models\Wallet;
use App\Domain\Wallet\Services\WalletService;
use App\Domain\Withdrawal\DTOs\RequestWithdrawalData;
use App\Domain\Withdrawal\Models\Withdrawal;
use Illuminate\Support\Facades\DB;

/**
 * Database Architecture v2 §8 + §3.12. Implements the reservation
 * lifecycle exactly as specified: a withdrawal request reserves
 * cached_available_balance immediately via WalletService, but no
 * ledger entry is written until actual completion or release.
 */
class WithdrawalService
{
    public function __construct(
        private WalletService $walletService,
    ) {
    }

    /**
     * Flows v1 Flow 7, steps 1–2. Locks the wallet row (delegated to
     * WalletService::reserveWithdrawal()), validates against the
     * minimum threshold, creates the withdrawals row, and checks the
     * Flow 7 fraud signal: a payout method created very recently before
     * this request is flagged for mandatory admin review regardless of
     * amount — this is the capability that was structurally impossible
     * under v1's inline-destination-details design and is now real.
     */
    public function requestWithdrawal(Wallet $wallet, RequestWithdrawalData $data, int $minimumThreshold = 50_000): Withdrawal
    {
        if ($data->amountRequested < $minimumThreshold) {
            throw new \DomainException("Withdrawal amount must be at least Rp {$minimumThreshold}.");
        }

        $payoutMethod = SellerPayoutMethod::query()->findOrFail($data->payoutMethodId);

        if ($payoutMethod->store_id !== $data->storeId) {
            throw new \DomainException('This payout method does not belong to the requesting store.');
        }

        return DB::transaction(function () use ($wallet, $data, $payoutMethod) {
            // Reserve first — this throws if available balance is
            // insufficient, before any Withdrawal row is created.
            $this->walletService->reserveWithdrawal($wallet, $data->amountRequested);

            $withdrawal = Withdrawal::create([
                'wallet_id' => $wallet->id,
                'store_id' => $data->storeId,
                'payout_method_id' => $data->payoutMethodId,
                'amount_requested' => $data->amountRequested,
                'fee_amount' => $data->feeAmount,
                'amount_payable' => $data->amountRequested - $data->feeAmount,
                'status' => 'pending',
            ]);

            if ($payoutMethod->recentlyCreated()) {
                // Flows v1 Flow 7 fraud signal. MVP has no automated
                // hold mechanism beyond logging + relying on the fully-
                // manual admin review that already gates every
                // withdrawal — this flag is metadata for that review,
                // not an automatic block, since 100% of withdrawals are
                // manually reviewed in MVP regardless.
                \Illuminate\Support\Facades\Log::warning('Withdrawal requested against a recently-created payout method.', [
                    'withdrawal_id' => $withdrawal->id,
                    'payout_method_id' => $payoutMethod->id,
                    'payout_method_created_at' => $payoutMethod->created_at,
                ]);
            }

            return $withdrawal;
        });
    }

    /**
     * Admin approves: status moves to 'processing'. No ledger change —
     * per Database Architecture v2 §8.1, only completion or release
     * triggers a ledger entry.
     */
    public function approveWithdrawal(Withdrawal $withdrawal, int $adminId): Withdrawal
    {
        if ($withdrawal->status !== 'pending') {
            throw new \DomainException('Only pending withdrawals can be approved.');
        }

        $withdrawal->status = 'processing';
        $withdrawal->reviewed_by_admin_id = $adminId;
        $withdrawal->reviewed_at = now();
        $withdrawal->save();

        return $withdrawal;
    }

    /**
     * Admin marks the withdrawal as actually completed AFTER manually
     * executing the real bank/e-wallet transfer outside the system
     * (Architecture v1 §7.3's explicit MVP decision against automated
     * disbursement). This is the only point a debit_withdrawal ledger
     * entry is created.
     */
    public function markCompleted(Withdrawal $withdrawal): Withdrawal
    {
        if ($withdrawal->status !== 'processing') {
            throw new \DomainException('Only processing withdrawals can be marked completed.');
        }

        return DB::transaction(function () use ($withdrawal) {
            $this->walletService->recordWithdrawalCompletion($withdrawal->wallet, $withdrawal->id, $withdrawal->amount_requested);

            $withdrawal->status = 'completed';
            $withdrawal->completed_at = now();
            $withdrawal->save();

            return $withdrawal;
        });
    }

    /**
     * Admin declines a pending/processing withdrawal, or the real
     * transfer was attempted and failed. $asFailed distinguishes the
     * two for audit purposes (Flows v1 Flow 7 edge case) — both release
     * the reservation identically at the ledger level.
     */
    public function reject(Withdrawal $withdrawal, int $adminId, string $reason, bool $asFailed = false): Withdrawal
    {
        if ($withdrawal->isResolved()) {
            throw new \DomainException('This withdrawal has already been resolved.');
        }

        return DB::transaction(function () use ($withdrawal, $adminId, $reason, $asFailed) {
            $this->walletService->recordWithdrawalRelease($withdrawal->wallet, $withdrawal->id, $withdrawal->amount_requested);

            $withdrawal->status = $asFailed ? 'failed' : 'rejected';
            $withdrawal->reviewed_by_admin_id = $adminId;
            $withdrawal->reviewed_at = now();
            $withdrawal->failure_reason = $reason;
            $withdrawal->save();

            return $withdrawal;
        });
    }

    /**
     * Seller-initiated cancel — Flows v1 Flow 7 edge case. Only valid
     * while status='pending'; the model's canBeCancelledBySeller()
     * mirrors this same rule for UI-side checks, but the service is the
     * actual enforcement point.
     */
    public function cancelBySeller(Withdrawal $withdrawal): Withdrawal
    {
        if (! $withdrawal->canBeCancelledBySeller()) {
            throw new \DomainException('This withdrawal can no longer be cancelled — it is already being reviewed or processed.');
        }

        return DB::transaction(function () use ($withdrawal) {
            $this->walletService->recordWithdrawalRelease($withdrawal->wallet, $withdrawal->id, $withdrawal->amount_requested);

            $withdrawal->status = 'cancelled';
            $withdrawal->save();

            return $withdrawal;
        });
    }
}
