<?php

namespace App\Domain\Payment\Models;

use App\Domain\Order\Models\Order;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Database Architecture v2 §3.15 + §9.2.
 *
 * UNIQUE(payment_provider_id, provider_reference) at the DB level is an
 * idempotency guarantee, not just a performance index — a duplicate
 * webhook physically cannot insert a second row. PaymentService's
 * webhook handler should still check for existence BEFORE attempting
 * insert (to return a clean "already processed" response rather than
 * relying on catching a DB exception), but the constraint is the
 * backstop if that check is ever bypassed by a bug.
 */
class PaymentTransaction extends Model
{
    public $timestamps = false; // created_at only

    protected $fillable = [
        'order_id',
        'payment_provider_id',
        'provider_reference',
        'event_type',
        'raw_payload',
        'status',
        'attempted_at',
        'confirmed_at',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'raw_payload' => 'array',
            'attempted_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(PaymentProvider::class, 'payment_provider_id');
    }
}
