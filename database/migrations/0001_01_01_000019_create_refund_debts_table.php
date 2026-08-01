<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.10a — new table required by Wildan's
     * explicit "balance must never go negative" decision.
     *
     * When a refund is approved and the seller's available balance can't
     * fully cover it, the wallet is debited for whatever it CAN cover
     * (down to zero, never below), and the remainder becomes a row here.
     * On every subsequent credit_sale for that wallet, a portion of the
     * new sale (capped at 50% of that sale's net_amount — Financial
     * Ledger Risk finding #21, see WalletService::recoverDebt()) is
     * redirected to pay down amount_owed via a debit_debt_recovery
     * ledger entry, until amount_recovered = amount_owed, at which point
     * the held refund (refunds.status='pending_seller_balance') finally
     * executes.
     *
     * status='written_off' is a manual admin decision only — never
     * automatic — for cases like a closed seller account with
     * uncollectible debt.
     *
     * The CHECK constraint is a basic sanity bound: recovered can never
     * exceed owed, regardless of what application code does.
     */
    public function up(): void
    {
        Schema::create('refund_debts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained('wallets')->cascadeOnDelete();
            $table->foreignId('refund_id')->unique()->constrained('refunds')->cascadeOnDelete();
            $table->unsignedBigInteger('amount_owed');
            $table->unsignedBigInteger('amount_recovered')->default(0);
            $table->enum('status', ['outstanding', 'fully_recovered', 'written_off'])->default('outstanding');
            $table->timestamps();

            $table->index(['wallet_id', 'status']);
        });

        DB::statement('
            ALTER TABLE refund_debts
            ADD CONSTRAINT chk_recovered_not_exceeding_owed
            CHECK (amount_recovered <= amount_owed)
        ');
    }

    public function down(): void
    {
        Schema::dropIfExists('refund_debts');
    }
};
