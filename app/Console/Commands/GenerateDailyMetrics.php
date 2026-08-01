<?php

namespace App\Console\Commands;

use App\Domain\Store\Models\Store;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Database Architecture v2 §10.1 + §10.2. Runs nightly to populate
 * yesterday's row per active store (daily_store_metrics) and the
 * platform-wide aggregate (daily_platform_metrics). This is what
 * makes the seller's "Sales This Month" and Wildan's admin overview
 * fast reads — without this, every dashboard page load would scan
 * the full orders table, which is expensive even at low volume and
 * increasingly slow as history accumulates.
 *
 * Runs AFTER wallets:reconcile (02:00) to avoid competing locks on
 * the same low-traffic window — scheduled at 03:00.
 *
 * Idempotent: uses UPSERT (updateOrInsert) so re-running for the
 * same date is safe — useful if the cron missed a night or if Wildan
 * needs to backfill a specific date manually via artisan.
 */
class GenerateDailyMetrics extends Command
{
    protected $signature = 'metrics:generate-daily
                            {--date= : Specific date to generate (YYYY-MM-DD). Defaults to yesterday.}';

    protected $description = 'Generate daily_store_metrics and daily_platform_metrics aggregates for yesterday (or a specified date).';

    public function handle(): int
    {
        $date = $this->option('date')
            ? Carbon::parse($this->option('date'))->toDateString()
            : now()->subDay()->toDateString();

        $this->info("Generating daily metrics for {$date}...");

        $this->generateStoreMetrics($date);
        $this->generatePlatformMetrics($date);

        $this->info("Done.");

        return self::SUCCESS;
    }

    private function generateStoreMetrics(string $date): void
    {
        $storeMetrics = DB::table('orders')
            ->select(
                'store_id',
                DB::raw('SUM(gross_amount) as gross_sales'),
                DB::raw('SUM(commission_amount) as commission_paid'),
                DB::raw('SUM(net_amount) as net_revenue'),
                DB::raw('COUNT(*) as order_count'),
            )
            ->whereDate('created_at', $date)
            ->whereIn('status', ['paid', 'fulfilled', 'completed'])
            ->groupBy('store_id')
            ->get();

        $refundMetrics = DB::table('refunds')
            ->join('orders', 'refunds.order_id', '=', 'orders.id')
            ->select(
                'orders.store_id',
                DB::raw('SUM(refunds.refund_amount) as refund_amount'),
                DB::raw('COUNT(*) as refund_count'),
            )
            ->whereDate('refunds.created_at', $date)
            ->where('refunds.status', 'completed')
            ->groupBy('orders.store_id')
            ->get()
            ->keyBy('store_id');

        foreach ($storeMetrics as $row) {
            $refund = $refundMetrics->get($row->store_id);

            DB::table('daily_store_metrics')->updateOrInsert(
                ['store_id' => $row->store_id, 'metric_date' => $date],
                [
                    'gross_sales' => $row->gross_sales,
                    'commission_paid' => $row->commission_paid,
                    'net_revenue' => $row->net_revenue,
                    'order_count' => $row->order_count,
                    'refund_amount' => $refund?->refund_amount ?? 0,
                    'refund_count' => $refund?->refund_count ?? 0,
                    'computed_at' => now(),
                ],
            );
        }
    }

    private function generatePlatformMetrics(string $date): void
    {
        $orders = DB::table('orders')
            ->whereDate('created_at', $date)
            ->whereIn('status', ['paid', 'fulfilled', 'completed'])
            ->selectRaw('SUM(gross_amount) as gmv, SUM(commission_amount) as commission_revenue, COUNT(*) as order_count')
            ->first();

        $activeStoreCount = Store::query()->where('status', 'active')->count();

        $newStoreCount = Store::query()
            ->whereDate('created_at', $date)
            ->count();

        $refundAmount = DB::table('refunds')
            ->whereDate('created_at', $date)
            ->where('status', 'completed')
            ->sum('refund_amount');

        DB::table('daily_platform_metrics')->updateOrInsert(
            ['metric_date' => $date],
            [
                'gmv' => $orders->gmv ?? 0,
                'commission_revenue' => $orders->commission_revenue ?? 0,
                'active_store_count' => $activeStoreCount,
                'new_store_count' => $newStoreCount,
                'order_count' => $orders->order_count ?? 0,
                'refund_amount' => $refundAmount ?? 0,
                'computed_at' => now(),
            ],
        );
    }
}
