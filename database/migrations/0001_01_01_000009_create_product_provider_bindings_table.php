<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.6 (unchanged from v1) — 🟡 schema present
     * in MVP, populated only when top-up/PPOB ships.
     *
     * This is the concrete cost of "design for top-up/PPOB now": an empty
     * table shipping in Phase 0 migrations even though no provider
     * integration code exists yet. provider_cost_price (what the external
     * provider charges DannShop) is kept separate from products.price
     * (what DannShop charges the buyer) specifically for margin tracking
     * once this is actually used.
     */
    public function up(): void
    {
        Schema::create('product_provider_bindings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->unique()->constrained('products')->cascadeOnDelete();
            $table->string('provider_name', 100); // e.g. 'digiflazz', 'ipaymu-ppob'
            $table->string('provider_sku', 100); // external provider's product code
            $table->unsignedBigInteger('provider_cost_price')->nullable();
            $table->enum('sync_status', ['active', 'provider_unavailable', 'deprecated'])->default('active');
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_provider_bindings');
    }
};
