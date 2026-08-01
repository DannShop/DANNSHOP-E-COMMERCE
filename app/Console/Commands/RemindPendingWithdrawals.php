<?php

namespace App\Console\Commands;

use App\Domain\Withdrawal\Models\Withdrawal;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Flows v1 Flow 7's explicit operational risk for solo founders:
 * "a withdrawal request that sits unanswered for a week will produce
 * your worst possible reviews, regardless of how good the rest of
 * the product is." This command exists specifically to prevent that
 * from happening by accident.
 *
 * Logs a warning (visible in storage/logs/laravel.log) for every
 * pending withdrawal older than the threshold. In MVP, Wildan checks
 * logs / sets up a simple log-alert. If Wildan later integrates a
 * notification channel (Telegram bot, email), this is the one place
 * that integration goes — the detection logic here stays the same.
 *
 * Threshold: 24 hours. A seller who submitted a withdrawal yesterday
 * and hasn't heard anything is already starting to worry — the
 * "withdrawal anxiety" insight from Architecture v1 §2.1 makes 24h
 * the right trigger, not 3 days or a week.
 */
class RemindPendingWithdrawals extends Command
{
    protected $signature = 'withdrawals:remind-pending
                            {--hours=24 : Flag withdrawals older than this many hours as needing attention.}';

    protected $description = 'Log a warning for every pending withdrawal older than the configured hours — the operational safeguard against solo-founder review queue buildup.';

    public function handle(): int
    {
        $hours = (int) $this->option('hours');
        $threshold = now()->subHours($hours);

        $stale = Withdrawal::query()
            ->where('status', 'pending')
            ->where('created_at', '<', $threshold)
            ->with('store')
            ->get();

        if ($stale->isEmpty()) {
            return self::SUCCESS;
        }

        foreach ($stale as $withdrawal) {
            $ageHours = round(now()->diffInMinutes($withdrawal->created_at) / 60, 1);

            Log::warning('PENDING WITHDRAWAL NEEDS REVIEW: withdrawal has been waiting without admin action.', [
                'withdrawal_id' => $withdrawal->id,
                'store_name' => $withdrawal->store?->name,
                'store_slug' => $withdrawal->store?->slug,
                'amount_requested' => $withdrawal->amount_requested,
                'amount_formatted' => 'Rp '.number_format($withdrawal->amount_requested, 0, ',', '.'),
                'waiting_hours' => $ageHours,
                'submitted_at' => $withdrawal->created_at->toIso8601String(),
                'admin_action_url' => '/api/admin/withdrawals/'.$withdrawal->id.'/approve',
            ]);
        }

        $this->warn("⚠ {$stale->count()} pending withdrawal(s) have been waiting more than {$hours} hours. Check storage/logs/laravel.log.");

        return self::SUCCESS;
    }
}
