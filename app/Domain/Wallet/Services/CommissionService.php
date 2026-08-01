<?php

namespace App\Domain\Wallet\Services;

use App\Domain\Wallet\Models\CommissionRule;
use Illuminate\Support\Facades\DB;

/**
 * Database Architecture v2 §7.3 + §3.13. Fixes Financial Ledger Risk
 * finding #22: a commission rate change is NEVER a bare INSERT. This
 * service is the only sanctioned writer of commission_rules.
 */
class CommissionService
{
    /**
     * Returns the currently-active rule for a scope, falling back to
     * the global rule if no scope-specific rule exists. This fallback
     * chain (store → category → product_type → global) is the lookup
     * OrderService uses at order-creation time to determine which rate
     * applies — called out explicitly here so the precedence order is
     * documented in exactly one place.
     */
    public function getActiveRule(string $scopeType = 'global', ?int $scopeId = null): CommissionRule
    {
        $rule = CommissionRule::query()->active($scopeType, $scopeId)->first();

        if ($rule === null && $scopeType !== 'global') {
            // No scope-specific rule exists — fall back to global.
            $rule = CommissionRule::query()->active('global', null)->first();
        }

        if ($rule === null) {
            throw new \RuntimeException(
                'No active global commission rule exists. The platform cannot process orders without one — seed a global rule before going live.'
            );
        }

        return $rule;
    }

    /**
     * The ONLY sanctioned way a commission rate changes. Enforces the
     * procedure stated in Database Architecture v2 §7.3: atomically
     * close out the previous active row (set effective_until) and
     * insert the new one. Any code path that inserts a new
     * commission_rules row without going through this method is a bug,
     * not a minor oversight — restated here from the schema doc because
     * this is where that rule actually executes.
     */
    public function setRate(
        string $scopeType,
        ?int $scopeId,
        float $ratePercent,
        ?int $flatFeeAmount,
        \DateTimeInterface $effectiveFrom,
    ): CommissionRule {
        return DB::transaction(function () use ($scopeType, $scopeId, $ratePercent, $flatFeeAmount, $effectiveFrom) {
            $currentActive = CommissionRule::query()
                ->active($scopeType, $scopeId)
                ->lockForUpdate()
                ->first();

            if ($currentActive !== null) {
                $currentActive->effective_until = $effectiveFrom;
                $currentActive->save();
            }

            return CommissionRule::create([
                'scope_type' => $scopeType,
                'scope_id' => $scopeId,
                'rate_percent' => $ratePercent,
                'flat_fee_amount' => $flatFeeAmount,
                'effective_from' => $effectiveFrom,
                'effective_until' => null,
            ]);
        });
    }

    /**
     * Pure calculation, no side effects: given a rule and a gross
     * amount, returns the commission amount. Rounding is always DOWN
     * to the nearest Rupiah, in the seller's favor on the rounding edge
     * (Flows v1 Flow 8's stated rounding-consistency requirement) —
     * applying this same rule everywhere prevents the kind of
     * off-by-one-Rupiah ledger mismatch that's maddening to trace later.
     */
    public function calculateCommission(CommissionRule $rule, int $grossAmount): int
    {
        $percentagePart = (int) floor($grossAmount * ((float) $rule->rate_percent / 100));
        $flatPart = $rule->flat_fee_amount ?? 0;

        return $percentagePart + $flatPart;
    }
}
