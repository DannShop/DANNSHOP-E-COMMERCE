<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.17 (unchanged from v1).
     *
     * response_deadline powers the default-resolution-timeout sweep job
     * (Flows v1 Flow 10): if both parties go silent during investigation,
     * the dispute does not sit open indefinitely — it resolves
     * automatically per a stated policy (e.g. buyer's favor after 5
     * business days of seller silence) when this deadline passes.
     *
     * raised_by_type intentionally allows 'admin' — you may open a
     * dispute proactively (e.g. noticing a suspicious pattern) without
     * either party having filed one first.
     */
    public function up(): void
    {
        Schema::create('disputes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->enum('raised_by_type', ['buyer', 'seller', 'admin']);
            $table->text('reason');
            $table->enum('status', [
                'open',
                'awaiting_seller_response',
                'awaiting_buyer_response',
                'resolved_buyer_favor',
                'resolved_seller_favor',
                'resolved_partial',
            ])->default('open');
            $table->text('resolution_note')->nullable();
            $table->foreignId('resolved_by_admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('response_deadline')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'response_deadline']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('disputes');
    }
};
