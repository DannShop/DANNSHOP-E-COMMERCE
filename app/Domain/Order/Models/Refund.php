<?php

namespace App\Domain\Order\Models;

use App\Domain\User\Models\User;
use App\Domain\Wallet\Models\RefundDebt;
use App\Domain\Wallet\Models\WalletLedgerEntry;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Database Architecture v2 §3.18.
 *
 * status='pending_seller_balance' is the state introduced by Wildan's
 * explicit decision that wallet balance must never go negative: this
 * refund is approved, but the buyer has not received their money back
 * yet because the seller's available balance can't cover it. A
 * RefundDebt row exists for it, and isHeldForSellerBalance() reflects
 * that state. Execution resumes automatically once the linked
 * RefundDebt reaches status='fully_recovered' — see
 * WalletService::recoverDebt().
 *
 * status='execution_pending' is the distinct human-execution-gap state
 * (Flows v1 Flow 9): admin approved, seller balance WAS sufficient, but
 * the manual provider-side transfer back to the buyer hasn't happened.
 */
class Refund extends Model
{
    protected $fillable = [
        'order_id',
        'dispute_id',
        'refund_amount',
        'refund_type',
        'reason',
        'status',
        'buyer_payment_returned_at',
        'seller_wallet_clawback_entry_id',
        'approved_by_admin_id',
    ];

    protected function casts(): array
    {
        return [
            'refund_amount' => 'integer',
            'buyer_payment_returned_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function dispute(): BelongsTo
    {
        return $this->belongsTo(Dispute::class);
    }

    public function approvedByAdmin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_admin_id');
    }

    public function sellerWalletClawbackEntry(): BelongsTo
    {
        return $this->belongsTo(WalletLedgerEntry::class, 'seller_wallet_clawback_entry_id');
    }

    public function debt(): HasOne
    {
        return $this->hasOne(RefundDebt::class);
    }

    public function isHeldForSellerBalance(): bool
    {
        return $this->status === 'pending_seller_balance';
    }

    public function isAwaitingExecution(): bool
    {
        return in_array($this->status, ['pending_seller_balance', 'execution_pending'], true);
    }

    public function isComplete(): bool
    {
        return $this->status === 'completed';
    }
}
