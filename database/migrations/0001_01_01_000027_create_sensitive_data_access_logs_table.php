<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.23 — new table fixing Security finding
     * #13.
     *
     * admin_action_logs records CHANGES an admin makes. It does not
     * record when an admin VIEWS decrypted sensitive data without
     * changing anything — e.g. looking up a seller's bank account number
     * while reviewing a withdrawal, or viewing a stored game-account
     * credential while investigating a dispute. "Who looked at this and
     * when" is a meaningful security property independent of "who
     * changed this," especially once a second admin/support person ever
     * joins and you need to know whose access to review after an
     * incident.
     *
     * Deliberately lightweight: no JSON blob, just resource + reason +
     * timestamp. One small insert per sensitive view is a reasonable
     * price for the audit capability it buys.
     */
    public function up(): void
    {
        Schema::create('sensitive_data_access_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_id')->constrained('users')->restrictOnDelete();
            $table->string('resource_type', 50); // 'seller_payout_method','product_asset_credential','withdrawal_destination'
            $table->unsignedBigInteger('resource_id');
            $table->string('access_reason', 255)->nullable(); // optional free-text, e.g. "withdrawal review #4821"
            $table->timestamp('accessed_at');

            $table->index(['admin_id', 'accessed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sensitive_data_access_logs');
    }
};
