<?php

namespace App\Domain\Order\Models;

use App\Domain\User\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Database Architecture v2 §3.17.
 *
 * response_deadline powers the default-resolution-timeout sweep job
 * (Flows v1 Flow 10) — see Console/Commands for the scheduled command
 * that resolves stale disputes in the buyer's favor once this passes
 * with no seller response.
 */
class Dispute extends Model
{
    protected $fillable = [
        'order_id',
        'raised_by_type',
        'reason',
        'status',
        'resolution_note',
        'resolved_by_admin_id',
        'response_deadline',
        'resolved_at',
    ];

    protected function casts(): array
    {
        return [
            'response_deadline' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function resolvedByAdmin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by_admin_id');
    }

    public function refunds(): HasMany
    {
        return $this->hasMany(Refund::class);
    }

    public function isOpen(): bool
    {
        return in_array($this->status, ['open', 'awaiting_seller_response', 'awaiting_buyer_response'], true);
    }

    public function isPastDeadline(): bool
    {
        return $this->response_deadline !== null && $this->response_deadline->isPast();
    }
}
