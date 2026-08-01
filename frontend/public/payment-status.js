/**
 * DannShop — Payment Status JS
 * GET /api/orders/{orderNumber}/status → CheckoutController::status
 *
 * Polls every 5 seconds while status is 'pending' — since our 3 active
 * gateways (Midtrans/Xendit/Duitku/iPaymu) confirm via webhook (fast)
 * OR via the reconcile:payments scheduled job (up to ~1 minute delay
 * on Rumahweb's cron, per DannShop-Deploy-Rumahweb-Guide.md), polling
 * here is what lets the buyer's screen update without them needing to
 * manually refresh.
 */
const API_BASE_URL = '/api';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120; // 10 minutes — beyond this, stop polling and let the buyer refresh manually rather than polling forever

let pollCount = 0;
let pollTimer = null;

function formatIDR(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

function getOrderNumberFromUrl() {
  return new URLSearchParams(window.location.search).get('order');
}

async function fetchOrderStatus(orderNumber) {
  const res = await fetch(`${API_BASE_URL}/orders/${encodeURIComponent(orderNumber)}/status`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Pesanan tidak ditemukan.');
  return json.data;
}

function renderPending(order) {
  const content = document.getElementById('payment-status-content');

  // qris_image_url comes from the order's most recent payment
  // transaction — only present once initiatePayment() has run, which
  // happens immediately at checkout (CheckoutController::store()), so
  // it should always be present by the time this page loads.
  const qrisHtml = order.qris_image_url
    ? `<img src="${order.qris_image_url}" alt="QRIS">`
    : '<div style="color:var(--color-gray-400); font-size:13px;">QR Code sedang dimuat...</div>';

  content.innerHTML = `
    <div class="qris-image">${qrisHtml}</div>
    <h2>Menunggu Pembayaran</h2>
    <p>Scan QRIS di atas menggunakan aplikasi e-wallet atau mobile banking Anda.</p>
    <div class="amount">${formatIDR(order.payable_amount)}</div>
    <div class="alert alert-warning" style="text-align:left;">
      ⏳ Halaman ini akan otomatis memperbarui status begitu pembayaran terkonfirmasi. Jangan tutup halaman ini.
    </div>
  `;
}

function renderSuccess(order) {
  const content = document.getElementById('payment-status-content');
  content.innerHTML = `
    <div class="status-icon">✅</div>
    <h2>Pembayaran Berhasil!</h2>
    <p>Pesanan <strong>${order.order_number}</strong> telah dikonfirmasi.</p>
    <div class="alert alert-success" style="text-align:left;">
      Produk Anda akan segera tersedia. Periksa email <strong>${order.buyer_email || ''}</strong> untuk detail akses produk.
    </div>
  `;
}

function renderExpired(order) {
  const content = document.getElementById('payment-status-content');
  content.innerHTML = `
    <div class="status-icon">⏰</div>
    <h2>Waktu Pembayaran Habis</h2>
    <p>Pesanan ini telah kedaluwarsa karena tidak ada pembayaran yang diterima dalam batas waktu.</p>
    <a href="javascript:history.back()" class="btn btn-secondary">Coba Lagi</a>
  `;
}

function renderError(message) {
  const content = document.getElementById('payment-status-content');
  content.innerHTML = `
    <div class="status-icon">😕</div>
    <h2>Pesanan Tidak Ditemukan</h2>
    <p>${message}</p>
  `;
}

function renderTimedOutPolling(order) {
  const content = document.getElementById('payment-status-content');
  content.innerHTML += `
    <div class="alert alert-warning" style="text-align:left; margin-top:16px;">
      Status belum diperbarui otomatis. <a href="javascript:location.reload()" style="font-weight:600;">Muat ulang halaman</a> untuk memeriksa status terbaru.
    </div>
  `;
}

async function poll(orderNumber) {
  try {
    const order = await fetchOrderStatus(orderNumber);

    if (['paid', 'fulfilled', 'completed'].includes(order.status)) {
      renderSuccess(order);
      clearInterval(pollTimer);
      return;
    }

    if (['expired', 'cancelled'].includes(order.status)) {
      renderExpired(order);
      clearInterval(pollTimer);
      return;
    }

    // status === 'pending' (or 'disputed'/'refunded', which shouldn't
    // realistically appear this early in the flow, but are handled
    // gracefully by simply continuing to show the pending/QRIS view
    // rather than crashing on an unexpected status value)
    renderPending(order);

    pollCount++;
    if (pollCount >= MAX_POLL_ATTEMPTS) {
      clearInterval(pollTimer);
      renderTimedOutPolling(order);
    }
  } catch (err) {
    renderError(err.message);
    clearInterval(pollTimer);
  }
}

async function init() {
  const orderNumber = getOrderNumberFromUrl();

  if (!orderNumber) {
    renderError('Nomor pesanan tidak ditemukan di URL.');
    return;
  }

  await poll(orderNumber); // immediate first check, don't wait 5s for the first render
  pollTimer = setInterval(() => poll(orderNumber), POLL_INTERVAL_MS);
}

document.addEventListener('DOMContentLoaded', init);
