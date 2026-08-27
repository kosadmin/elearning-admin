import { supabase } from './supabaseClient.js';

const ICON_EDIT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

let editingBannerId = null;
let bannersCache = [];

export async function initBannerTab() {
  wireModal();
  await loadBanners();
}

async function loadBanners() {
  const { data, error } = await supabase.from('banners').select('*').order('created_at', { ascending: false });
  bannersCache = data || [];
  const grid = document.getElementById('banner-grid');
  if (!grid) return;

  if (error) { grid.innerHTML = `<p class="empty-text">Lỗi: ${escapeHtml(error.message)}</p>`; return; }
  if (!bannersCache.length) { grid.innerHTML = `<p class="empty-text">Chưa có banner nào. Bấm "+ Thêm banner" để tạo banner đầu tiên.</p>`; return; }

  grid.innerHTML = bannersCache.map((b) => `
    <div class="banner-card">
      <img class="banner-card-image" src="${b.image_url || ''}" alt="" loading="lazy" />
      <div class="banner-card-body">
        <div class="banner-card-info">
          <span class="badge ${b.is_active ? 'badge-active' : 'badge-inactive'} badge-sm">${b.is_active ? 'Đang hiển thị' : 'Đã ẩn'}</span>
          <div class="banner-card-link">${b.link ? escapeHtml(b.link) : 'Không gắn liên kết'}</div>
        </div>
        <div class="banner-card-actions">
          <button class="icon-btn edit" data-edit="${b.id}" title="Sửa">${ICON_EDIT}</button>
          <button class="icon-btn delete" data-delete="${b.id}" title="Xoá">${ICON_TRASH}</button>
        </div>
      </div>
    </div>
  `).join('');
}

function wireModal() {
  const modal = document.getElementById('banner-modal');
  document.getElementById('banner-add-btn').addEventListener('click', () => openModal(null));
  document.getElementById('banner-cancel-btn').addEventListener('click', () => modal.classList.remove('open'));
  document.getElementById('banner-form').addEventListener('submit', submitBanner);

  document.getElementById('banner-grid').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.edit) openModal(btn.dataset.edit);
    if (btn.dataset.delete) await deleteBanner(btn.dataset.delete);
  });
}

function openModal(id) {
  editingBannerId = id;
  document.getElementById('banner-form').reset();
  document.getElementById('banner-msg').textContent = '';

  if (id) {
    const b = bannersCache.find((x) => String(x.id) === String(id));
    document.getElementById('banner-modal-title').textContent = 'Sửa banner';
    document.getElementById('banner-link').value = b.link || '';
    document.getElementById('banner-active').checked = !!b.is_active;
    document.getElementById('banner-current-hint').textContent = 'Để trống ô chọn ảnh nếu muốn giữ nguyên ảnh hiện tại.';
  } else {
    document.getElementById('banner-modal-title').textContent = 'Thêm banner';
    document.getElementById('banner-active').checked = true;
    document.getElementById('banner-current-hint').textContent = 'Khuyến nghị ảnh ngang (tỉ lệ ~1.9:1), dung lượng dưới 2MB.';
  }
  document.getElementById('banner-modal').classList.add('open');
}

async function submitBanner(e) {
  e.preventDefault();
  const msg = document.getElementById('banner-msg');
  const submitBtn = document.getElementById('banner-submit-btn');
  const file = document.getElementById('banner-file').files[0];
  const link = document.getElementById('banner-link').value.trim() || null;
  const isActive = document.getElementById('banner-active').checked;

  if (!file && !editingBannerId) { msg.textContent = 'Vui lòng chọn ảnh banner.'; return; }

  let imageUrl = null;
  if (file) {
    submitBtn.disabled = true;
    msg.textContent = 'Đang tải ảnh lên...';
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}_${safeName}`;
    const { error: uploadErr } = await supabase.storage.from('banner-images').upload(path, file);
    submitBtn.disabled = false;
    if (uploadErr) { msg.textContent = `Lỗi tải ảnh: ${uploadErr.message}`; return; }
    imageUrl = supabase.storage.from('banner-images').getPublicUrl(path).data.publicUrl;
  }

  const payload = { link, is_active: isActive };
  if (imageUrl) payload.image_url = imageUrl;

  let error;
  if (editingBannerId) {
    ({ error } = await supabase.from('banners').update(payload).eq('id', editingBannerId));
  } else {
    ({ error } = await supabase.from('banners').insert(payload));
  }

  if (error) { msg.textContent = `Lỗi lưu: ${error.message}`; return; }
  document.getElementById('banner-modal').classList.remove('open');
  loadBanners();
}

async function deleteBanner(id) {
  if (!confirm('Xoá banner này khỏi trang chủ app?')) return;
  const { error } = await supabase.from('banners').delete().eq('id', id);
  if (error) { alert(`Lỗi: ${error.message}`); return; }
  loadBanners();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}