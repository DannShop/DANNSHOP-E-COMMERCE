<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.5 (unchanged from v1).
     *
     * status='reserved' is the row-lock state from Flows v1 Flow 3's
     * concurrency edge case — set the instant an order is created,
     * BEFORE payment confirms, released on order expiry/cancellation.
     * The index on (product_id, status) is what makes the "find an
     * available asset to reserve" query performant under concurrent
     * buyers — this is the hot path the SELECT ... FOR UPDATE locking
     * pattern runs against.
     *
     * reserved_by_order_id / sold_to_order_id are added as foreign keys
     * AFTER the orders table exists (see the later "add foreign keys"
     * migration) because orders does not exist yet at this point in the
     * dependency chain — orders itself depends on products.
     *
     * Soft delete only, never hard-deleted: buyers may need re-access to
     * an asset even after a seller removes the parent product from sale.
     */
    public function up(): void
    {
        Schema::create('product_assets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->enum('asset_type', ['file', 'license_key', 'credential_pair']);
            $table->text('content')->nullable(); // encrypted at rest if license_key/credential_pair
            $table->unsignedSmallInteger('encryption_key_version')->nullable(); // null when asset_type='file' (no encryption needed)
            $table->string('file_path', 255)->nullable();
            $table->enum('status', ['available', 'reserved', 'sold'])->default('available');
            $table->unsignedBigInteger('reserved_by_order_id')->nullable();
            $table->unsignedBigInteger('sold_to_order_id')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['product_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_assets');
    }
};
