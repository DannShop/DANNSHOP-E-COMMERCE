<?php

namespace App\Domain\Wallet\Models;

use App\Domain\User\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Database Architecture v2 §3.11 — THE most important model in the
 * entire system. Append-only: no updated_at, no deleted_at, and no
 * update/delete behavior should ever be exposed for this model beyond
 * what Eloquent provides natively. Every row is created exclusively
 * from WalletService, always inside a transaction that also holds a
 * row lock on the related Wallet and writes/updates the corresponding
 * LedgerTransactionGroup's actual_entry_count.
 *
 * `amount` is SIGNED (positive=credit, negative=debit) — this is a
 * deliberate model-level distinction from Wallet.cached_balance, which
 * is unsigned. The ledger records signed flow; the wallet's cache is
 * the always-non-negative running result.
 */
class WalletLedgerEntry extends Model
{
    public $timestamps = false; // created_at only, immutable

    protected $fillable = [
        'wallet_id',
        'transaction_group_id',
        'entry_type',
        'amount',
        'reference_type',
        'reference_id',
        'balance_after',
        'note',
        'created_by_admin_id',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'balance_after' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function transactionGroup(): BelongsTo
    {
        return $this->belongsTo(LedgerTransactionGroup::class, 'transaction_group_id');
    }

    public function createdByAdmin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_admin_id');
    }

    public function isCredit(): bool
    {
        return $this->amount > 0;
    }

    public function isDebit(): bool
    {
        return $this->amount < 0;
    }
}
