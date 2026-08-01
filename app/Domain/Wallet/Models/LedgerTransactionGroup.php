<?php

namespace App\Domain\Wallet\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Database Architecture v2 §3.11a — the most important new structure in
 * the v2 revision. Every related set of wallet_ledger_entries belongs
 * to exactly one of these. The reconciliation sweep (a scheduled
 * command, see Console/Commands/CheckLedgerIntegrity) queries for any
 * row where actual_entry_count != expected_entry_count — that mismatch
 * is, by definition, a corrupted or incomplete financial transaction.
 *
 * isComplete() is a convenience accessor for that same check, used both
 * by the sweep command and anywhere else that needs to assert a group
 * finished correctly before trusting its entries.
 */
class LedgerTransactionGroup extends Model
{
    public $timestamps = false; // created_at only, set explicitly — no updates after creation except actual_entry_count increments

    protected $fillable = [
        'group_type',
        'reference_type',
        'reference_id',
        'expected_entry_count',
        'actual_entry_count',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function entries(): HasMany
    {
        return $this->hasMany(WalletLedgerEntry::class, 'transaction_group_id');
    }

    public function isComplete(): bool
    {
        return $this->actual_entry_count === $this->expected_entry_count;
    }
}
