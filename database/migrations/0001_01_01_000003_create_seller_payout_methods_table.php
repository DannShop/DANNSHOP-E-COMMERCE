<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.2a — new table fixing Normalization
     * finding #5.
     *
     * Replaces the v1 design where bank/e-wallet destination details lived
     * inline on each `withdrawals` row. Sellers now save a reusable payout
     * method once; withdrawals reference it by FK (see withdrawals
     * migration). This also makes the Flows v1 Flow 7 fraud signal
     * ("destination changed recently") structurally checkable, which was
     * impossible under the v1 inline-details design.
     *
     * encryption_key_version (§3.2b) lets the app rotate the encryption
     * key incrementally instead of requiring a flag-day re-encryption of
     * every row.
     *
     * Soft delete is mandatory here: a seller removing a payout method
     * must not orphan the historical withdrawals that used it.
     */
    public function up(): void
    {
        Schema::create('seller_payout_methods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('label', 100);
            $table->enum('destination_type', ['bank_transfer', 'ewallet']);
            $table->text('destination_details_encrypted');
            $table->unsignedSmallInteger('encryption_key_version');
            $table->boolean('is_default')->default(false);
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('verified_at')->nullable(); // 🟡 V2: small-amount verification deposit flow
            $table->timestamps();
            $table->softDeletes();

            $table->index(['store_id', 'is_default']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('seller_payout_methods');
    }
};
