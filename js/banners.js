import { supabase } from './supabaseClient.js';

const ICON_EDIT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

// Tỉ lệ khung banner trên app mobile (HomeScreen.js: bannerImage aspectRatio: 1.9) — PHẢI khớp tỉ lệ này.
const BANNER_RATIO = 1.9;
const EXPORT_WIDTH = 1200;
const EXPORT_HEIGHT = Math.round(EXPORT_WIDTH / BANNER_RATIO);

let editingBannerId = null;
let bannersCache = [];
let coursesCache = [];
let quizzesCache = [];
let cropState = null; // { img, naturalW, naturalH, vw, vh, baseScale, zoom, tx, ty }
let cropDragging = false;

export async function initBannerTab() {
  await loadNavOptions();
  wireModal();
  wireCropper();
  await loadBanners();
}

/* ============ Danh sách banner ============ */

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
          <div class="banner-card-link">${escapeHtml(navDescription(b))}</div>
        </div>
        <div class="banner-card-actions">
          <button class="icon-btn edit" data-edit="${b.id}" title="Sửa">${ICON_EDIT}</button>
          <button class="icon-btn delete" data-delete="${b.id}" title="Xoá">${ICON_TRASH}</button>
        </div>
      </div>
    </div>
  `).join('');
}

function navDescription(b) {
  if (b.nav_type === 'url' && b.link) return `Liên kết ngoài: ${b.link}`;
  if (b.nav_type === 'course') {
    const c = coursesCache.find((x) => String(x.id) === String(b.target_id));
    return `Khoá học: ${c ? c.title : '(đã xoá)'}`;
  }
  if (b.nav_type === 'quiz') {
    const q = quizzesCache.find((x) => String(x.id) === String(b.target_id));
    return `Bài kiểm tra: ${q ? q.title : '(đã xoá)'}`;
  }
  return 'Không điều hướng';
}

async function loadNavOptions() {
  const [{ data: courses }, { data: quizzes }] = await Promise.all([
    supabase.from('courses').select('id, title').order('title'),
    supabase.from('quizzes').select('id, title').order('title'),
  ]);
  coursesCache = courses || [];
  quizzesCache = quizzes || [];

  document.getElementById('banner-course-select').innerHTML = coursesCache.length
    ? coursesCache.map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('')
    : '<option value="">Chưa có khoá học nào</option>';
  document.getElementById('banner-quiz-select').innerHTML = quizzesCache.length
    ? quizzesCache.map((q) => `<option value="${q.id}">${escapeHtml(q.title)}</option>`).join('')
    : '<option value="">Chưa có bài kiểm tra nào</option>';
}

/* ============ Modal thêm / sửa ============ */

function wireModal() {
  const modal = document.getElementById('banner-modal');
  document.getElementById('banner-add-btn').addEventListener('click', () => openModal(null));
  document.getElementById('banner-cancel-btn').addEventListener('click', () => modal.classList.remove('open'));
  document.getElementById('banner-form').addEventListener('submit', submitBanner);
  document.getElementById('banner-nav-type').addEventListener('change', toggleNavFields);

  document.getElementById('banner-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadImageIntoCropper(file);
  });

  document.getElementById('banner-grid').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.edit) openModal(btn.dataset.edit);
    if (btn.dataset.delete) await deleteBanner(btn.dataset.delete);
  });
}

function toggleNavFields() {
  const type = document.getElementById('banner-nav-type').value;
  document.getElementById('banner-url-field').classList.toggle('hidden', type !== 'url');
  document.getElementById('banner-course-field').classList.toggle('hidden', type !== 'course');
  document.getElementById('banner-quiz-field').classList.toggle('hidden', type !== 'quiz');
}

function openModal(id) {
  editingBannerId = id;
  document.getElementById('banner-form').reset();
  document.getElementById('banner-msg').textContent = '';
  resetCropper();

  if (id) {
    const b = bannersCache.find((x) => String(x.id) === String(id));
    document.getElementById('banner-modal-title').textContent = 'Sửa banner';
    document.getElementById('banner-active').checked = !!b.is_active;
    document.getElementById('banner-nav-type').value = b.nav_type || 'none';
    document.getElementById('banner-link').value = b.nav_type === 'url' ? (b.link || '') : '';
    document.getElementById('banner-course-select').value = b.nav_type === 'course' ? (b.target_id || '') : '';
    document.getElementById('banner-quiz-select').value = b.nav_type === 'quiz' ? (b.target_id || '') : '';
    document.getElementById('banner-current-hint').textContent = 'Chỉ chọn ảnh mới nếu muốn thay ảnh hiện tại.';

    const currentImg = document.getElementById('banner-current-image');
    if (b.image_url) {
      currentImg.src = b.image_url;
      currentImg.classList.remove('hidden');
    }
  } else {
    document.getElementById('banner-modal-title').textContent = 'Thêm banner';
    document.getElementById('banner-active').checked = true;
    document.getElementById('banner-nav-type').value = 'none';
    document.getElementById('banner-current-hint').textContent = 'Khuyến nghị ảnh gốc chất lượng cao, tỉ lệ càng gần 1.9:1 càng ít phải cắt.';
  }
  toggleNavFields();
  document.getElementById('banner-modal').classList.add('open');
}

async function submitBanner(e) {
  e.preventDefault();
  const msg = document.getElementById('banner-msg');
  const submitBtn = document.getElementById('banner-submit-btn');
  const isActive = document.getElementById('banner-active').checked;
  const navType = document.getElementById('banner-nav-type').value;

  if (!cropState && !editingBannerId) { msg.textContent = 'Vui lòng chọn ảnh banner.'; return; }
  if (navType === 'course' && !document.getElementById('banner-course-select').value) { msg.textContent = 'Vui lòng chọn khoá học.'; return; }
  if (navType === 'quiz' && !document.getElementById('banner-quiz-select').value) { msg.textContent = 'Vui lòng chọn bài kiểm tra.'; return; }

  let imageUrl = null;
  if (cropState) {
    submitBtn.disabled = true;
    msg.textContent = 'Đang xử lý & tải ảnh lên...';
    const blob = await exportCroppedImage();
    if (!blob) {
      submitBtn.disabled = false;
      msg.textContent = 'Không thể xử lý ảnh, vui lòng thử lại.';
      return;
    }
    const path = `${Date.now()}_banner.jpg`;
    const { error: uploadErr } = await supabase.storage.from('banner-images').upload(path, blob, { contentType: 'image/jpeg' });
    submitBtn.disabled = false;
    if (uploadErr) { msg.textContent = `Lỗi tải ảnh: ${uploadErr.message}`; return; }
    imageUrl = supabase.storage.from('banner-images').getPublicUrl(path).data.publicUrl;
  }

  const payload = {
    is_active: isActive,
    nav_type: navType,
    link: navType === 'url' ? (document.getElementById('banner-link').value.trim() || null) : null,
    target_id: navType === 'course'
      ? document.getElementById('banner-course-select').value
      : navType === 'quiz'
      ? document.getElementById('banner-quiz-select').value
      : null,
  };
  if (imageUrl) payload.image_url = imageUrl;

  let error;
  if (editingBannerId) {
    ({ error } = await supabase.from('banners').update(payload).eq('id', editingBannerId));
  } else {
    ({ error } = await supabase.from('banners').insert(payload));
  }

  if (error) {
    msg.textContent = /column .* does not exist/i.test(error.message)
      ? 'Lỗi: database chưa có cột nav_type/target_id — cần chạy migration trước (xem hướng dẫn bàn giao).'
      : `Lỗi lưu: ${error.message}`;
    return;
  }
  document.getElementById('banner-modal').classList.remove('open');
  loadBanners();
}

async function deleteBanner(id) {
  if (!confirm('Xoá banner này khỏi trang chủ app?')) return;
  const { error } = await supabase.from('banners').delete().eq('id', id);
  if (error) { alert(`Lỗi: ${error.message}`); return; }
  loadBanners();
}

/* ============ Cropper ảnh (giữ đúng tỉ lệ 1.9:1 khi upload) ============ */

function resetCropper() {
  cropState = null;
  document.getElementById('banner-crop-wrap').classList.add('hidden');
  document.getElementById('banner-current-image').classList.add('hidden');
  document.getElementById('banner-crop-zoom').value = 1;
  document.getElementById('banner-file').value = '';
}

function loadImageIntoCropper(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const viewport = document.getElementById('banner-crop-viewport');
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const baseScale = Math.max(vw / img.naturalWidth, vh / img.naturalHeight);

      cropState = { img, naturalW: img.naturalWidth, naturalH: img.naturalHeight, vw, vh, baseScale, zoom: 1, tx: 0, ty: 0 };
      centerCropImage();

      document.getElementById('banner-crop-img').src = reader.result;
      document.getElementById('banner-crop-zoom').value = 1;
      applyCropTransform();

      document.getElementById('banner-crop-wrap').classList.remove('hidden');
      document.getElementById('banner-current-image').classList.add('hidden');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function centerCropImage() {
  const scale = cropState.baseScale * cropState.zoom;
  const dispW = cropState.naturalW * scale;
  const dispH = cropState.naturalH * scale;
  cropState.tx = (cropState.vw - dispW) / 2;
  cropState.ty = (cropState.vh - dispH) / 2;
}

function clampCropTranslate() {
  const scale = cropState.baseScale * cropState.zoom;
  const dispW = cropState.naturalW * scale;
  const dispH = cropState.naturalH * scale;
  const minTx = Math.min(0, cropState.vw - dispW);
  const minTy = Math.min(0, cropState.vh - dispH);
  cropState.tx = Math.min(0, Math.max(minTx, cropState.tx));
  cropState.ty = Math.min(0, Math.max(minTy, cropState.ty));
}

function applyCropTransform() {
  const scale = cropState.baseScale * cropState.zoom;
  const imgEl = document.getElementById('banner-crop-img');
  imgEl.style.width = `${cropState.naturalW * scale}px`;
  imgEl.style.height = `${cropState.naturalH * scale}px`;
  imgEl.style.transform = `translate(${cropState.tx}px, ${cropState.ty}px)`;
}

function wireCropper() {
  const viewport = document.getElementById('banner-crop-viewport');
  let startX = 0, startY = 0, startTx = 0, startTy = 0;

  viewport.addEventListener('pointerdown', (e) => {
    if (!cropState) return;
    cropDragging = true;
    startX = e.clientX; startY = e.clientY;
    startTx = cropState.tx; startTy = cropState.ty;
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!cropDragging || !cropState) return;
    cropState.tx = startTx + (e.clientX - startX);
    cropState.ty = startTy + (e.clientY - startY);
    clampCropTranslate();
    applyCropTransform();
  });
  const stopDrag = () => { cropDragging = false; };
  viewport.addEventListener('pointerup', stopDrag);
  viewport.addEventListener('pointerleave', stopDrag);
  viewport.addEventListener('pointercancel', stopDrag);

  document.getElementById('banner-crop-zoom').addEventListener('input', (e) => {
    if (!cropState) return;
    cropState.zoom = parseFloat(e.target.value) || 1;
    clampCropTranslate();
    applyCropTransform();
  });
}

function exportCroppedImage() {
  return new Promise((resolve) => {
    if (!cropState) { resolve(null); return; }
    const scale = cropState.baseScale * cropState.zoom;
    const srcX = -cropState.tx / scale;
    const srcY = -cropState.ty / scale;
    const srcW = cropState.vw / scale;
    const srcH = cropState.vh / scale;

    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_WIDTH;
    canvas.height = EXPORT_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cropState.img, srcX, srcY, srcW, srcH, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
  });
}

/* ============ Helpers ============ */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}