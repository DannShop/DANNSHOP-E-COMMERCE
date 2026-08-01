<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.1.
     *
     * `role_hint` is deliberately named to make clear it is a display/default
     * hint, NOT an access-control gate. Actual seller capability is derived
     * from EXISTS(stores WHERE user_id = users.id) — see Domain/Store/Services.
     *
     * `is_admin` (added this session) is the explicit, dedicated access-
     * control gate for admin capability — deliberately a SEPARATE column
     * from role_hint, never conflated with it. Wildan's decision: for
     * MVP's single-admin scale, a simple boolean is proportional; a
     * dedicated `admins` table with per-admin permissions is a
     * reasonable additive migration later if multiple admins with
     * different authority levels are ever needed — not built now
     * because that need doesn't exist yet.
     *
     * `failed_login_attempts` / `locked_until` close Security finding #12
     * from the adversarial schema review: a money platform with no
     * brute-force lockout at the schema level was a real gap.
     */
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name', 255);
            $table->string('email', 255)->unique();
            $table->string('phone', 20)->nullable()->unique();
            $table->string('password', 255);
            $table->enum('role_hint', ['buyer', 'seller', 'admin'])->default('buyer');
            $table->boolean('is_admin')->default(false);
            $table->timestamp('email_verified_at')->nullable();
            $table->timestamp('phone_verified_at')->nullable();
            $table->unsignedSmallInteger('failed_login_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
