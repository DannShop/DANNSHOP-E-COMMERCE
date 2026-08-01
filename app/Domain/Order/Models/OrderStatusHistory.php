<?php

namespace App\Domain\Order\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Database Architecture v2 §3.9. Append-only — no updated_at, no
 * deleted_at, and deliberately no update/delete methods exposed beyond
 * what Eloquent provides by default. Rows are created exclusively via
 * OrderService whenever orders.status changes; nothing else should ever
 * insert into this table.
 */
class OrderStatusHistory extends Model
{
    public $timestamps = false; // created_at is set explicitly, no updated_at exists on this table

    protected $fillable = [
        'order_id',
        'from_status',
        'to_status',
        'changed_by_type',
        'changed_by_id',
        'note',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
