<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.2.
     *
     * UNIQUE(user_id) deliberately enforces "one store per seller" as a
     * hard schema fact for now (Normalization finding #3, explicitly NOT
     * fixed pre-emptively). When 🔵 V3 multi-store ships, this is a one-line
     * migration to drop the constraint — documented here so it's a
     * conscious deferral, not a forgotten gap.
     *
     * slug_changed_at enforces the 30-day slug-change cooldown
     * (Flows v1 Flow 2) at the application layer; the column itself has
     * no DB-level enforcement of the cooldown window (that's a business
     * rule checked in StoreService::changeSlug(), not something a
     * CHECK constraint can express against "now").
     */
    public function up(): void
    {
        Schema::create('stores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->string('slug', 50)->unique();
            $table->string('name', 100);
            $table->text('bio')->nullable();
            $table->string('logo_path', 255)->nullable();
            $table->string('banner_path', 255)->nullable();
            $table->enum('status', ['active', 'suspended', 'pending_review'])->default('active');
            $table->json('social_links')->nullable();
            $table->json('theme_settings')->nullable(); // 🟡 V2 hook, unused in MVP UI
            $table->timestamp('slug_changed_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stores');
    }
};
