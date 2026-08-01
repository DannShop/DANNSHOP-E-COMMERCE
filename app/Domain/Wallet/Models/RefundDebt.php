<?php

namespace App\Domain\Wallet\Models;

use App\Domain\Order\Models\Refund;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Database Architecture v2 §3.10a — required by Wildan's "balance must
 * never go negative" decision. amount_recovered climbs toward
 * amount_owed via repeated debit_debt_recovery ledger entries, each
 * capped at 50% of whatever sale triggered it (§6.1a). The CHECK
 * constraint (amount_recovered <= amount_owed) is a DB-level sanity
 * bound that this model's remainingAmount() and isFullyRecovered()
 * helpers stay consistent with.
 */
class RefundDebt extends Model
{
    protected $fillable = [
        'wallet_id',
        'refund_id',
        'amount_owed',
        'amount_recovered',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'amount_owed' => 'integer',
            'amount_recovered' => 'integer',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function refund(): BelongsTo
    {
        return $this->belongsTo(Refund::class);
    }

    public function remainingAmount(): int
    {
        return $this->amount_owed - $this->amount_recovered;
    }

    public function isFullyRecovered(): bool
    {
        return $this->status === 'fully_recovered';
    }

    public function isOutstanding(): bool
    {
        return $this->status === 'outstanding';
    }
}
