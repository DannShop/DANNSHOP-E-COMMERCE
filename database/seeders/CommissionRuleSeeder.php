<?php

namespace Database\Seeders;

use App\Domain\Wallet\Models\CommissionRule;
use Illuminate\Database\Seeder;

/**
 * CRITICAL SEEDER — without this, OrderService::createOrder() throws
 * immediately: CommissionService::getActiveRule() requires at least
 * one global commission_rules row with effective_until = NULL to
 * exist, per Database Architecture v2 §7.3's "no active global
 * commission rule" guard in CommissionService.
 *
 * Rate is a PLACEHOLDER (5%) — this is a business decision Wildan must
 * confirm, not something I should invent silently. Architecture v1 §3.1
 * mentioned "Transaction Fee" as a revenue stream but never specified
 * a number. 5% is a reasonable, commonly-seen starting point for
 * creator-commerce platforms (Gumroad charges ~10%, Lynk.id has a
 * tiered structure) but Wildan should treat this as a TODO to revisit
 * via CommissionService::setRate() — never edit this row directly in
 * the database once live, since that would bypass the versioning
 * procedure (Database Architecture v2 §7.3) that's the whole point of
 * this table's design.
 */
class CommissionRuleSeeder extends Seeder
{
    public function run(): void
    {
        CommissionRule::query()->firstOrCreate(
            [
                'scope_type' => 'global',
                'scope_id' => null,
                'effective_until' => null,
            ],
            [
                'rate_percent' => 5.00, // 🟡 PLACEHOLDER — confirm actual platform fee with Wildan before going live
                'flat_fee_amount' => null,
                'effective_from' => now(),
            ],
        );
    }
}
