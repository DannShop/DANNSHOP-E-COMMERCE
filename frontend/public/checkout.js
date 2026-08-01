/**
 * DannShop — Checkout JS
 * POST /api/orders → CheckoutController::store
 *
 * Design System §4.3 RULE (non-negotiable): every button tied to a
 * financial action MUST visibly process during the request — a button
 * that looks idle while a payment request is in flight is how you get
 * double-submitted orders and panicked support messages. This is
 * enforced below via setSubmitLoading(), not optional styling.
 */
const API_BASE_URL = '/api';

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function fetchProductSummary(storeSlug, productId) {
  // We only have product_id from the detail page's link, but the
  // public product-detail endpoint is keyed by slug — for the summary
  // card we re-fetch via the store's product list and find by id.
  // (A dedicated GET /api/products/{id} endpoint would be a cleaner
  // 🟡 follow-up if this lookup pattern feels indirect in practice.)
  const res = await fetch(`${API_BASE_URL}/stores/${encodeURIComponent(storeSlug)}/products`);
  const json = await res.json();
  if (!json.success) throw new Error('Gagal memuat ringkasan produk.');
  return json.data.find((p) => String(p.id) === String(productId));
}

function formatIDR(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function renderSummary(product) {
  const el = document.getElementById('checkout-summary');
  if (!product) {
    el.innerHTML = `<div class="product-name">Produk</div>`;
    return;
  }
  el.innerHTML = `
    <div class="product-name">${escapeHtml(product.name)}</div>
    <div class="product-price">${formatIDR(product.price)}</div>
  `;
}

function clearFieldErrors() {
  document.querySelectorAll('.form-error-text').forEach((el) => (el.textContent = ''));
  document.querySelectorAll('.form-input').forEach((el) => el.classList.remove('error'));
  document.getElementById('form-error-banner').innerHTML = '';
}

function showFieldErrors(errors) {
  Object.keys(errors || {}).forEach((field) => {
    const errorEl = document.getElementById(`error-${field}`);
    const inputEl = document.getElementById(field);
    if (errorEl) errorEl.textContent = errors[field][0];
    if (inputEl) inputEl.classList.add('error');
  });
}

function showBanner(message) {
  document.getElementById('form-error-banner').innerHTML = `
    <div class="alert alert-danger">⚠ ${escapeHtml(message)}</div>
  `;
}

/**
 * Design System §4.3's mandatory loading-state rule, implemented:
 * spinner replaces label, button width stays locked (no layout
 * shift), disabled to prevent double-submit.
 */
function setSubmitLoading(isLoading) {
  const btn = document.getElementById('submit-button');
  if (isLoading) {
    btn.dataset.originalText = btn.textContent;
    btn.style.minWidth = btn.offsetWidth + 'px';
    btn.innerHTML = '<span class="spinner"></span> Memproses...';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalText || '★ Lanjutkan ke Pembayaran';
    btn.disabled = false;
  }
}

async function submitOrder(productId, buyerEmail, buyerPhone) {
  const res = await fetch(`${API_BASE_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      buyer_email: buyerEmail,
      buyer_phone: buyerPhone,
    }),
  });
  const json = await res.json();
  return { ok: res.ok, json };
}

async function init() {
  const productId = getQueryParam('product_id');
  const storeSlug = getQueryParam('store');

  if (!productId) {
    showBanner('Produk tidak valid. Silakan kembali ke halaman produk.');
    document.getElementById('submit-button').disabled = true;
    return;
  }

  if (storeSlug) {
    try {
      const product = await fetchProductSummary(storeSlug, productId);
      renderSummary(product);
    } catch (e) {
      // Non-fatal: summary card just stays generic if this fails —
      // the actual order creation still works from product_id alone.
    }
  }

  document.getElementById('checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors();

    const buyerEmail = document.getElementById('buyer_email').value.trim();
    const buyerPhone = document.getElementById('buyer_phone').value.trim();

    setSubmitLoading(true);

    try {
      const { ok, json } = await submitOrder(productId, buyerEmail, buyerPhone);

      if (!ok || !json.success) {
        // Per Gemini instructions §4: ALWAYS show response.message,
        // never silently swallow a failure — especially for payment
        // transactions, the user must always know what went wrong.
        if (json.errors && Object.keys(json.errors).length > 0) {
          showFieldErrors(json.errors);
        }
        showBanner(json.message || 'Terjadi kesalahan. Silakan coba lagi.');
        setSubmitLoading(false);
        return;
      }

      // Success: redirect to payment status page with the order_number
      // — per Flows v1 Flow 4's recovery requirement, this page must
      // be revisitable, so we pass order_number in the URL, not just
      // hold it in memory.
      const orderNumber = json.data.order.order_number;
      window.location.href = `payment-status.html?order=${encodeURIComponent(orderNumber)}`;
    } catch (err) {
      // Network-level failure (no response at all) — Flows v1 Flow 5's
      // failure scenario: be honest that something went wrong, never
      // leave the button silently stuck.
      showBanner('Tidak dapat terhubung ke server. Periksa koneksi internet Anda dan coba lagi.');
      setSubmitLoading(false);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
