<?php

namespace App\Domain\Wallet\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Database Architecture v2 §3.13 + §7.3.
 *
 * Rows are NEVER updated in place to change a rate. CommissionService
 * is the only sanctioned writer: a rate change always closes out the
 * current active row (sets effective_until) and inserts a new one,
 * atomically. The scopeActive() query below is the read-side
 * counterpart — "find the row currently in effect for this scope" —
 * used both by CommissionService's own write-time check and by
 * OrderService when computing a new order's commission_amount.
 */
class CommissionRule extends Model
{
    protected $fillable = [
        'scope_type',
        'scope_id',
        'rate_percent',
        'flat_fee_amount',
        'effective_from',
        'effective_until',
    ];

    protected function casts(): array
    {
        return [
            'rate_percent' => 'decimal:2',
            'flat_fee_amount' => 'integer',
            'effective_from' => 'datetime',
            'effective_until' => 'datetime',
        ];
    }

    /**
     * The currently-active rule for a given scope: effective_until IS
     * NULL means "still in effect." This is the exact lookup
     * CommissionService::setRate() must perform before inserting a new
     * row, and the same lookup OrderService uses at order-creation time.
     */
    public function scopeActive(Builder $query, string $scopeType, ?int $scopeId = null): Builder
    {
        return $query->where('scope_type', $scopeType)
            ->where('scope_id', $scopeId)
            ->whereNull('effective_until');
    }

    public function isActive(): bool
    {
        return $this->effective_until === null;
    }
}
