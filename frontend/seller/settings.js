/**
 * DannShop — Settings Page JS
 * GET   /api/seller/store
 * PATCH /api/seller/store
 * POST  /api/seller/store/change-slug
 */

function setBtnLoading(btn, loadingText) {
  btn.dataset.originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> ${loadingText}`;
}

function resetBtn(btn) {
  btn.disabled = false;
  btn.textContent = btn.dataset.originalText;
}

async function loadStore() {
  const res = await authFetch('/seller/store');
  const json = await res.json();
  const store = json.data;

  document.getElementById('settings-name').value = store.name || '';
  document.getElementById('settings-bio').value = store.bio || '';
  document.getElementById('settings-instagram').value = store.social_links?.instagram || '';
  document.getElementById('settings-whatsapp').value = store.social_links?.whatsapp || '';
  document.getElementById('settings-slug').value = store.slug;

  if (!store.can_change_slug) {
    document.getElementById('slug-cooldown-notice').innerHTML = `
      <div class="alert alert-warning">URL toko baru saja diganti. Anda dapat menggantinya lagi setelah periode 30 hari berlalu.</div>
    `;
    document.getElementById('save-slug-btn').disabled = true;
  }
}

async function init() {
  if (!requireAuth()) return;

  renderDashboardShell('settings');

  try {
    await loadStore();
  } catch (err) {
    document.getElementById('profile-form-error').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('profile-form-error').innerHTML = '';
    document.getElementById('profile-form-success').innerHTML = '';

    const btn = document.getElementById('save-profile-btn');
    setBtnLoading(btn, 'Menyimpan...');

    try {
      const res = await authFetch('/seller/store', {
        method: 'PATCH',
        body: JSON.stringify({
          name: document.getElementById('settings-name').value.trim(),
          bio: document.getElementById('settings-bio').value.trim(),
          social_links: {
            instagram: document.getElementById('settings-instagram').value.trim() || null,
            whatsapp: document.getElementById('settings-whatsapp').value.trim() || null,
          },
        }),
      });
      const json = await res.json();

      if (!json.success) {
        document.getElementById('profile-form-error').innerHTML = `<div class="alert alert-danger">${escapeHtml(json.message)}</div>`;
        resetBtn(btn);
        return;
      }

      document.getElementById('profile-form-success').innerHTML = `<div class="alert alert-success">✓ Perubahan disimpan.</div>`;
      resetBtn(btn);
    } catch (err) {
      document.getElementById('profile-form-error').innerHTML = `<div class="alert alert-danger">Tidak dapat terhubung ke server.</div>`;
      resetBtn(btn);
    }
  });

  document.getElementById('slug-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('slug-form-error').innerHTML = '';
    document.getElementById('slug-form-success').innerHTML = '';

    const btn = document.getElementById('save-slug-btn');
    setBtnLoading(btn, 'Menyimpan...');

    try {
      const res = await authFetch('/seller/store/change-slug', {
        method: 'POST',
        body: JSON.stringify({ slug: document.getElementById('settings-slug').value.trim() }),
      });
      const json = await res.json();

      if (!json.success) {
        document.getElementById('slug-form-error').innerHTML = `<div class="alert alert-danger">${escapeHtml(json.message)}</div>`;
        resetBtn(btn);
        return;
      }

      document.getElementById('slug-form-success').innerHTML = `<div class="alert alert-success">✓ URL toko berhasil diubah menjadi dannshop.id/${json.data.slug}</div>`;
      btn.disabled = true;
      btn.textContent = 'Ubah URL';
    } catch (err) {
      document.getElementById('slug-form-error').innerHTML = `<div class="alert alert-danger">Tidak dapat terhubung ke server.</div>`;
      resetBtn(btn);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
