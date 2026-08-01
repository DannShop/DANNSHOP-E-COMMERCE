/**
 * DannShop — Onboarding JS
 * POST /api/create-store → SellerStoreController::store
 */

function slugify(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

function setSubmitLoading(isLoading) {
  const btn = document.getElementById('submit-button');
  if (isLoading) {
    btn.dataset.originalText = btn.textContent;
    btn.style.minWidth = btn.offsetWidth + 'px';
    btn.innerHTML = '<span class="spinner"></span> Membuat toko...';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalText || '★ Buat Toko';
    btn.disabled = false;
  }
}

function showBanner(message) {
  document.getElementById('form-error-banner').innerHTML = `<div class="alert alert-danger">${escapeHtml(message)}</div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  const nameInput = document.getElementById('store-name');
  const slugInput = document.getElementById('store-slug');
  let slugManuallyEdited = false;

  nameInput.addEventListener('input', () => {
    if (!slugManuallyEdited) {
      slugInput.value = slugify(nameInput.value);
    }
  });
  slugInput.addEventListener('input', () => { slugManuallyEdited = true; });

  document.getElementById('onboarding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setSubmitLoading(true);

    try {
      const res = await authFetch('/create-store', {
        method: 'POST',
        body: JSON.stringify({
          name: nameInput.value.trim(),
          slug: slugify(slugInput.value),
          bio: document.getElementById('store-bio').value.trim(),
        }),
      });
      const json = await res.json();

      if (!json.success) {
        showBanner(json.message || 'Gagal membuat toko.');
        setSubmitLoading(false);
        return;
      }

      window.location.href = 'dashboard.html';
    } catch (err) {
      showBanner('Tidak dapat terhubung ke server.');
      setSubmitLoading(false);
    }
  });
});
