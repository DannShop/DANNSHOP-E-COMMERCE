<?php

namespace App\Console\Commands;

use App\Domain\Order\Services\DisputeService;
use Illuminate\Console\Command;

/**
 * Flows v1 Flow 10 + Wildan's explicit decision (this session, Option
 * 2): disputes past their response_deadline with the seller still
 * silent get their STATUS auto-resolved to buyer's favor, but the
 * actual refund still requires manual admin approval. See
 * DisputeService::sweepExpiredDisputes()'s docblock for the full
 * reasoning behind this specific policy.
 *
 * Should run less frequently than the money-critical commands (every
 * few hours is reasonable, since dispute deadlines are measured in
 * days, not minutes) — but is harmless to run every minute alongside
 * the others if Wildan prefers one uniform cron cadence for simplicity.
 */
class SweepExpiredDisputes extends Command
{
    protected $signature = 'disputes:sweep-expired';

    protected $description = 'Auto-resolve the STATUS (not the refund) of disputes past their response_deadline with no seller response, per Flows v1 Flow 10\'s timeout policy.';

    public function __construct(
        private DisputeService $disputeService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $count = $this->disputeService->sweepExpiredDisputes();

        if ($count > 0) {
            $this->info("Auto-resolved {$count} expired dispute(s) to buyer's favor (status only — refunds still require manual admin approval).");
        }

        return self::SUCCESS;
    }
}
