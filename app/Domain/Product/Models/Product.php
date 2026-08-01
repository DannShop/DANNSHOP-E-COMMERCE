<?php

namespace App\Domain\Product\Models;

use App\Domain\Order\Models\Order;
use App\Domain\Store\Models\Store;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Database Architecture v2 §3.4 — the extensibility-critical model.
 *
 * Game top-up and PPOB products are NOT a different model — they are
 * Product rows with fulfillment_mode='provider_api' and
 * stock_mode='provider_managed'. The helper methods below
 * (usesAssetPool(), usesProviderBinding(), isManualFulfillment()) are
 * what let OrderService and the fulfillment Job decide which side-table
 * to consult WITHOUT a chain of if/else on product_type scattered across
 * the codebase. Any future fulfillment mode should be added as a new
 * helper method here, not as a new if-statement at every call site.
 */
class Product extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'store_id',
        'category_id',
        'name',
        'slug',
        'description',
        'price',
        'thumbnail_path',
        'product_type',
        'fulfillment_mode',
        'stock_mode',
        'stock_count',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'price' => 'integer',
            'stock_count' => 'integer',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function assets(): HasMany
    {
        return $this->hasMany(ProductAsset::class);
    }

    public function providerBinding(): HasOne
    {
        return $this->hasOne(ProductProviderBinding::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /**
     * Whether this product's stock/delivery is backed by individually
     * reservable product_assets rows (file deliveries with one-time-use
     * semantics, or license keys/credentials). True only for
     * stock_mode='license_pool'.
     *
     * BUG FIX (flagged by Wildan): the original version of this method
     * also returned true whenever fulfillment_mode='automatic', which
     * incorrectly caught stock_mode='unlimited' digital_file products
     * (e.g. an ebook) — those are automatic fulfillment too, but they
     * must NEVER go through ProductService::reserveAsset(), because an
     * unlimited file has no finite pool of rows to reserve from. A
     * single product_assets row (asset_type='file') holds the file
     * path and is referenced by every order's fulfillment record
     * directly — see ProductService's createOrder() branch for
     * stock_mode='unlimited', which reads the asset without reserving
     * or marking it sold. Checking stock_mode alone (not
     * fulfillment_mode) is what makes this distinction correct.
     */
    public function usesAssetPool(): bool
    {
        return $this->stock_mode === 'license_pool';
    }

    /**
     * True for stock_mode='unlimited' digital_file products: one asset
     * row is read repeatedly for every order, never reserved or marked
     * sold. Added alongside the usesAssetPool() fix above so
     * OrderService has an explicit, named branch for this case instead
     * of an implicit "neither asset pool nor provider binding" fallthrough.
     */
    public function usesUnlimitedAsset(): bool
    {
        return $this->stock_mode === 'unlimited' && $this->fulfillment_mode === 'automatic';
    }

    /**
     * Whether this product's fulfillment is delegated to an external
     * top-up/PPOB provider via product_provider_bindings. 🟡 unused until
     * that integration ships, but the check is correct and ready now.
     */
    public function usesProviderBinding(): bool
    {
        return $this->fulfillment_mode === 'provider_api';
    }

    public function isManualFulfillment(): bool
    {
        return $this->fulfillment_mode === 'manual';
    }

    /**
     * For stock_mode='limited' products without an asset pool (e.g. a
     * manually-fulfilled service with a capped number of slots). Products
     * using 'license_pool' or 'provider_managed' should check stock via
     * their respective side-table instead — this method intentionally
     * does not cover those cases, to avoid silently returning a
     * misleading answer for a stock_mode it wasn't designed for.
     */
    public function hasAvailableLimitedStock(): bool
    {
        if ($this->stock_mode !== 'limited') {
            throw new \LogicException(
                'hasAvailableLimitedStock() called on a product with stock_mode='.$this->stock_mode
            );
        }

        return $this->stock_count > 0;
    }
}
