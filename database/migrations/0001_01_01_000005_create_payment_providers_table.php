<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.14.
     *
     * This table is what makes Architecture v1 §8's PaymentGatewayInterface
     * abstraction real at the data layer, not just at the code layer:
     * adding a new provider (e.g. Midtrans in 🟡 V2) becomes an admin-panel
     * data entry pointing at an existing Gateway implementation class,
     * not a deploy. provider_key is the string used by
     * PaymentGatewayManager to resolve which Gateway class to instantiate.
     *
     * is_active: exactly one TRUE row expected in MVP (single active
     * provider, Architecture v1 §8.2). priority exists now, unused, for
     * 🟡 V2 multi-provider routing.
     *
     * encryption_key_version: same key-rotation rationale as
     * seller_payout_methods.
     */
    public function up(): void
    {
        Schema::create('payment_providers', function (Blueprint $table) {
            $table->id();
            $table->string('provider_key', 50)->unique(); // 'okeconnect','orderkuota','qiospay','gopay','midtrans',...
            $table->string('display_name', 100);
            $table->boolean('is_active')->default(false);
            $table->boolean('supports_dynamic_qris')->default(false);
            $table->text('credentials_encrypted');
            $table->unsignedSmallInteger('encryption_key_version');
            $table->smallInteger('priority')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_providers');
    }
};
