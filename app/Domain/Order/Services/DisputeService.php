<?php

namespace App\Domain\Order\Services;

use App\Domain\Order\Models\Dispute;
use Illuminate\Support\Facades\DB;

/**
 * Flows v1 Flow 10's default-resolution-timeout policy, implemented
 * per Wildan's explicit decision (this session): when a dispute passes
 * its response_deadline with the seller still silent, the sweep
 * AUTO-RESOLVES THE STATUS to 'resolved_buyer_favor', but does NOT
 * auto-create a refund — that still goes through RefundService's
 * normal admin-approval gate (RefundService::approveRefund(), which
 * requires an explicit $adminId).
 *
 * This was a deliberate choice between three options Wildan was given:
 * (1) auto-refund using a fake 'system' admin — rejected, violates the
 * "refund authority is admin-only" rule from Flows v1 Flow 9's
 * security note; (3) flag/escalate only, no auto-resolve — rejected,
 * fails to solve the "indefinite dispute queue" operational burden
 * Flows v1 Flow 10 explicitly warns about. Option 2 (this
 * implementation) is the one that keeps BOTH principles intact:
 * progress happens automatically (status never hangs indefinitely),
 * but money authorization stays human.
 */
class DisputeService
{
    /**
     * Run by the scheduled sweep (see Console\Commands\SweepExpiredDisputes).
     * Finds every open dispute past its response_deadline and resolves
     * the STATUS only — leaving a clear, queryable signal
     * ('resolved_buyer_favor') that the admin still needs to act on by
     * actually approving a refund through the normal RefundService path.
     *
     * @return int Number of disputes auto-resolved this run.
     */
    public function sweepExpiredDisputes(): int
    {
        $count = 0;

        Dispute::query()
            ->whereIn('status', ['open', 'awaiting_seller_response'])
            ->whereNotNull('response_deadline')
            ->where('response_deadline', '<', now())
            ->each(function (Dispute $dispute) use (&$count) {
                DB::transaction(function () use ($dispute) {
                    $locked = Dispute::query()->lockForUpdate()->findOrFail($dispute->id);

                    if (! $locked->isOpen() || ! $locked->isPastDeadline()) {
                        // Race guard: seller responded or admin already
                        // acted between the query above and this lock —
                        // leave it alone.
                        return;
                    }

                    $locked->status = 'resolved_buyer_favor';
                    $locked->resolution_note = 'Otomatis diselesaikan demi keberpihakan kepada buyer — seller tidak merespons sebelum batas waktu. '.
                        'STATUS INI BUKAN OTORISASI REFUND — admin tetap harus meninjau dan menyetujui refund secara manual melalui RefundService.';
                    $locked->resolved_at = now();
                    $locked->save();
                });

                $count++;
            });

        return $count;
    }
}
