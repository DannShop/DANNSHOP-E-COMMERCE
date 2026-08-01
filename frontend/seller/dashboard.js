/**
 * DannShop — Seller Dashboard Home JS
 * GET /api/seller/wallet              → SellerWalletController::show
 * GET /api/seller/dashboard-summary   → SellerOrderController::summary
 * GET /api/seller/orders              → SellerOrderController::index
 */

function statusLabel(status) {
  const labels = {
    pending: 'Menunggu Pembayaran',
    paid: 'Dibayar',
    fulfilled: 'Terkirim',
    completed: 'Selesai',
    cancelled: 'Dibatalkan',
    expired: 'Kedaluwarsa',
    refunded: 'Direfund',
    disputed: 'Disengketakan',
  };
  return labels[status] || status;
}

function renderStats(wallet, summary) {
  document.getElementById('stat-row').innerHTML = `
    <div class="stat-card primary-balance">
      <div class="label">Saldo Tersedia</div>
      <div class="value">${wallet.available_balance_formatted}</div>
    </div>
    <div class="stat-card">
      <div class="label">Penjualan Hari Ini</div>
      <div class="value">${summary.today_gross_sales_formatted}</div>
    </div>
    <div class="stat-card">
      <div class="label">Pesanan Baru</div>
      <div class="value">${summary.new_order_count}</div>
    </div>
  `;

  if (wallet.has_outstanding_debt) {
    document.getElementById('debt-warning-banner').innerHTML = `
      <div class="alert alert-warning">
        ⚠ Anda memiliki kewajiban refund sebesar <strong>${wallet.outstanding_debt_formatted}</strong> yang sedang dipulihkan secara bertahap dari penjualan berikutnya (maksimal 50% per transaksi).
      </div>
    `;
  }
}

function renderRecentOrders(orders) {
  const container = document.getElementById('recent-orders-container');

  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🧾</div>
        <div class="title">Belum ada pesanan</div>
        <div class="desc">Pesanan dari pembeli akan muncul di sini.</div>
      </div>
    `;
    return;
  }

  const rows = orders.slice(0, 5).map((order) => `
    <tr>
      <td data-label="Pesanan">${escapeHtml(order.product?.name || '-')}</td>
      <td data-label="Jumlah" class="amount-cell">${order.net_amount_formatted}</td>
      <td data-label="Status"><span class="status-badge ${order.status}">${statusLabel(order.status)}</span></td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Pesanan</th><th>Pendapatan Bersih</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function init() {
  if (!requireAuth()) return;

  renderDashboardShell('home');

  try {
    const [walletRes, summaryRes, ordersRes] = await Promise.all([
      authFetch('/seller/wallet'),
      authFetch('/seller/dashboard-summary'),
      authFetch('/seller/orders'),
    ]);

    const wallet = (await walletRes.json()).data;
    const summary = (await summaryRes.json()).data;
    const orders = (await ordersRes.json()).data;

    renderStats(wallet, summary);
    renderRecentOrders(orders);
  } catch (err) {
    document.getElementById('recent-orders-container').innerHTML = `
      <div class="empty-state">
        <div class="icon">😕</div>
        <div class="title">Gagal memuat data</div>
        <div class="desc">${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', init);
