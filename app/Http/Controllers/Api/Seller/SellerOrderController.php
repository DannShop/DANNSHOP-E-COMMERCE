<?php

namespace App\Http\Controllers\Api\Seller;

use App\Domain\Order\Models\Order;
use App\Http\Controllers\Controller;
use App\Http\Resources\SellerOrderResource;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Architecture v1 §9.1: the seller dashboard's order list and home
 * summary. summary() specifically powers the "Penjualan Hari Ini" /
 * "Pesanan Baru" stat cards from Design System §9.1 — a live query
 * scoped to today, since daily_store_metrics (Database Architecture
 * v2 §10.1) only has YESTERDAY's settled data; "today so far" is
 * exactly the live-query-layered-on-top case that table's docblock
 * describes.
 */
class SellerOrderController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/seller/orders
     */
    public function index(Request $request): JsonResponse
    {
        $store = $request->user()->store;

        $orders = Order::query()
            ->where('store_id', $store->id)
            ->with('product')
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return $this->success(SellerOrderResource::collection($orders));
    }

    /**
     * GET /api/seller/dashboard-summary
     * Powers the dashboard home's stat cards. Today's gross sales and
     * new-order count are computed live (today isn't in
     * daily_store_metrics yet, which only has settled prior days).
     */
    public function summary(Request $request): JsonResponse
    {
        $store = $request->user()->store;

        $todayStats = Order::query()
            ->where('store_id', $store->id)
            ->whereIn('status', ['paid', 'fulfilled', 'completed'])
            ->whereDate('created_at', now()->toDateString())
            ->selectRaw('COALESCE(SUM(gross_amount), 0) as gross_sales, COUNT(*) as order_count')
            ->first();

        $newOrderCount = Order::query()
            ->where('store_id', $store->id)
            ->where('status', 'pending')
            ->whereDate('created_at', now()->toDateString())
            ->count();

        return $this->success([
            'today_gross_sales' => (int) $todayStats->gross_sales,
            'today_gross_sales_formatted' => 'Rp '.number_format($todayStats->gross_sales, 0, ',', '.'),
            'today_order_count' => (int) $todayStats->order_count,
            'new_order_count' => $newOrderCount,
        ]);
    }
}
