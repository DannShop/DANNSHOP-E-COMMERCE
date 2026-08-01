/**
 * DannShop — Orders Page JS
 * GET /api/seller/orders → SellerOrderController::index
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

function badgeClass(status) {
  const map = {
    pending: 'pending', paid: 'paid', fulfilled: 'fulfilled', completed: 'completed',
    cancelled: 'cancelled', expired: 'expired', refunded: 'refunded', disputed: 'disputed',
  };
  return map[status] || 'pending';
}

function renderOrders(orders) {
  const container = document.getElementById('orders-container');

  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🧾</div>
        <div class="title">Belum ada pesanan</div>
        <div class="desc">Pesanan dari pembeli akan muncul di sini setelah ada penjualan.</div>
      </div>
    `;
    return;
  }

  const rows = orders.map((order) => `
    <tr>
      <td data-label="No. Pesanan">${order.order_number}</td>
      <td data-label="Produk">${escapeHtml(order.product?.name || '-')}</td>
      <td data-label="Pembeli">${escapeHtml(order.buyer_email)}</td>
      <td data-label="Kotor" class="amount-cell">${order.gross_amount_formatted}</td>
      <td data-label="Bersih" class="amount-cell">${order.net_amount_formatted}</td>
      <td data-label="Status"><span class="status-badge ${badgeClass(order.status)}">${statusLabel(order.status)}</span></td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>No. Pesanan</th><th>Produk</th><th>Pembeli</th><th>Kotor</th><th>Bersih</th><th>Status</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function init() {
  if (!requireAuth()) return;

  renderDashboardShell('orders');

  try {
    const res = await authFetch('/seller/orders');
    const json = await res.json();
    renderOrders(json.data);
  } catch (err) {
    document.getElementById('orders-container').innerHTML = `
      <div class="empty-state"><div class="icon">😕</div><div class="title">Gagal memuat pesanan</div><div class="desc">${escapeHtml(err.message)}</div></div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', init);
