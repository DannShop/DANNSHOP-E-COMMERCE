<?php

use App\Http\Controllers\Api\Admin\AdminPaymentProviderController;
use App\Http\Controllers\Api\Admin\AdminWithdrawalController;
use App\Http\Controllers\Api\Public\AuthController;
use App\Http\Controllers\Api\Public\CheckoutController;
use App\Http\Controllers\Api\Public\StorefrontController;
use App\Http\Controllers\Api\Public\WebhookController;
use App\Http\Controllers\Api\Seller\SellerOrderController;
use App\Http\Controllers\Api\Seller\SellerPayoutMethodController;
use App\Http\Controllers\Api\Seller\SellerProductController;
use App\Http\Controllers\Api\Seller\SellerStoreController;
use App\Http\Controllers\Api\Seller\SellerWalletController;
use App\Http\Controllers\Api\Seller\SellerWithdrawalController;
use Illuminate\Support\Facades\Route;

/**
 * Per the Gemini instructions document §4: every route here returns
 * the {success, data} / {success, message, errors} contract via the
 * ApiResponse trait. Three middleware groups mirror the three surfaces
 * from Architecture v1 §9.1: public (no auth), seller (auth:sanctum +
 * EnsureUserIsSeller), admin (auth:sanctum + EnsureUserIsAdmin).
 */

// ============ PUBLIC (no auth — guest checkout is mandatory, Architecture v1 §9) ============

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::get('/stores/{slug}', [StorefrontController::class, 'show']);
Route::get('/stores/{slug}/products', [StorefrontController::class, 'products']);
Route::get('/stores/{slug}/products/{productSlug}', [StorefrontController::class, 'productDetail']);

Route::post('/orders', [CheckoutController::class, 'store']);
Route::get('/orders/{orderNumber}/status', [CheckoutController::class, 'status']);
Route::post('/order-lookup', [CheckoutController::class, 'lookup']);

// Webhook routes are intentionally OUTSIDE any auth middleware — see
// WebhookController's docblock for why (signature verification
// replaces Laravel's normal auth for these requests). Also excluded
// from CSRF (Laravel API routes already are, by default, but stated
// here as a deliberate fact, not an oversight, given how
// security-critical this endpoint is).
Route::post('/webhooks/{provider}', [WebhookController::class, 'handle']);

// Deliberately outside the 'seller' middleware group — see
// SellerStoreController::store()'s docblock for why. Requires login,
// but not an existing Store (that would be circular).
Route::middleware('auth:sanctum')->post('/create-store', [SellerStoreController::class, 'store']);

// ============ SELLER (auth:sanctum + must own a Store) ============

Route::middleware(['auth:sanctum', 'seller'])->prefix('seller')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/store', [SellerStoreController::class, 'show']);
    Route::patch('/store', [SellerStoreController::class, 'update']);
    Route::post('/store/change-slug', [SellerStoreController::class, 'changeSlug']);

    Route::get('/wallet', [SellerWalletController::class, 'show']);
    Route::get('/wallet/ledger', [SellerWalletController::class, 'ledger']);

    Route::get('/dashboard-summary', [SellerOrderController::class, 'summary']);
    Route::get('/orders', [SellerOrderController::class, 'index']);

    Route::get('/payout-methods', [SellerPayoutMethodController::class, 'index']);
    Route::post('/payout-methods', [SellerPayoutMethodController::class, 'store']);

    Route::get('/withdrawals', [SellerWithdrawalController::class, 'index']);
    Route::post('/withdrawals', [SellerWithdrawalController::class, 'store']);
    Route::post('/withdrawals/{id}/cancel', [SellerWithdrawalController::class, 'cancel']);

    Route::get('/products/types', [SellerProductController::class, 'types']);
    Route::get('/products', [SellerProductController::class, 'index']);
    Route::post('/products', [SellerProductController::class, 'store']);
    Route::post('/products/{id}/publish', [SellerProductController::class, 'publish']);
});

// ============ ADMIN (auth:sanctum + is_admin) ============

Route::middleware(['auth:sanctum', 'admin'])->prefix('admin')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/withdrawals', [AdminWithdrawalController::class, 'index']);
    Route::post('/withdrawals/{id}/approve', [AdminWithdrawalController::class, 'approve']);
    Route::post('/withdrawals/{id}/complete', [AdminWithdrawalController::class, 'complete']);
    Route::post('/withdrawals/{id}/reject', [AdminWithdrawalController::class, 'reject']);

    Route::get('/payment-providers', [AdminPaymentProviderController::class, 'index']);
    Route::post('/payment-providers/activate', [AdminPaymentProviderController::class, 'activate']);
    Route::post('/payment-providers/deactivate', [AdminPaymentProviderController::class, 'deactivate']);
});
