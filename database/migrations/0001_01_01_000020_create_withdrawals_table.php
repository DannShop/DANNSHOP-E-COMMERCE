<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.12.
     *
     * payout_method_id replaces the v1 design of inline
     * destination_type/destination_details_encrypted columns — a
     * withdrawal now references a saved, reusable seller_payout_methods
     * row (Normalization finding #5). This is also what makes the
     * fraud-signal check from Flows v1 Flow 7 ("flag if destination
     * changed recently") implementable: the app compares this
     * withdrawal's created_at against the payout method's created_at.
     *
     * status='failed' is distinct from 'rejected': failed means admin
     * approved and the real transfer was attempted but didn't succeed;
     * rejected means admin declined before any transfer was attempted.
     * Both release the reserved amount back to available balance
     * identically, but the audit trail differs.
     *
     * status='cancelled' is the seller-initiated cancel, valid only
     * while status='pending' (Flows v1 Flow 7 edge case) — enforced at
     * the application layer in WithdrawalService, not the schema, since
     * "valid only in this prior state" is a transition rule, not a
     * structural constraint.
     *
     * The CHECK constraint (Normalization finding #2) makes
     * amount_payable's dependency on amount_requested - fee_amount a
     * database guarantee instead of a convention.
     */
    public function up(): void
    {
        Schema::create('withdrawals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained('wallets')->restrictOnDelete();
            $table->foreignId('store_id')->constrained('stores')->restrictOnDelete();
            $table->foreignId('payout_method_id')->constrained('seller_payout_methods')->restrictOnDelete();
            $table->unsignedBigInteger('amount_requested');
            $table->unsignedBigInteger('fee_amount')->default(0);
            $table->unsignedBigInteger('amount_payable');
            $table->enum('status', [
                'pending', 'approved', 'processing',
                'completed', 'rejected', 'failed', 'cancelled',
            ])->default('pending');
            $table->foreignId('reviewed_by_admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->text('failure_reason')->nullable();
            $table->timestamps();

            $table->index('status');
        });

        DB::statement('
            ALTER TABLE withdrawals
            ADD CONSTRAINT chk_payable_consistency
            CHECK (amount_payable = amount_requested - fee_amount)
        ');
    }

    public function down(): void
    {
        Schema::dropIfExists('withdrawals');
    }
};
