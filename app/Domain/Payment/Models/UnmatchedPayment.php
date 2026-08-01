<?php

namespace App\Domain\Payment\Models;

use App\Domain\Order\Models\Order;
use App\Domain\User\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Database Architecture v2 §3.16. Flows v1 Flow 5's static-QRIS
 * mismatch edge case: a buyer pays the wrong amount, or two buyers'
 * payable amounts collide despite the offset strategy. This is an
 * actively-worked admin queue, not a passive log — see the admin
 * controller's unmatched-payments review screen.
 */
class UnmatchedPayment extends Model
{
    protected $fillable = [
        'payment_provider_id',
        'amount_received',
        'provider_reference',
        'raw_payload',
        'status',
        'matched_to_order_id',
        'matched_by_admin_id',
        'matched_at',
    ];

    protected function casts(): array
    {
        return [
            'raw_payload' => 'array',
            'amount_received' => 'integer',
            'matched_at' => 'datetime',
        ];
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(PaymentProvider::class, 'payment_provider_id');
    }

    public function matchedToOrder(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'matched_to_order_id');
    }

    public function matchedByAdmin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'matched_by_admin_id');
    }

    public function isUnmatched(): bool
    {
        return $this->status === 'unmatched';
    }
}
