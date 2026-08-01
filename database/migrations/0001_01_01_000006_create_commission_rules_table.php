<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.13 + §7.3.
     *
     * Rows are NEVER updated in place to change a rate. A rate change is
     * always: close out the current active row (set effective_until),
     * then insert a new row — both inside one transaction. This is
     * enforced procedurally in CommissionService::setRate(), not by the
     * database alone, because MySQL has no true range-exclusion
     * constraint (Financial Ledger Risk finding #22).
     *
     * The unique index below is a partial backstop: it prevents two rules
     * for the same scope starting at the exact same instant (catches
     * double-submission bugs), but does NOT prevent overlapping ranges in
     * general — that guarantee is procedural, enforced in the service
     * layer's "find the currently-active row WHERE effective_until IS
     * NULL, close it, then insert" pattern.
     *
     * scope_type includes 'product_type' (beyond the original sketch) to
     * support 🔵 V3's "game top-up margins differ from ebook margins"
     * without a new table.
     */
    public function up(): void
    {
        Schema::create('commission_rules', function (Blueprint $table) {
            $table->id();
            $table->enum('scope_type', ['global', 'store', 'category', 'product_type'])->default('global');
            $table->unsignedBigInteger('scope_id')->nullable(); // store_id/category_id depending on scope_type; null when scope_type='global'
            $table->decimal('rate_percent', 5, 2); // e.g. 5.00 for 5%
            $table->unsignedBigInteger('flat_fee_amount')->nullable();
            $table->timestamp('effective_from');
            $table->timestamp('effective_until')->nullable(); // null = currently active
            $table->timestamps();

            $table->unique(['scope_type', 'scope_id', 'effective_from'], 'uq_commission_scope_window');
            $table->index(['scope_type', 'scope_id', 'effective_until'], 'idx_commission_active_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('commission_rules');
    }
};
