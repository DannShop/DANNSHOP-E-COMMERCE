<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.15 + §9.2.
     *
     * UNIQUE(payment_provider_id, provider_reference) is not just a
     * performance index — it is a DATABASE-ENFORCED IDEMPOTENCY
     * GUARANTEE. The application-layer check (query before insert) is
     * the primary defense; this constraint is the backstop that makes a
     * double-credit structurally impossible even if the application
     * check had a bug or a race condition slipped through it. This is
     * the single highest-consequence failure mode in the entire payment
     * system (Architecture v1 §8.4) — belt and suspenders, deliberately.
     *
     * Archival policy (Scalability finding #8, stated as an operational
     * rule rather than a schema feature): rows older than 12 months with
     * status != 'pending' are eligible for archival to cold storage via
     * a scheduled job. Not urgent at MVP volume, but planned now rather
     * than discovered later as "why is this table 40GB."
     */
    public function up(): void
    {
        Schema::create('payment_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('payment_provider_id')->constrained('payment_providers');
            $table->string('provider_reference', 255);
            $table->enum('event_type', ['payment_created', 'webhook_received', 'status_poll', 'manual_match']);
            $table->json('raw_payload');
            $table->enum('status', ['pending', 'success', 'failed']);
            $table->timestamp('attempted_at')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamp('created_at');

            $table->unique(['payment_provider_id', 'provider_reference'], 'payment_tx_provider_ref_unique');
            $table->index('order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_transactions');
    }
};
