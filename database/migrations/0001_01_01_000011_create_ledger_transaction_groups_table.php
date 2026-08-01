<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.11a — THE most important new table in
     * the v2 revision, fixing Financial Ledger Risk finding #19.
     *
     * In v1, a sale's credit_sale and debit_commission ledger entries
     * were related only by being written in the same DB transaction and
     * sharing a reference_id — nothing in the schema GUARANTEED they'd
     * always come as a pair. This table is the parent every related set
     * of wallet_ledger_entries rows belongs to.
     *
     * expected_entry_count vs actual_entry_count is what makes a
     * reconciliation sweep trivial: any row where these two don't match
     * is, by definition, an incomplete or corrupted financial transaction
     * — surfaced as a critical alert instead of discovered months later
     * during a reconciliation crisis.
     *
     * This table is created before wallet_ledger_entries because
     * wallet_ledger_entries.transaction_group_id is a REAL, enforced
     * foreign key into this table (see Database Architecture v2 §3.11 —
     * this supersedes v1's "acceptable tradeoff" framing of an unenforced
     * polymorphic reference).
     */
    public function up(): void
    {
        Schema::create('ledger_transaction_groups', function (Blueprint $table) {
            $table->id();
            $table->enum('group_type', [
                'sale',
                'withdrawal_completion',
                'withdrawal_release',
                'refund',
                'debt_recovery',
                'admin_adjustment',
            ]);
            $table->string('reference_type', 50); // 'order', 'withdrawal', 'refund'
            $table->unsignedBigInteger('reference_id');
            $table->unsignedTinyInteger('expected_entry_count');
            $table->unsignedTinyInteger('actual_entry_count')->default(0);
            $table->timestamp('created_at');

            $table->index(['actual_entry_count', 'expected_entry_count'], 'idx_ledger_group_integrity_check');
            $table->index(['reference_type', 'reference_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ledger_transaction_groups');
    }
};
