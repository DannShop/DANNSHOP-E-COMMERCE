<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.9 (carried from v1, unchanged) — fixes
     * the gap Flows v1 Flow 10 (Dispute) identified: a single mutable
     * orders.status column tells you WHERE an order is, not HOW it got
     * there. A dispute investigation weeks later needs to reconstruct
     * the latter.
     *
     * Append-only by design: no updated_at, no deleted_at. changed_by_id
     * is nullable specifically to represent system-triggered transitions
     * (e.g. the auto-expiry scheduled job), which have no human actor.
     */
    public function up(): void
    {
        Schema::create('order_status_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20);
            $table->enum('changed_by_type', ['system', 'admin', 'seller', 'buyer']);
            $table->unsignedBigInteger('changed_by_id')->nullable(); // user_id if human-triggered, null if system
            $table->text('note')->nullable();
            $table->timestamp('created_at');

            $table->index('order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_status_history');
    }
};
