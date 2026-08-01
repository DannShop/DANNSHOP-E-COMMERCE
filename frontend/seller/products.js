/**
 * DannShop — Products Page JS
 * GET  /api/seller/products/types  → ProductTypeMapper::allTypes()
 * GET  /api/seller/products
 * POST /api/seller/products
 * POST /api/seller/products/{id}/publish
 *
 * Per Wildan's decision: seller ONLY picks product_type — never
 * fulfillment_mode/stock_mode, those are derived server-side by
 * ProductTypeMapper. This form has no field for them at all.
 */

const TYPE_LABELS = {
  digital_file: 'File Digital (Ebook, Template, dll)',
  account_credential: 'Akun Premium (Netflix, Spotify, dll)',
  service: 'Jasa (Desain, Coding, dll)',
  topup_voucher: 'Top Up Game',
  ppob: 'Pulsa & Tagihan (PPOB)',
};

const TYPE_HINTS = {
  digital_file: 'Produk berupa file yang bisa diunduh berkali-kali tanpa batas stok.',
  account_credential: 'Setiap unit terjual menggunakan satu akun unik dari stok yang Anda unggah.',
  service: 'Anda akan mengirimkan hasil pekerjaan secara manual setelah pembayaran diterima.',
};

function statusLabel(status) {
  const labels = { draft: 'Draft', active: 'Aktif', archived: 'Diarsipkan', out_of_stock: 'Stok Habis' };
  return labels[status] || status;
}

async function loadProductTypes() {
  const res = await authFetch('/seller/products/types');
  const json = await res.json();
  const types = json.data || [];

  const select = document.getElementById('product-type-select');
  select.innerHTML = types.map((t) => `
    <option value="${t.type}" ${!t.available ? 'disabled' : ''}>
      ${TYPE_LABELS[t.type] || t.type}${!t.available ? ' (Segera Hadir)' : ''}
    </option>
  `).join('');

  select.addEventListener('change', () => {
    document.getElementById('product-type-hint').textContent = TYPE_HINTS[select.value] || '';
  });
}

function renderProducts(products) {
  const container = document.getElementById('products-container');

  if (!products || products.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📦</div>
        <div class="title">Belum ada produk</div>
        <div class="desc">Tambahkan produk pertama Anda untuk mulai berjualan.</div>
        <button class="btn btn-cta-gold" style="width:auto; padding:0 20px;" onclick="document.getElementById('open-add-product-btn').click()">+ Tambah Produk</button>
      </div>
    `;
    return;
  }

  const rows = products.map((p) => `
    <tr>
      <td data-label="Produk">${escapeHtml(p.name)}</td>
      <td data-label="Harga" class="amount-cell">${p.price_formatted}</td>
      <td data-label="Status"><span class="status-badge ${p.status === 'active' ? 'completed' : p.status === 'out_of_stock' ? 'disputed' : 'pending'}">${statusLabel(p.status)}</span></td>
      <td data-label="Aksi">
        ${p.status === 'draft' ? `<button class="btn btn-secondary publish-btn" data-id="${p.id}" style="width:auto; height:32px; padding:0 12px; font-size:12px;">Publikasikan</button>` : '-'}
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Produk</th><th>Harga</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  document.querySelectorAll('.publish-btn').forEach((btn) => {
    btn.addEventListener('click', () => publishProduct(btn.dataset.id, btn));
  });
}

async function loadProducts() {
  try {
    const res = await authFetch('/seller/products');
    const json = await res.json();
    renderProducts(json.data);
  } catch (err) {
    document.getElementById('products-container').innerHTML = `
      <div class="empty-state"><div class="icon">😕</div><div class="title">Gagal memuat produk</div><div class="desc">${escapeHtml(err.message)}</div></div>
    `;
  }
}

async function publishProduct(id, btn) {
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const res = await authFetch(`/seller/products/${id}/publish`, { method: 'POST' });
    const json = await res.json();
    if (!json.success) {
      alert(json.message || 'Gagal mempublikasikan produk.');
      btn.disabled = false;
      btn.textContent = 'Publikasikan';
      return;
    }
    await loadProducts();
  } catch (err) {
    alert('Tidak dapat terhubung ke server.');
    btn.disabled = false;
    btn.textContent = 'Publikasikan';
  }
}

function parsePriceInput(value) {
  return parseInt(value.replace(/\D/g, ''), 10) || 0;
}

function openModal() {
  document.getElementById('add-product-modal').style.display = 'flex';
  document.getElementById('product-form-error').innerHTML = '';
}

function closeModal() {
  document.getElementById('add-product-modal').style.display = 'none';
  document.getElementById('add-product-form').reset();
}

async function init() {
  if (!requireAuth()) return;

  renderDashboardShell('products');

  await loadProductTypes();
  await loadProducts();

  document.getElementById('product-price').addEventListener('input', (e) => {
    const raw = parsePriceInput(e.target.value);
    e.target.value = raw ? raw.toLocaleString('id-ID') : '';
  });

  document.getElementById('open-add-product-btn').addEventListener('click', openModal);
  document.getElementById('cancel-add-product-btn').addEventListener('click', closeModal);

  document.getElementById('add-product-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('submit-product-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Menyimpan...';

    try {
      const res = await authFetch('/seller/products', {
        method: 'POST',
        body: JSON.stringify({
          product_type: document.getElementById('product-type-select').value,
          name: document.getElementById('product-name').value.trim(),
          price: parsePriceInput(document.getElementById('product-price').value),
          description: document.getElementById('product-description').value.trim(),
        }),
      });
      const json = await res.json();

      if (!json.success) {
        document.getElementById('product-form-error').innerHTML = `<div class="alert alert-danger">${escapeHtml(json.message || 'Gagal menyimpan produk.')}</div>`;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Simpan sebagai Draft';
        return;
      }

      closeModal();
      await loadProducts();
    } catch (err) {
      document.getElementById('product-form-error').innerHTML = `<div class="alert alert-danger">Tidak dapat terhubung ke server.</div>`;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Simpan sebagai Draft';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
