<?php

namespace App\Domain\Wallet\Services;

use App\Domain\Wallet\Models\LedgerTransactionGroup;
use App\Domain\Wallet\Models\RefundDebt;
use App\Domain\Wallet\Models\Wallet;
use App\Domain\Wallet\Models\WalletLedgerEntry;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Database Architecture v2 §6, §6.1a. THE single, exclusive entry point
 * for every wallet balance mutation in the entire system. No other
 * Domain, Controller, or Job is permitted to write directly to
 * `wallets` or `wallet_ledger_entries` — this is an architectural rule
 * stated in the Phase 1 Domain Architecture discussion, not just a
 * convention: OrderService, WithdrawalService, and the refund flow all
 * call into this class rather than touching those tables themselves.
 *
 * Every method here follows the same shape: lock the wallet row, write
 * a LedgerTransactionGroup + its WalletLedgerEntry rows, update the
 * wallet's cached columns, all inside one DB transaction. This is the
 * concrete implementation of the locking rule from Financial Ledger
 * Risk finding #20 (Database Architecture v2 §3.11) — concurrent writes
 * to the same wallet from two queue workers must never both read a
 * stale "current balance."
 */
class WalletService
{
    /**
     * Records a confirmed sale: credits the seller's wallet with the net
     * amount and debits the platform's commission, as a single
     * 2-entry ledger transaction group (or 3 entries if outstanding
     * debt exists — see recoverDebt() below, called from within this
     * same method when applicable).
     *
     * Called exclusively from OrderService::confirmPayment(), never
     * directly from a controller.
     */
    public function recordSale(Wallet $wallet, int $orderId, int $grossAmount, int $commissionAmount, int $netAmount): LedgerTransactionGroup
    {
        return DB::transaction(function () use ($wallet, $orderId, $grossAmount, $commissionAmount, $netAmount) {
            // Lock the wallet row for the entire duration of this transaction.
            // This is non-negotiable per Database Architecture v2 §3.11's
            // concurrency rule — without it, two near-simultaneous sales for
            // the same seller could both read a stale balance_after.
            $lockedWallet = Wallet::query()->lockForUpdate()->findOrFail($wallet->id);

            $outstandingDebt = $lockedWallet->refundDebts()->where('status', 'outstanding')->oldest()->first();

            $expectedEntryCount = $outstandingDebt ? 3 : 2;

            $group = LedgerTransactionGroup::create([
                'group_type' => 'sale',
                'reference_type' => 'order',
                'reference_id' => $orderId,
                'expected_entry_count' => $expectedEntryCount,
                'actual_entry_count' => 0,
                'created_at' => now(),
            ]);

            $runningBalance = $lockedWallet->cached_balance;

            // Entry 1: credit_sale (gross amount, full sale value recorded honestly)
            $runningBalance += $grossAmount;
            $this->writeEntry($group, $lockedWallet, 'credit_sale', $grossAmount, 'order', $orderId, $runningBalance);

            // Entry 2: debit_commission
            $runningBalance -= $commissionAmount;
            $this->writeEntry($group, $lockedWallet, 'debit_commission', -$commissionAmount, 'order', $orderId, $runningBalance);

            $netCredited = $netAmount;

            // Entry 3 (conditional): debt recovery, capped at 50% of this
            // sale's net_amount (Financial Ledger Risk finding #21 fix —
            // Database Architecture v2 §6.1a). The seller always sees at
            // least half of any sale land in available balance, even
            // mid-recovery.
            if ($outstandingDebt) {
                $recoveryCap = intdiv($netAmount, 2);
                $recoveryAmount = min($outstandingDebt->remainingAmount(), $recoveryCap);

                if ($recoveryAmount > 0) {
                    $runningBalance -= $recoveryAmount;
                    $this->writeEntry($group, $lockedWallet, 'debit_debt_recovery', -$recoveryAmount, 'refund_debt', $outstandingDebt->id, $runningBalance);

                    $outstandingDebt->amount_recovered += $recoveryAmount;
                    if ($outstandingDebt->amount_recovered >= $outstandingDebt->amount_owed) {
                        $outstandingDebt->status = 'fully_recovered';
                    }
                    $outstandingDebt->save();

                    $netCredited -= $recoveryAmount;

                    if ($outstandingDebt->isFullyRecovered()) {
                        $this->releaseHeldRefund($outstandingDebt);
                    }
                }
            }

            $lockedWallet->cached_balance = $runningBalance;
            $lockedWallet->cached_available_balance += $netCredited;
            $lockedWallet->cached_outstanding_debt = $lockedWallet->refundDebts()
                ->where('status', 'outstanding')
                ->sum(DB::raw('amount_owed - amount_recovered'));
            $lockedWallet->save();

            return $group;
        });
    }

