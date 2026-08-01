<?php

namespace App\Domain\Order\Models;

use App\Domain\Payment\Models\PaymentProvider;
use App\Domain\Payment\Models\PaymentTransaction;
use App\Domain\Product\Models\Product;
use App\Domain\Store\Models\Store;
use App\Domain\User\Models\User;
use App\Domain\Wallet\Models\CommissionRule;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Database Architecture v2 §3.7.
 *
 * gross_amount is locked at order creation (Flows v1 Flow 3's price-
 * change protection) — this model never re-reads products.price after
 * creation; OrderService::createOrder() is the only place gross_amount
 * is ever set.
 *
 * The DB-level CHECK constraint (gross = commission + net) means this
 * model does not need to defensively re-validate that relationship on
 * every read — it's structurally guaranteed. It DOES still matter that
 * OrderService computes all three correctly before insert, since the
 * constraint only catches drift, not a wrong-but-internally-consistent
 * calculation.
 */
class Order extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'order_number',
        'store_id',
        'product_id',
        'buyer_user_id',
        'buyer_email',
        'buyer_phone',
        'gross_amount',
        'commission_amount',
        'net_amount',
        'commission_rule_id',
        'status',
        'payment_provider_id',
        'payable_amount',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'gross_amount' => 'integer',
            'commission_amount' => 'integer',
            'net_amount' => 'integer',
            'payable_amount' => 'integer',
            'expires_at' => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function buyer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'buyer_user_id');
    }

    public function commissionRule(): BelongsTo
    {
        return $this->belongsTo(CommissionRule::class);
    }

    public function paymentProvider(): BelongsTo
    {
        return $this->belongsTo(PaymentProvider::class);
    }

    public function paymentTransactions(): HasMany
    {
        return $this->hasMany(PaymentTransaction::class);
    }

    public function fulfillment(): HasOne
    {
        return $this->hasOne(OrderFulfillment::class);
    }

    public function statusHistory(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class)->orderBy('created_at');
    }

    public function disputes(): HasMany
    {
        return $this->hasMany(Dispute::class);
    }

    public function refunds(): HasMany
    {
        return $this->hasMany(Refund::class);
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function isPaid(): bool
    {
        return in_array($this->status, ['paid', 'fulfilled', 'completed'], true);
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    /**
     * The amount actually shown to the buyer at checkout / used for
     * payment matching. Falls back to gross_amount when no static-QRIS
     * offset was applied. NEVER use this value for wallet/commission
     * calculations — those always derive from gross_amount
     * (Database Architecture v2 §9.3).
     */
    public function displayPayableAmount(): int
    {
        return $this->payable_amount ?? $this->gross_amount;
    }
}
