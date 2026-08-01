<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §10.2 — new table, the platform-wide
     * counterpart to daily_store_metrics. Answers "how is DannShop doing
     * this month" (Architecture v1 §4 Admin Journey) without a live
     * aggregate query across every order ever placed.
     */
    public function up(): void
    {
        Schema::create('daily_platform_metrics', function (Blueprint $table) {
            $table->id();
            $table->date('metric_date')->unique();
            $table->unsignedBigInteger('gmv')->default(0); // gross merchandise value, platform-wide
            $table->unsignedBigInteger('commission_revenue')->default(0);
            $table->unsignedInteger('active_store_count')->default(0);
            $table->unsignedInteger('new_store_count')->default(0);
            $table->unsignedInteger('order_count')->default(0);
            $table->unsignedBigInteger('refund_amount')->default(0);
            $table->timestamp('computed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_platform_metrics');
    }
};
