<?php

namespace App\Domain\Withdrawal\Models;

use App\Domain\Store\Models\Store;
use App\Domain\User\Models\User;
use App\Domain\Wallet\Models\SellerPayoutMethod;
use App\Domain\Wallet\Models\Wallet;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Database Architecture v2 §3.12 + §8.
 *
 * payout_method_id references a saved SellerPayoutMethod — withdrawals
 * no longer carry inline destination details (that was the v1 design,
 * fixed in v2). status='failed' is distinct from 'rejected': failed
 * means admin approved and a real transfer was attempted but didn't
 * succeed; rejected means admin declined before any transfer attempt.
 * Both release the reservation identically at the ledger level, but
 * the audit trail differs — see WalletService::recordWithdrawalRelease().
 *
 * canBeCancelledBySeller() reflects Flows v1 Flow 7's edge case: a
 * seller can only cancel while status='pending', never after admin has
 * started reviewing it.
 */
class Withdrawal extends Model
{
    protected $fillable = [
        'wallet_id',
        'store_id',
        'payout_method_id',
        'amount_requested',
        'fee_amount',
        'amount_payable',
        'status',
        'reviewed_by_admin_id',
        'reviewed_at',
        'completed_at',
        'failure_reason',
    ];

    protected function casts(): array
    {
        return [
            'amount_requested' => 'integer',
            'fee_amount' => 'integer',
            'amount_payable' => 'integer',
            'reviewed_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function payoutMethod(): BelongsTo
    {
        return $this->belongsTo(SellerPayoutMethod::class, 'payout_method_id');
    }

    public function reviewedByAdmin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_admin_id');
    }

    public function canBeCancelledBySeller(): bool
    {
        return $this->status === 'pending';
    }

    public function isReserved(): bool
    {
        return in_array($this->status, ['pending', 'approved', 'processing'], true);
    }

    public function isResolved(): bool
    {
        return in_array($this->status, ['completed', 'rejected', 'failed', 'cancelled'], true);
    }
}
