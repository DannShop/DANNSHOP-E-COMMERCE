<?php

namespace App\Console\Commands;

use App\Domain\Wallet\Models\Wallet;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Database Architecture v2 §6.1's core invariant, the OTHER half of
 * financial integrity alongside CheckLedgerIntegrity: wallets.cached_balance
 * must always equal SUM(wallet_ledger_entries.amount WHERE wallet_id = X).
 * This is a DIFFERENT failure mode than the ledger integrity check —
 * a transaction group can be perfectly complete (all expected entries
 * present) while the wallet's cached_balance column has still drifted
 * from the true sum, e.g. if a future code path ever updates
 * cached_balance without going through WalletService at all (the
 * "shortcut a future dev might be tempted to take" scenario explicitly
 * warned about in Database Architecture v2 §6's closing rule).
 *
 * Like CheckLedgerIntegrity, this NEVER auto-corrects a mismatch — it
 * only detects and loudly reports. Auto-fixing a balance discrepancy
 * would erase the evidence needed to find the root-cause bug, which is
 * a worse outcome than a temporarily-wrong cached column once the
 * ledger itself (the true source of truth) is intact.
 *
 * Updates wallets.last_reconciled_at on every run (success or failure)
 * so it's visible from the wallet record itself when reconciliation
 * last actually checked it — useful both operationally and as a
 * sanity check that this scheduled command is actually running.
 */
class ReconcileWalletBalances extends Command
{
    protected $signature = 'wallets:reconcile';

    protected $description = 'Verify every wallet\'s cached_balance matches the true sum of its ledger entries — the core financial invariant from Database Architecture v2 §6.1.';

    public function handle(): int
    {
        $mismatchCount = 0;

        Wallet::query()->each(function (Wallet $wallet) use (&$mismatchCount) {
            $trueSum = (int) DB::table('wallet_ledger_entries')
                ->where('wallet_id', $wallet->id)
                ->sum('amount');

            if ($trueSum !== $wallet->cached_balance) {
                $mismatchCount++;

                Log::critical('WALLET BALANCE MISMATCH: cached_balance does not match true ledger sum.', [
                    'wallet_id' => $wallet->id,
                    'store_id' => $wallet->store_id,
                    'cached_balance' => $wallet->cached_balance,
                    'true_ledger_sum' => $trueSum,
                    'difference' => $trueSum - $wallet->cached_balance,
                ]);

                // Deliberately NOT auto-correcting cached_balance here —
                // see docblock. last_reconciled_at is still updated so
                // we have an accurate record of when this wallet was
                // last checked, even though it failed.
            }

            $wallet->last_reconciled_at = now();
            $wallet->save();
        });

        if ($mismatchCount === 0) {
            $this->info('Wallet reconciliation passed — all balances match their ledger sum.');

            return self::SUCCESS;
        }

        $this->error("WALLET BALANCE MISMATCH: {$mismatchCount} wallet(s) have drifted from their true ledger sum. Check logs immediately.");

        return self::FAILURE;
    }
}
