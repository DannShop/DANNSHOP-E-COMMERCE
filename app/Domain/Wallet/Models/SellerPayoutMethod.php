<?php

namespace App\Domain\Wallet\Models;

use App\Domain\Store\Models\Store;
use App\Domain\Withdrawal\Models\Withdrawal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Database Architecture v2 §3.2a — fixes Normalization finding #5.
 * Lives in Domain\Wallet rather than Domain\Store deliberately: this is
 * conceptually about money leaving the platform, the same domain
 * Withdrawal depends on, not about store identity/branding.
 *
 * `recentlyCreated()` exists specifically to support the Flows v1
 * Flow 7 fraud signal: WithdrawalService checks this when a withdrawal
 * request comes in against a payout method, flagging for mandatory
 * admin review if the method was added shortly before the request.
 */
class SellerPayoutMethod extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'store_id',
        'label',
        'destination_type',
        'destination_details_encrypted',
        'encryption_key_version',
        'is_default',
        'last_used_at',
        'verified_at',
    ];

    protected function casts(): array
    {
        return [
            'destination_details_encrypted' => 'encrypted', // see ProductAsset.php for the honest key-version caveat — same applies here
            'is_default' => 'boolean',
            'last_used_at' => 'datetime',
            'verified_at' => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function withdrawals(): HasMany
    {
        return $this->hasMany(Withdrawal::class, 'payout_method_id');
    }

    public function recentlyCreated(int $hours = 24): bool
    {
        return $this->created_at->gt(now()->subHours($hours));
    }
}
