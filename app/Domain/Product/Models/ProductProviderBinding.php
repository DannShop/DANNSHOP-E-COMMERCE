<?php

namespace App\Domain\Product\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Database Architecture v2 §3.6 — 🟡 schema present in MVP, populated
 * only when top-up/PPOB ships. No service logic consumes this yet;
 * it exists so Product.usesProviderBinding() has somewhere real to
 * point to once that integration is built.
 */
class ProductProviderBinding extends Model
{
    protected $fillable = [
        'product_id',
        'provider_name',
        'provider_sku',
        'provider_cost_price',
        'sync_status',
        'last_synced_at',
    ];

    protected function casts(): array
    {
        return [
            'last_synced_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