    /**
     * Reserves a withdrawal amount: reduces cached_available_balance
     * immediately, but does NOT write a ledger entry yet — per
     * Database Architecture v2 §8.1, the reservation is a soft hold,
     * not a permanent ledger event. The ledger entry only happens at
     * actual completion (recordWithdrawalCompletion) or release
     * (recordWithdrawalRelease).
     */
    public function reserveWithdrawal(Wallet $wallet, int $amount): void
    {
        DB::transaction(function () use ($wallet, $amount) {
            $lockedWallet = Wallet::query()->lockForUpdate()->findOrFail($wallet->id);

            if ($lockedWallet->cached_available_balance < $amount) {
                throw new \DomainException('Insufficient available balance to reserve this withdrawal.');
            }

            $lockedWallet->cached_available_balance -= $amount;
            $lockedWallet->save();
        });
    }

    /**
     * Withdrawal actually completes: the real bank/e-wallet transfer has
     * happened (manually, per Architecture v1 §7.3's MVP decision). This
     * is the only point a debit_withdrawal ledger entry is created —
     * cached_balance (total) decreases here; cached_available_balance
     * was already decreased at reservation time, so it does not change
     * again.
     */
    public function recordWithdrawalCompletion(Wallet $wallet, int $withdrawalId, int $amount): LedgerTransactionGroup
    {
        return DB::transaction(function () use ($wallet, $withdrawalId, $amount) {
            $lockedWallet = Wallet::query()->lockForUpdate()->findOrFail($wallet->id);

            $group = LedgerTransactionGroup::create([
                'group_type' => 'withdrawal_completion',
                'reference_type' => 'withdrawal',
                'reference_id' => $withdrawalId,
                'expected_entry_count' => 1,
                'actual_entry_count' => 0,
                'created_at' => now(),
            ]);

            $newBalance = $lockedWallet->cached_balance - $amount;
            $this->writeEntry($group, $lockedWallet, 'debit_withdrawal', -$amount, 'withdrawal', $withdrawalId, $newBalance);

            $lockedWallet->cached_balance = $newBalance;
            $lockedWallet->save();

            return $group;
        });
    }

    /**
     * A reserved withdrawal is rejected, fails, or is cancelled before
     * completion: the hold is released back to available balance, and a
     * credit_withdrawal_release ledger entry records that this was a
     * reservation reversal, not new money entering the wallet
     * (cached_balance/total is unaffected — it was never reduced at
     * reservation time, only cached_available_balance was).
     */
    public function recordWithdrawalRelease(Wallet $wallet, int $withdrawalId, int $amount): LedgerTransactionGroup
    {
        return DB::transaction(function () use ($wallet, $withdrawalId, $amount) {
            $lockedWallet = Wallet::query()->lockForUpdate()->findOrFail($wallet->id);

            $group = LedgerTransactionGroup::create([
                'group_type' => 'withdrawal_release',
                'reference_type' => 'withdrawal',
                'reference_id' => $withdrawalId,
                'expected_entry_count' => 1,
                'actual_entry_count' => 0,
                'created_at' => now(),
            ]);

            // Note: this entry does not change cached_balance (no money
            // ever left), but it IS recorded in the ledger as a credit
            // because it reverses a reservation — see Database
            // Architecture v2 §8.1's asymmetry rationale.
            $this->writeEntry($group, $lockedWallet, 'credit_withdrawal_release', $amount, 'withdrawal', $withdrawalId, $lockedWallet->cached_balance);

            $lockedWallet->cached_available_balance += $amount;
            $lockedWallet->save();

            return $group;
        });
    }

