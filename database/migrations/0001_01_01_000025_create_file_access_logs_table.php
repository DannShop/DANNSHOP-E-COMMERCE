<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.21 (unchanged from v1).
     *
     * Deliberately minimal: this is not an analytics table, it is
     * dispute evidence for Flows v1 Flow 10's "seller disputes a buyer's
     * dispute" edge case (e.g. buyer claims non-delivery of a digital
     * file the access log shows they actually downloaded). One row per
     * actual download-link access, nothing more — resist the temptation
     * to enrich it (user agent, geolocation) until a real dispute
     * actually needs that.
     */
    public function up(): void
    {
        Schema::create('file_access_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('asset_id')->constrained('product_assets')->cascadeOnDelete();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('accessed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('file_access_logs');
    }
};
