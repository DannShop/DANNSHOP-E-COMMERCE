<?php

namespace App\Domain\Store\Models;

use App\Domain\Order\Models\Order;
use App\Domain\Product\Models\Product;
use App\Domain\User\Models\User;
use App\Domain\Wallet\Models\SellerPayoutMethod;
use App\Domain\Wallet\Models\Wallet;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Database Architecture v2 §3.2.
 *
 * UNIQUE(user_id) at the DB level enforces "one store per seller" for
 * now (Normalization finding #3, deliberately not removed pre-emptively
 * for 🔵 V3 multi-store). The hasOne relationship below mirrors that
 * 1:1 assumption — if multi-store ships, this becomes hasMany and the
 * unique constraint is dropped in the same migration, not before.
 */
class Store extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id',
        'slug',
        'name',
        'bio',
        'logo_path',
        'banner_path',
        'status',
        'social_links',
        'theme_settings',
    ];

    protected function casts(): array
    {
        return [
            'social_links' => 'array',
            'theme_settings' => 'array',
            'slug_changed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function wallet(): HasOne
    {
        return $this->hasOne(Wallet::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function payoutMethods(): HasMany
    {
        return $this->hasMany(SellerPayoutMethod::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /**
     * Flows v1 Flow 2: slug changes are rate-limited to once every 30
     * days. This is a pure read-only check against the stored timestamp
     * — the actual enforcement (rejecting a change attempted too soon)
     * lives in StoreService::changeSlug(), not here, because enforcement
     * involves throwing a domain-specific exception, which is business
     * logic, not a model concern.
     */
    public function canChangeSlug(): bool
    {
        if ($this->slug_changed_at === null) {
            return true;
        }

        return $this->slug_changed_at->lt(now()->subDays(30));
    }
}
