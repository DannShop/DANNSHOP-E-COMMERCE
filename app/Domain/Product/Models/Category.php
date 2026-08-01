<?php

namespace App\Domain\Product\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Database Architecture v2 §3.3. Self-referencing, nesting-ready for
 * 🟡 V2 — MVP UI will likely only present flat categories, but the
 * column exists now so adding nested browsing later is a UI change,
 * not a migration.
 */
class Category extends Model
{
    protected $fillable = [
        'parent_id',
        'name',
        'slug',
        'type_scope',
    ];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Category::class, 'parent_id');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }
}
