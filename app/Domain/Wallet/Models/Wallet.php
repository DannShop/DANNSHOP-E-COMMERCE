<?php

namespace App\Domain\Wallet\Models;

use App\Domain\Store\Models\Store;
use App\Domain\Withdrawal\Models\Withdrawal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Database Architecture v2 §3.10.
 *
 * cached_balance, cached_available_balance, cached_outstanding_debt are
 * UNSIGNED — per Wildan's decision, never negative. These are
 * performance caches, reconciled nightly against the true ledger sum
 * (SUM of wallet_ledger_entries.amount). NEVER write to these columns
 * directly via Eloquent's update()/save() from outside WalletService —
 * every write must go through a method that also writes the
 * corresponding ledger entry in the same transaction. This model
 * intentionally exposes no method that mutates balance; that is a
 * deliberate omission, not an oversight.
 */
class Wallet extends Model
{
    protected $fillable = [
        'store_id',
        'cached_balance',
        'cached_available_balance',
        'cached_outstanding_debt',
        'last_reconciled_at',
    ];

    protected function casts(): array
    {
        return [
            'cached_balance' => 'integer',
            'cached_available_balance' => 'integer',
            'cached_outstanding_debt' => 'integer',
            'last_reconciled_at' => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function ledgerEntries(): HasMany
    {
        return $this->hasMany(WalletLedgerEntry::class)->orderBy('created_at');
    }

    public function withdrawals(): HasMany
    {
        return $this->hasMany(Withdrawal::class);
    }

    public function refundDebts(): HasMany
    {
        return $this->hasMany(RefundDebt::class);
    }

    public function hasOutstandingDebt(): bool
    {
        return $this->cached_outstanding_debt > 0;
    }
}
