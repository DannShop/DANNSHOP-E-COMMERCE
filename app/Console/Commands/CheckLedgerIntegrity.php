<?php

namespace App\Console\Commands;

use App\Domain\Wallet\Models\LedgerTransactionGroup;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Database Architecture v2 §3.11a — the most important scheduled
 * command in the entire system. Finds every LedgerTransactionGroup
 * where actual_entry_count != expected_entry_count, which is, by
 * definition, an incomplete or corrupted financial transaction. This
 * is the concrete realization of the "any mismatch is a critical,
 * immediately-alerted integrity failure" principle stated in the core
 * invariant (§6.1).
 *
 * This command does NOT attempt to fix anything automatically — per
 * Database Architecture v2 §6's "never silently auto-corrected"
 * principle, a mismatch here means something went wrong in application
 * code (a bug), and fixing it requires understanding WHY before
 * touching any data. The job's only responsibility is to surface the
 * problem loudly (log + return a non-zero exit code if any mismatch is
 * found, so it's visible in cron output/monitoring) — never to guess
 * at a repair.
 *
 * Should run at least daily; running it more frequently (e.g. hourly)
 * costs almost nothing on a small dataset and catches problems sooner
 * — recommended on the same minute-level cron Wildan already has for
 * other commands, since Laravel's scheduler handles the actual
 * frequency (see this command's entry in routes/console.php's
 * schedule).
 */
class CheckLedgerIntegrity extends Command
{
    protected $signature = 'ledger:check-integrity';

    protected $description = 'Find any ledger_transaction_groups row where actual_entry_count does not match expected_entry_count — a critical financial integrity failure.';

    public function handle(): int
    {
        $mismatched = LedgerTransactionGroup::query()
            ->whereColumn('actual_entry_count', '!=', 'expected_entry_count')
            ->get();

        if ($mismatched->isEmpty()) {
            $this->info('Ledger integrity check passed — no mismatches found.');

            return self::SUCCESS;
        }

        foreach ($mismatched as $group) {
            Log::critical('LEDGER INTEGRITY VIOLATION: transaction group entry count mismatch.', [
                'transaction_group_id' => $group->id,
                'group_type' => $group->group_type,
                'reference_type' => $group->reference_type,
                'reference_id' => $group->reference_id,
                'expected_entry_count' => $group->expected_entry_count,
                'actual_entry_count' => $group->actual_entry_count,
                'created_at' => $group->created_at,
            ]);
        }

        $this->error("LEDGER INTEGRITY VIOLATION: {$mismatched->count()} mismatched transaction group(s) found. Check logs immediately.");

        // Non-zero exit code is deliberate: if this command is ever
        // wired into an external monitoring/alerting system (beyond
        // just the log line), a failing exit code is what most cron
        // monitoring tools key off of to notify a human.
        return self::FAILURE;
    }
}