    /**
     * A refund is approved against this seller's wallet. Debits whatever
     * the wallet CAN cover (down to zero, never below — Wildan's
     * decision). If the refund exceeds available balance, the shortfall
     * becomes a RefundDebt row and the caller (RefundService) is
     * responsible for setting the Refund's status to
     * 'pending_seller_balance' based on whether a debt was created.
     *
     * Returns the amount actually debited from the wallet (which may be
     * less than $refundAmount) and the RefundDebt if one was created.
     *
     * @return array{debited: int, debt: ?RefundDebt}
     */
    public function recordRefundReversal(Wallet $wallet, int $refundId, int $refundAmount): array
    {
        return DB::transaction(function () use ($wallet, $refundId, $refundAmount) {
            $lockedWallet = Wallet::query()->lockForUpdate()->findOrFail($wallet->id);

            $coverable = min($lockedWallet->cached_available_balance, $refundAmount);
            $shortfall = $refundAmount - $coverable;

            $group = LedgerTransactionGroup::create([
                'group_type' => 'refund',
                'reference_type' => 'order',
                'reference_id' => $refundId,
                'expected_entry_count' => 1,
                'actual_entry_count' => 0,
                'created_at' => now(),
            ]);

            $debt = null;

            if ($coverable > 0) {
                $newBalance = $lockedWallet->cached_balance - $coverable;
                $this->writeEntry($group, $lockedWallet, 'debit_refund_reversal', -$coverable, 'refund', $refundId, $newBalance);

                $lockedWallet->cached_balance = $newBalance;
                $lockedWallet->cached_available_balance -= $coverable;
            }

            if ($shortfall > 0) {
                $debt = RefundDebt::create([
                    'wallet_id' => $lockedWallet->id,
                    'refund_id' => $refundId,
                    'amount_owed' => $shortfall,
                    'amount_recovered' => 0,
                    'status' => 'outstanding',
                ]);

                $lockedWallet->cached_outstanding_debt += $shortfall;

                Log::warning('Refund exceeds available seller balance — debt created and refund held.', [
                    'wallet_id' => $lockedWallet->id,
                    'refund_id' => $refundId,
                    'shortfall' => $shortfall,
                ]);
            }

            $lockedWallet->save();

            return ['debited' => $coverable, 'debt' => $debt];
        });
    }

    /**
     * Called internally by recordSale() once a RefundDebt's
     * amount_recovered reaches amount_owed. Triggers the held refund's
     * transition out of 'pending_seller_balance' so RefundService's
     * execution job can pick it up. This method intentionally does NOT
     * execute the actual buyer-side transfer — it only flips the status
     * so the existing manual-execution workflow (Flows v1 Flow 9) takes
     * over from here, exactly as it would for a refund that never needed
     * to wait at all.
     */
    private function releaseHeldRefund(RefundDebt $debt): void
    {
        $refund = $debt->refund;
        if ($refund && $refund->status === 'pending_seller_balance') {
            $refund->status = 'execution_pending';
            $refund->save();

            Log::info('Refund debt fully recovered — refund released for execution.', [
                'refund_id' => $refund->id,
                'debt_id' => $debt->id,
            ]);
        }
    }

    /**
     * Shared helper for writing a single ledger entry and incrementing
     * its parent group's actual_entry_count in the same call —
     * guarantees the two never drift apart even across the multiple
     * call sites above.
     *
     * balance_after is asserted non-negative here, not silently clamped.
     * If a caller ever computes a negative balanceAfter, that is a real
     * calculation bug upstream (per Wildan's decision, wallet balance
     * must never go negative) — surfacing it as a thrown exception that
     * aborts the whole transaction is the correct behavior. Silently
     * clamping to zero would hide exactly the kind of arithmetic error
     * this ledger design exists to catch.
     */
    private function writeEntry(
        LedgerTransactionGroup $group,
        Wallet $wallet,
        string $entryType,
        int $signedAmount,
        string $referenceType,
        int $referenceId,
        int $balanceAfter,
        ?int $createdByAdminId = null,
        ?string $note = null,
    ): WalletLedgerEntry {
        if ($balanceAfter < 0) {
            throw new \RuntimeException(
                "WalletService computed a negative balance_after ({$balanceAfter}) for wallet {$wallet->id} ".
                "during entry_type={$entryType}. This indicates a calculation bug upstream, not a valid state — ".
                'aborting rather than silently clamping, per the never-negative invariant.'
            );
        }

        $entry = WalletLedgerEntry::create([
            'wallet_id' => $wallet->id,
            'transaction_group_id' => $group->id,
            'entry_type' => $entryType,
            'amount' => $signedAmount,
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'balance_after' => $balanceAfter,
            'note' => $note,
            'created_by_admin_id' => $createdByAdminId,
            'created_at' => now(),
        ]);

        $group->increment('actual_entry_count');

        return $entry;
    }
}
