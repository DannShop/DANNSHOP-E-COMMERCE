/**
 * DannShop — Product Detail JS
 * GET /api/stores/{slug}/products/{productSlug} → StorefrontController::productDetail
 */
const API_BASE_URL = '/api';

function formatIDR(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function getParamsFromUrl() {
  // Expects URL pattern /{slug}/p/{productSlug} in production routing,
  // or ?store=X&product=Y for local testing without server routing.
  const params = new URLSearchParams(window.location.search);
  if (params.has('store') && params.has('product')) {
    return { storeSlug: params.get('store'), productSlug: params.get('product') };
  }
  const parts = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/');
  // /{slug}/p/{productSlug}
  if (parts.length >= 3 && parts[1] === 'p') {
    return { storeSlug: parts[0], productSlug: parts[2] };
  }
  return { storeSlug: null, productSlug: null };
}

async function fetchProduct(storeSlug, productSlug) {
  const res = await fetch(`${API_BASE_URL}/stores/${encodeURIComponent(storeSlug)}/products/${encodeURIComponent(productSlug)}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Produk tidak ditemukan.');
  return json.data;
}

function renderSkeleton() {
  document.getElementById('product-detail-content').innerHTML = `
    <div class="gallery skeleton-block"></div>
    <div class="info">
      <div class="skeleton-block" style="height:14px; width:30%; margin-bottom:12px;"></div>
      <div class="skeleton-block" style="height:24px; width:80%; margin-bottom:8px;"></div>
      <div class="skeleton-block" style="height:30px; width:40%; margin-bottom:20px;"></div>
      <div class="skeleton-block" style="height:80px; width:100%;"></div>
    </div>
  `;
}

function renderError(message) {
  document.getElementById('product-detail-content').innerHTML = `
    <div class="state-message" style="grid-column: 1 / -1;">
      <div class="icon">😕</div>
      <div class="title">Produk tidak ditemukan</div>
      <div class="desc">${escapeHtml(message)}</div>
    </div>
  `;
  document.getElementById('sticky-buy-bar').style.display = 'none';
}

function renderProduct(product, storeSlug) {
  document.getElementById('topbar-name').textContent = product.name;
  document.title = `${product.name} — DannShop`;

  const typeLabels = {
    digital_file: 'File Digital',
    account_credential: 'Akun Premium',
    service: 'Jasa',
    topup_voucher: 'Top Up Game',
    ppob: 'PPOB',
  };

  document.getElementById('product-detail-content').innerHTML = `
    <div class="gallery">
      ${product.thumbnail_url
        ? `<img src="${product.thumbnail_url}" alt="${escapeHtml(product.name)}">`
        : '📦'}
    </div>
    <div class="info">
      <span class="product-type-tag">${typeLabels[product.product_type] || product.product_type}</span>
      <h1>${escapeHtml(product.name)}</h1>
      <div class="price">${formatIDR(product.price)}</div>

      ${!product.is_available ? `
        <div class="out-of-stock-banner">⚠ Produk ini sedang habis stok.</div>
      ` : ''}

      <div class="description">${escapeHtml(product.description) || 'Tidak ada deskripsi untuk produk ini.'}</div>

      <button class="btn btn-cta-gold desktop-buy-button" id="buy-button-desktop" ${!product.is_available ? 'disabled' : ''}>
        ★ Beli Sekarang
      </button>
    </div>
  `;

  const stickyBar = document.getElementById('sticky-buy-bar');
  const mobileBuyBtn = document.getElementById('buy-button-mobile');

  if (product.is_available) {
    stickyBar.style.display = 'block';
    mobileBuyBtn.disabled = false;
  } else {
    mobileBuyBtn.disabled = true;
    mobileBuyBtn.textContent = 'Stok Habis';
    stickyBar.style.display = 'block';
  }

  const goToCheckout = () => {
    window.location.href = `checkout.html?product_id=${product.id}&store=${encodeURIComponent(storeSlug)}`;
  };

  mobileBuyBtn.addEventListener('click', goToCheckout);
  const desktopBtn = document.getElementById('buy-button-desktop');
  if (desktopBtn) desktopBtn.addEventListener('click', goToCheckout);

  document.getElementById('back-to-store').href = `storefront.html?store=${encodeURIComponent(storeSlug)}`;
}

async function init() {
  const { storeSlug, productSlug } = getParamsFromUrl();

  if (!storeSlug || !productSlug) {
    renderError('URL tidak valid.');
    return;
  }

  renderSkeleton();

  try {
    const product = await fetchProduct(storeSlug, productSlug);
    renderProduct(product, storeSlug);
  } catch (err) {
    renderError(err.message);
  }
}

document.addEventListener('DOMContentLoaded', init);
