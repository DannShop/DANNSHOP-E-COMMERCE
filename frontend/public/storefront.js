/**
 * DannShop — Storefront JS
 *
 * Connects directly to the real API built this session:
 *   GET /api/stores/{slug}              → StorefrontController::show
 *   GET /api/stores/{slug}/products     → StorefrontController::products
 *
 * Response contract (per DannShop-Gemini-Instructions.md §4):
 *   { success: true, data: {...} }
 *   { success: false, message: "...", errors: {...} }
 *
 * API_BASE_URL: change this to your actual backend domain when deployed.
 * Left as a relative path assuming frontend is served from the same
 * Laravel app's public/ — adjust to an absolute URL
 * (e.g. 'https://api.dannshop.id') if frontend ends up on a separate
 * domain later (Architecture decision: 1 repo now, splittable later).
 */
const API_BASE_URL = 'http://127.0.0.1:8000/api';

/**
 * formatIDR — the ONE function for currency formatting across the
 * entire frontend, per Design System §3.4 and Gemini instructions §3.
 * Never format currency manually anywhere else.
 */
function formatIDR(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

/**
 * Extracts the store slug from the URL path. Assumes routing pattern
 * /{slug} for the storefront — adjust if your actual URL routing
 * (server-side or client-side router) differs.
 */
function getStoreSlugFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('store')) return params.get('store'); // ?store=wildan for local testing without server routing
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  return path || null;
}

async function fetchStore(slug) {
  const res = await fetch(`${API_BASE_URL}/stores/${encodeURIComponent(slug)}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Toko tidak ditemukan.');
  return json.data;
}

async function fetchProducts(slug) {
  const res = await fetch(`${API_BASE_URL}/stores/${encodeURIComponent(slug)}/products`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Gagal memuat produk.');
  return json.data;
}

function renderStoreHeader(store) {
  document.title = `${store.name} — DannShop`;

  document.getElementById('topbar-logo').src = store.logo_url || '/assets/default-store-logo.png';
  document.getElementById('topbar-name').textContent = store.name;

  const banner = document.getElementById('storefront-banner');
  if (store.banner_url) {
    banner.style.backgroundImage = `url('${store.banner_url}')`;
  }

  document.getElementById('store-name-header').textContent = store.name;
  document.getElementById('store-bio').textContent = store.bio || '';

  const socialContainer = document.getElementById('social-links');
  socialContainer.innerHTML = '';
  const links = store.social_links || {};
  const labels = { instagram: 'Instagram', tiktok: 'TikTok', whatsapp: 'WhatsApp' };
  Object.keys(labels).forEach((key) => {
    if (links[key]) {
      const a = document.createElement('a');
      a.href = links[key];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = labels[key];
      socialContainer.appendChild(a);
    }
  });
}

function renderSkeletonGrid(count = 6) {
  const grid = document.getElementById('product-grid');
  grid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'skeleton-card';
    card.innerHTML = `
      <div class="thumb"></div>
      <div class="line"></div>
      <div class="line short"></div>
    `;
    grid.appendChild(card);
  }
}

function renderEmptyState(message, desc) {
  const grid = document.getElementById('product-grid');
  grid.innerHTML = `
    <div class="state-message">
      <div class="icon">🛍️</div>
      <div class="title">${message}</div>
      <div class="desc">${desc}</div>
    </div>
  `;
}

function renderProducts(products, storeSlug) {
  const grid = document.getElementById('product-grid');
  grid.innerHTML = '';

  if (!products || products.length === 0) {
    renderEmptyState('Belum ada produk', 'Toko ini belum menambahkan produk apa pun.');
    return;
  }

  products.forEach((product) => {
    const card = document.createElement('a');
    card.className = 'product-card';
    card.href = `/${storeSlug}/p/${product.slug}`;

    card.innerHTML = `
      <div class="thumb">
        ${product.thumbnail_url
          ? `<img src="${product.thumbnail_url}" alt="${escapeHtml(product.name)}" loading="lazy">`
          : '📦'}
      </div>
      <div class="body">
        <div class="title">${escapeHtml(product.name)}</div>
        ${product.is_available
          ? `<div class="price">${formatIDR(product.price)}</div>`
          : `<div class="price" style="color: var(--color-gray-400)">${formatIDR(product.price)}</div>
             <span class="out-of-stock-tag">Habis</span>`}
      </div>
    `;

    grid.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function init() {
  const slug = getStoreSlugFromUrl();

  if (!slug) {
    renderEmptyState('Toko tidak ditemukan', 'URL tidak valid.');
    return;
  }

  renderSkeletonGrid();

  try {
    const store = await fetchStore(slug);
    renderStoreHeader(store);

    const products = await fetchProducts(slug);
    renderProducts(products, slug);
  } catch (err) {
    // Per Design System §9.4: never leave a blank page — always show
    // a clear, designed state, even for errors.
    renderEmptyState('Toko tidak ditemukan', err.message || 'Silakan periksa kembali tautan yang Anda gunakan.');
    document.getElementById('store-name-header').textContent = 'Toko tidak ditemukan';
  }
}

document.addEventListener('DOMContentLoaded', init);
