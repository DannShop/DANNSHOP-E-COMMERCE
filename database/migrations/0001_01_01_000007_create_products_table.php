<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.4 — the extensibility-critical table.
     *
     * Game top-up and PPOB products are NOT a different table — they are
     * `products` rows with fulfillment_mode='provider_api' and
     * stock_mode='provider_managed', exactly like a digital_file product
     * is fulfillment_mode='automatic'/stock_mode='unlimited'. The behavior
     * difference lives in which side-table gets consulted
     * (product_assets vs product_provider_bindings) and which service
     * class handles fulfillment — orders/checkout/wallet/commission logic
     * never needs to know which fulfillment mode a given product uses.
     *
     * slug is UNIQUE per store_id (composite, not global) — "ebook-1"
     * can exist under many different sellers.
     *
     * The CHECK constraint (Normalization finding #4) makes the
     * stock_count nullability rule a database guarantee instead of a
     * comment: stock_count must be set when stock_mode='limited' and
     * NULL otherwise. Laravel's schema builder has no first-class CHECK
     * helper as of 12.x for this MySQL-specific case, so it's added via
     * a raw statement after the table is created.
     */
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('category_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->string('name', 150);
            $table->string('slug', 150);
            $table->text('description')->nullable();
            $table->unsignedBigInteger('price'); // IDR, integer, no decimals
            $table->string('thumbnail_path', 255)->nullable();
            $table->enum('product_type', ['digital_file', 'account_credential', 'service', 'topup_voucher', 'ppob']);
            $table->enum('fulfillment_mode', ['automatic', 'manual', 'provider_api']);
            $table->enum('stock_mode', ['unlimited', 'limited', 'license_pool', 'provider_managed']);
            $table->unsignedInteger('stock_count')->nullable(); // only meaningful when stock_mode='limited'
            $table->enum('status', ['draft', 'active', 'archived', 'out_of_stock'])->default('draft');
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['store_id', 'slug']);
            $table->index(['store_id', 'status']);
        });

        // Normalization finding #4: enforce stock_count nullability at the DB level.
        DB::statement('
            ALTER TABLE products
            ADD CONSTRAINT chk_stock_count_consistency CHECK (
                (stock_mode = \'limited\' AND stock_count IS NOT NULL) OR
                (stock_mode != \'limited\' AND stock_count IS NULL)
            )
        ');
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
