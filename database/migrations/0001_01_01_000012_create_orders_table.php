<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.7.
     *
     * gross_amount is locked at order creation (Flows v1 Flow 3's price-
     * change protection edge case) — never re-derived from the live
     * products.price at payment-confirmation time.
     *
     * commission_amount and net_amount are denormalized (derivable from
     * gross_amount + the commission rule's rate) for fast dashboard reads,
     * but the CHECK constraint below (Normalization finding #1) makes it
     * impossible for these three columns to drift out of consistency —
     * the performance benefit of denormalization without the integrity
     * risk.
     *
     * status='expired' is distinct from 'cancelled' to distinguish
     * auto-expiry (Flows v1 Flow 4) from buyer-initiated cancellation —
     * this distinction matters for reporting and for the order_status_history
     * trail's "how did it get here" question.
     *
     * payable_amount (distinct from gross_amount) supports the
     * static-QRIS uniqueness-offset strategy (Architecture v1 §8.3) —
     * it is NEVER used in wallet/commission calculations, which always
     * derive from gross_amount, preventing a subtle bug where the offset
     * amount itself gets credited.
     */
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number', 30)->unique(); // e.g. DS-20260620-00001
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('buyer_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('buyer_email', 255);
            $table->string('buyer_phone', 20);
            $table->unsignedBigInteger('gross_amount');
            $table->unsignedBigInteger('commission_amount');
            $table->unsignedBigInteger('net_amount');
            $table->foreignId('commission_rule_id')->constrained('commission_rules');
            $table->enum('status', [
                'pending', 'paid', 'fulfilled', 'completed',
                'cancelled', 'expired', 'refunded', 'disputed',
            ])->default('pending');
            $table->foreignId('payment_provider_id')->nullable()->constrained('payment_providers');
            $table->unsignedBigInteger('payable_amount')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['store_id', 'status']);
            $table->index(['buyer_email', 'buyer_phone']);
            $table->index(['status', 'expires_at']);
        });

        // Normalization finding #1: gross = commission + net, enforced at the DB level.
        DB::statement('
            ALTER TABLE orders
            ADD CONSTRAINT chk_order_amount_consistency
            CHECK (gross_amount = commission_amount + net_amount)
        ');
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
