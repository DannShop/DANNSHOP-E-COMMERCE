<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.8 (unchanged from v1).
     *
     * Separated from orders.status because "paid" and "delivered" are
     * genuinely different facts — this distinction is critical for
     * manual fulfillment types (e.g. coding services), where
     * delivered_at/delivered_by/notes become the primary evidence an
     * admin relies on during a dispute (Flows v1 Flow 10) — a boolean
     * "fulfilled" flag on the order itself couldn't answer "what exactly
     * did the seller mark as delivered, when, and did they leave a note."
     *
     * provider_fulfillment_ref supports 🟡 provider_api fulfillment mode
     * (top-up/PPOB) — the external provider's own transaction reference
     * for that specific delivery.
     */
    public function up(): void
    {
        Schema::create('order_fulfillments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->unique()->constrained('orders')->cascadeOnDelete();
            $table->foreignId('delivered_asset_id')->nullable()->constrained('product_assets')->nullOnDelete();
            $table->string('provider_fulfillment_ref', 255)->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->foreignId('delivered_by')->nullable()->constrained('users')->nullOnDelete(); // seller's user_id for manual fulfillment
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_fulfillments');
    }
};
