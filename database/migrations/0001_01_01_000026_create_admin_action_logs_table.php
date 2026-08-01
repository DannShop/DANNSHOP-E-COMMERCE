<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.22.
     *
     * restrictOnDelete on admin_id (Security finding #14, fixed in v2):
     * an admin user record can never be hard-deleted while audit log
     * rows reference it — consistent with soft-delete being used
     * everywhere else in this schema, stated explicitly here because
     * audit-trail integrity is the entire point of this table.
     *
     * Generic/flexible by design (JSON detail column, free-text
     * action_type/target_type) unlike order_status_history or
     * wallet_ledger_entries, which are domain-specific records that
     * other business logic reads back and therefore need stable,
     * predictable shapes. This table is read only by you, auditing your
     * own admin behavior.
     */
    public function up(): void
    {
        Schema::create('admin_action_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_id')->constrained('users')->restrictOnDelete();
            $table->string('action_type', 50); // 'withdrawal_approved','refund_approved','wallet_adjustment','store_suspended', etc.
            $table->string('target_type', 50); // 'withdrawal','refund','store','wallet', etc.
            $table->unsignedBigInteger('target_id');
            $table->json('detail')->nullable();
            $table->timestamp('created_at');

            $table->index(['target_type', 'target_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_action_logs');
    }
};
