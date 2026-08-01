<?php

namespace App\Console\Commands;

use App\Domain\Order\Services\OrderService;
use Illuminate\Console\Command;

/**
 * Flows v1 Flow 4's auto-expiry requirement. Runs OrderService::
 * expireStaleOrders() — abandoned pending orders past their
 * expires_at window are marked 'expired' and any reserved asset is
 * released back to available stock. Must run frequently (every
 * minute, per the Rumahweb deploy guide's cron setup) since orders
 * expire on a 45-minute window and buyers/admins benefit from stock
 * being released promptly, not hours later.
 */
class ExpireStaleOrders extends Command
{
    protected $signature = 'orders:expire-stale';

    protected $description = 'Mark abandoned pending orders as expired and release any reserved product assets back to stock.';

    public function __construct(
        private OrderService $orderService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $count = $this->orderService->expireStaleOrders();

        if ($count > 0) {
            $this->info("Expired {$count} stale order(s).");
        }

        return self::SUCCESS;
    }
}
