<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.16 (unchanged from v1).
     *
     * Direct schema for Flows v1 Flow 5's static-QRIS mismatch edge case:
     * a buyer pays the wrong amount, or two buyers' payable amounts
     * collide despite the offset strategy. This is a small, actively-
     * worked admin queue (unmatched → matched, or → refunded_unclaimed
     * if no order is ever found), deliberately separate from
     * payment_transactions because that table is a high-volume append-
     * only event log, not a task queue — conflating the two would be
     * awkward for both use cases.
     */
    public function up(): void
    {
        Schema::create('unmatched_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payment_provider_id')->constrained('payment_providers');
            $table->unsignedBigInteger('amount_received');
            $table->string('provider_reference', 255);
            $table->json('raw_payload');
            $table->enum('status', ['unmatched', 'matched', 'refunded_unclaimed'])->default('unmatched');
            $table->foreignId('matched_to_order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('matched_by_admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('matched_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'amount_received']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('unmatched_payments');
    }
};
