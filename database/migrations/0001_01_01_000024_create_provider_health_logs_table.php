<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.20 + §9.4 (unchanged from v1) — 🟡 V2.
     * Exists now, unused by MVP's single-active-provider reality, so that
     * V2's "explicit routing rules, manual failover" (Architecture v1
     * §8.2) has somewhere to read from on day one of that feature's build.
     */
    public function up(): void
    {
        Schema::create('provider_health_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payment_provider_id')->constrained('payment_providers')->cascadeOnDelete();
            $table->enum('check_type', ['webhook_latency', 'api_uptime', 'manual_incident']);
            $table->enum('status', ['healthy', 'degraded', 'down']);
            $table->text('detail')->nullable();
            $table->timestamp('logged_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('provider_health_logs');
    }
};
