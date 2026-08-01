<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §10.1 — new table closing Reporting
     * Limitation finding #15.
     *
     * A seller's "Sales This Month" view is one of the highest-traffic
     * reads in the seller dashboard (Architecture v1's emphasis on this
     * being a retention-critical screen). Computing it live by scanning
     * `orders` on every page load is wasteful even at low volume. A
     * nightly job populates yesterday's row per active store; "today so
     * far" can be layered on top as a light live query against
     * yesterday's settled aggregate, giving both speed and freshness.
     *
     * This is MVP, not deferred to V2 — cheap to build now, meaningfully
     * better than discovering a slow dashboard query in production later.
     */
    public function up(): void
    {
        Schema::create('daily_store_metrics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->date('metric_date');
            $table->unsignedBigInteger('gross_sales')->default(0);
            $table->unsignedBigInteger('commission_paid')->default(0);
            $table->unsignedBigInteger('net_revenue')->default(0);
            $table->unsignedInteger('order_count')->default(0);
            $table->unsignedBigInteger('refund_amount')->default(0);
            $table->unsignedInteger('refund_count')->default(0);
            $table->timestamp('computed_at');

            $table->unique(['store_id', 'metric_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_store_metrics');
    }
};
