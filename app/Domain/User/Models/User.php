<?php

namespace App\Domain\User\Models;

use App\Domain\Order\Models\Order;
use App\Domain\Store\Models\Store;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Database Architecture v2 §3.1.
 *
 * IMPORTANT: `role_hint` is a display/default hint ONLY — it is never an
 * access-control gate. Do not write `if ($user->role_hint === 'seller')`
 * anywhere in the codebase to decide whether someone has seller
 * capabilities. Use `$user->isSeller()` below, which derives the answer
 * from whether a Store actually exists. This keeps the "true" definition
 * of seller-ness in exactly one place, matching the architecture decision.
 *
 * HasApiTokens (Sanctum) added this session: the frontend/backend
 * split decided this session means auth is now token-based
 * (Authorization: Bearer <token>), not session-cookie-based — this is
 * what AuthController::createToken() relies on. Requires
 * `composer require laravel/sanctum` and its migration to be run; not
 * part of Laravel's default install in every version, so confirm it's
 * present before running migrations.
 */
class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'password',
        'role_hint',
        'is_admin',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'locked_until' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'is_admin' => 'boolean',
        ];
    }

    public function store(): HasOne
    {
        return $this->hasOne(Store::class);
    }

    public function ordersAsBuyer(): HasMany
    {
        return $this->hasMany(Order::class, 'buyer_user_id');
    }

    /**
     * The single, authoritative definition of "is this user a seller."
     * Never substitute role_hint for this check.
     */
    public function isSeller(): bool
    {
        return $this->store()->exists();
    }

    /**
     * The single, authoritative definition of "is this user an admin."
     * Backed by the dedicated is_admin column (added this session) —
     * never role_hint, for exactly the same reason isSeller() never
     * reads role_hint: a single, unambiguous source of truth per
     * capability, immune to a future call site accidentally trusting
     * the display hint instead.
     */
    public function isAdmin(): bool
    {
        return $this->is_admin === true;
    }

    public function isLocked(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }
}
