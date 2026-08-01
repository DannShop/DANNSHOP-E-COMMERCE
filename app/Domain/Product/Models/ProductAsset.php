<?php

namespace App\Domain\Product\Models;

use App\Domain\Order\Models\Order;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Database Architecture v2 §3.5.
 *
 * status='reserved' is set the instant an order is created, BEFORE
 * payment confirms (Flows v1 Flow 3's concurrency edge case). Any code
 * that reserves an asset MUST do so inside a transaction holding
 * SELECT ... FOR UPDATE on the candidate row — that locking logic lives
 * in ProductService::reserveAsset(), never here, because a model method
 * silently taking a lock is exactly the kind of hidden behavior that
 * makes a codebase hard to reason about. The model only exposes the
 * data; the service owns the concurrency-safe operation.
 *
 * `content` is encrypted at rest when asset_type is license_key or
 * credential_pair — see the encrypted cast below, which uses Laravel's
 * built-in encryption. encryption_key_version is tracked alongside it
 * so the key can be rotated incrementally (Database Architecture v2
 * §3.2b's rationale, applied here too).
 */
class ProductAsset extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'product_id',
        'asset_type',
        'content',
        'encryption_key_version',
        'file_path',
        'status',
        'reserved_by_order_id',
        'sold_to_order_id',
    ];

    protected function casts(): array
    {
        return [
            // Laravel's `encrypted` cast handles encryption/decryption
            // transparently. encryption_key_version is a separate column
            // tracked manually by the service layer at write time, since
            // Laravel's cast doesn't expose which app key encrypted a
            // given value — see ProductService for the write-side rule.
            //
            // HONEST IMPLEMENTATION GAP, flagged rather than hidden:
            // Laravel's native `encrypted` cast uses a single APP_KEY and
            // has no built-in concept of key versioning. The
            // encryption_key_version column on this table is currently
            // bookkeeping only — actual key rotation support requires a
            // custom cast (or a dedicated EncryptionService that picks
            // the decryption key based on this column) before rotation
            // is truly incremental. Until that custom cast is built,
            // rotating APP_KEY still requires decrypting all rows with
            // the old key and re-encrypting with the new one in a single
            // pass — the column exists so that future work is additive,
            // not because rotation is fully solved today.
            'content' => 'encrypted',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function reservedByOrder(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'reserved_by_order_id');
    }

    public function soldToOrder(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'sold_to_order_id');
    }

    public function isAvailable(): bool
    {
        return $this->status === 'available';
    }
}
