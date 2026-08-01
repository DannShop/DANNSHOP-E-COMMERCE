<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.18.
     *
     * Separated from orders.status to support partial refunds (Flows v1
     * Flow 9 edge case) — refund_amount may be less than orders.gross_amount.
     *
     * status='pending_seller_balance' is NEW per Wildan's explicit
     * decision that wallet balance must never go negative: this refund
     * is approved, but execution is held because the seller's available
     * balance can't yet cover it. A refund_debts row exists for it (see
     * next migration) and execution resumes automatically once that debt
     * is fully recovered from future sales (capped at 50% per sale,
     * Database Architecture v2 §6.1a).
     *
     * status='execution_pending' is the distinct human-execution-gap
     * state from Flows v1 Flow 9: admin approved, seller balance WAS
     * sufficient, but the manual provider-side transfer back to the
     * buyer hasn't happened yet.
     *
     * seller_wallet_clawback_entry_id links to the specific ledger entry
     * that debited the seller — kept nullable because for
     * pending_seller_balance refunds, the clawback entry may not exist
     * yet (or only a partial one exists) at the time the refund row is
     * first created.
     */
    public function up(): void
    {
        Schema::create('refunds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('dispute_id')->nullable()->constrained('disputes')->nullOnDelete();
            $table->unsignedBigInteger('refund_amount');
            $table->enum('refund_type', ['full', 'partial']);
            $table->text('reason');
            $table->enum('status', [
                'approved',
                'pending_seller_balance',
                'execution_pending',
                'completed',
                'failed',
            ])->default('approved');
            $table->timestamp('buyer_payment_returned_at')->nullable();
            $table->foreignId('seller_wallet_clawback_entry_id')->nullable()
                ->constrained('wallet_ledger_entries')->nullOnDelete();
            $table->foreignId('approved_by_admin_id')->constrained('users');
            $table->timestamps();

            $table->index('order_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('refunds');
    }
};
