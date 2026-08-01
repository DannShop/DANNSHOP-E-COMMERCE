<?php

namespace App\Domain\Payment\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Database Architecture v2 §3.14.
 *
 * This table is what makes the PaymentGatewayInterface abstraction
 * (Architecture v1 §8) real at the data layer: provider_key is the
 * string PaymentGatewayManager uses to resolve which Gateway
 * implementation class to instantiate (see
 * Domain\Payment\Gateways\PaymentGatewayManager, built in a later
 * session). Adding a provider becomes an admin-panel data entry
 * pointing at an existing Gateway class, not a deploy.
 */
class PaymentProvider extends Model
{
    protected $fillable = [
        'provider_key',
        'display_name',
        'is_active',
        'supports_dynamic_qris',
        'credentials_encrypted',
        'encryption_key_version',
        'priority',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'supports_dynamic_qris' => 'boolean',
            'credentials_encrypted' => 'encrypted',
        ];
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(PaymentTransaction::class);
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
