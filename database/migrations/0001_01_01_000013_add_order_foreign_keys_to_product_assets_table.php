<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Resolves the deferred FKs from the product_assets migration.
     * product_assets is created before orders in the dependency chain
     * (products → product_assets happens before orders, since orders
     * itself depends on products), so reserved_by_order_id and
     * sold_to_order_id could only be declared as plain unsigned columns
     * there. Now that orders exists, we attach the actual foreign key
     * constraints.
     *
     * nullOnDelete is used rather than cascade: if an order is ever hard-
     * deleted (which should never happen given soft deletes are used
     * everywhere, but defense in depth), an asset should fall back to an
     * unreserved/unsold state rather than being deleted itself — the
     * asset's existence is independent of any single order referencing it.
     */
    public function up(): void
    {
        Schema::table('product_assets', function (Blueprint $table) {
            $table->foreign('reserved_by_order_id')->references('id')->on('orders')->nullOnDelete();
            $table->foreign('sold_to_order_id')->references('id')->on('orders')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('product_assets', function (Blueprint $table) {
            $table->dropForeign(['reserved_by_order_id']);
            $table->dropForeign(['sold_to_order_id']);
        });
    }
};
