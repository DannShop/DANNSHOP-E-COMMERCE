<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database Architecture v2 §3.3 (unchanged from v1).
     *
     * Self-referencing parent_id, nesting-ready for 🟡 V2 — MVP UI will
     * likely only present flat categories, but the column exists now so
     * adding nested category browsing later is a UI change, not a
     * migration.
     *
     * type_scope lets the product-creation UI filter which categories are
     * relevant to a given product_type (e.g. "Game Top-Up" categories
     * shouldn't appear when creating an ebook listing).
     */
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->string('name', 100);
            $table->string('slug', 100)->unique();
            $table->enum('type_scope', ['digital', 'service', 'topup', 'ppob', 'general'])->default('general');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('categories');
    }
};
