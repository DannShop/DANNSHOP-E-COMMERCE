<?php

namespace App\Domain\Order\Models;

use App\Domain\Product\Models\ProductAsset;
use App\Domain\User\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Database Architecture v2 §3.8.
 *
 * Separated from orders.status because "paid" and "delivered" are
 * different facts. For manual fulfillment products, `notes` is the
 * primary dispute evidence (Flows v1 Flow 10) — it must never be
 * editable after the fact by the seller who wrote it, which is why
 * there's no update path exposed here beyond what OrderService allows
 * at the moment of fulfillment itself.
 */
class OrderFulfillment extends Model
{
    protected $fillable = [
        'order_id',
        'delivered_asset_id',
        'provider_fulfillment_ref',
        'delivered_at',
        'delivered_by',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'delivered_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function deliveredAsset(): BelongsTo
    {
        return $this->belongsTo(ProductAsset::class, 'delivered_asset_id');
    }

    public function deliveredByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delivered_by');
    }
}
