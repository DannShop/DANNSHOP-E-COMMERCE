<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.10.
     *
     * cached_balance is UNSIGNED — per Wildan's explicit decision, a
     * seller's wallet must NEVER show a negative number. Shortfalls from
     * refunds exceeding available balance are tracked separately in
     * refund_debts (see that migration) rather than allowing this column
     * to go negative.
     *
     * cached_available_balance = cached_balance minus amounts reserved by
     * pending/processing withdrawals AND minus cached_outstanding_debt.
     * Both are reconciled nightly against the true ledger sum
     * (wallet_ledger_entries) — these cached columns are a read-performance
     * optimization, never the sole source of truth. See
     * Database Architecture v2 §6 for the full invariant.
     */
    public function up(): void
    {
        Schema::create('wallets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->unique()->constrained('stores')->cascadeOnDelete();
            $table->unsignedBigInteger('cached_balance')->default(0);
            $table->unsignedBigInteger('cached_available_balance')->default(0);
            $table->unsignedBigInteger('cached_outstanding_debt')->default(0);
            $table->timestamp('last_reconciled_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallets');
    }
};
