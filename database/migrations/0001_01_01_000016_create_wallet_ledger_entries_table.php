<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.11 — THE most important table in the
     * entire database. This is the append-only source of truth for all
     * money movement; wallets.cached_balance is a derived/cached
     * convenience, never the other way around.
     *
     * transaction_group_id is a REAL, enforced foreign key into
     * ledger_transaction_groups (RESTRICT on delete — a group can never
     * be removed while entries reference it). This is the fix for
     * Financial Ledger Risk finding #18: in v1, reference_type/
     * reference_id was the ONLY integrity mechanism on this table, and it
     * was an unenforced polymorphic reference. Now there is a real FK
     * guaranteeing every entry has a valid anchor point.
     *
     * reference_type/reference_id are RETAINED for convenient direct
     * querying ("show me ledger entries for order #123") but are no
     * longer the sole trust boundary — they are a query-convenience
     * index, not load-bearing integrity.
     *
     * amount is SIGNED (positive=credit, negative=debit) — this is
     * distinct from wallets.cached_balance being UNSIGNED. The ledger
     * records the signed flow of money; the wallet's cached balance is
     * the (always non-negative, per Wildan's decision) running result.
     *
     * balance_after is write-once at insert time, computed from the live
     * sum at that moment — it is NEVER independently updated. This
     * requires every write to this table for a given wallet to occur
     * while holding a SELECT ... FOR UPDATE lock on that wallet's row
     * (Financial Ledger Risk finding #20) — stated here as a hard
     * implementation rule for WalletService, since it cannot be expressed
     * as a schema constraint.
     *
     * No updated_at, no deleted_at: this table is never edited or
     * removed, full stop.
     */
    public function up(): void
    {
        Schema::create('wallet_ledger_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained('wallets')->restrictOnDelete();
            $table->foreignId('transaction_group_id')->constrained('ledger_transaction_groups')->restrictOnDelete();
            $table->enum('entry_type', [
                'credit_sale',
                'debit_commission',
                'debit_withdrawal',
                'credit_withdrawal_release',
                'debit_refund_reversal',
                'credit_refund_release',
                'debit_debt_recovery',
                'adjustment',
            ]);
            $table->bigInteger('amount'); // SIGNED: positive=credit, negative=debit
            $table->string('reference_type', 50); // 'order', 'withdrawal', 'refund', 'admin_adjustment' — convenience only, see note above
            $table->unsignedBigInteger('reference_id');
            $table->unsignedBigInteger('balance_after');
            $table->text('note')->nullable(); // mandatory at the application layer for entry_type='adjustment'
            $table->foreignId('created_by_admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at');

            $table->index(['wallet_id', 'created_at']);
            $table->index(['reference_type', 'reference_id']);
            $table->index('transaction_group_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallet_ledger_entries');
    }
};
