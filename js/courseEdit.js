import { supabase } from './supabaseClient.js';
import { initTabs } from './tabs.js';

const ICON_CHOICES = ['📘','💼','📊','🎯','🛠️','📈','🧾','🧠','✅','📋','⚖️','🔒','💡','🗂️'];
const ICON_EDIT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const ICON_GRIP = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`;
const TYPE_LABELS = { video: 'Video', pdf: 'PDF', doc: 'Văn bản', image: 'Hình ảnh', sheet: 'Bảng tính', ppt: 'Trình chiếu' };
const TYPE_CLASSES = { video: 'type-video', pdf: 'type-pdf', doc: 'type-doc', image: 'type-image', sheet: 'type-sheet', ppt: 'type-ppt' };
const COVER_CLASSES = ['cover-0', 'cover-1', 'cover-2', 'cover-3'];

let courseId = null;
let currentCourse = null;
let lessonsCache = [];
let editingLessonId = null;
let selectedNewUserIds = new Set();

export async function initCourseEditPage() {
  const params = new URLSearchParams(location.search);
  courseId = params.get('id');
  if (!courseId) { alert('Thiếu ID khoá học.'); location.href = 'courses.html'; return; }

  initTabs('#course-tabs');

  renderIconPicker();
  await loadLookupsForInfo();
  await loadCourse();
  wireInfoToggle();
  wireInfoForm();

  wireLessonModal();
  await loadLessons();

  await loadAssignLookups();
  wireAssignActions();
  await loadAssignedStudents();

  await loadProgressReport();
}

/* ============ TAB: THÔNG TIN ============ */

function renderIconPicker() {
  const wrap = document.getElementById('icon-picker');
  wrap.innerHTML = ICON_CHOICES.map(ic => `<button type="button" data-icon="${ic}">${ic}</button>`).join('');
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    document.getElementById('c-icon').value = btn.dataset.icon;
  });
}

async function loadLookupsForInfo() {
  const [catRes, depRes] = await Promise.all([
    supabase.from('course_categories').select('id, name').eq('is_active', true).order('name'),
    supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
  ]);
  document.getElementById('c-category').innerHTML = `<option value="">-- Không chọn --</option>` + (catRes.data || []).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  document.getElementById('c-department').innerHTML = `<option value="">-- Không giới hạn --</option>` + (depRes.data || []).map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
}

async function loadCourse() {
  const { data, error } = await supabase
    .from('courses')
    .select('*, course_categories(name), departments(name)')
    .eq('id', courseId).single();
  if (error) { alert(error.message); location.href = 'courses.html'; return; }
  currentCourse = data;
  document.getElementById('page-title').textContent = data.title;
  renderView(data);
  fillEditForm(data);
}

function renderView(data) {
  const badgesHtml = buildBadgesHtml(data);

  // Elements gốc (ẩn) — giữ để không phải sửa các phần khác của trang
  document.getElementById('view-icon').textContent = data.icon || '📘';
  document.getElementById('view-title').textContent = data.title;
  document.getElementById('view-instructor').textContent = data.instructor_name ? `Giảng viên: ${data.instructor_name}` : 'Chưa có giảng viên';
  document.getElementById('view-description').textContent = data.description || 'Chưa có mô tả cho khoá học này.';
  document.getElementById('view-badges').innerHTML = badgesHtml;

  // Hero header ở đầu trang
  const heroCover = document.getElementById('hero-cover');
  if (heroCover) {
    heroCover.textContent = data.icon || '📘';
    heroCover.className = 'detail-hero-cover ' + COVER_CLASSES[courseIdHash(courseId) % COVER_CLASSES.length];
  }
  const heroTitle = document.getElementById('hero-title');
  if (heroTitle) heroTitle.textContent = data.title;
  const heroInstructor = document.getElementById('hero-instructor');
  if (heroInstructor) heroInstructor.textContent = data.instructor_name ? `Giảng viên: ${data.instructor_name}` : 'Chưa có giảng viên';
  const heroBadges = document.getElementById('hero-badges');
  if (heroBadges) heroBadges.innerHTML = badgesHtml;

  const objList = document.getElementById('view-objectives');
  objList.innerHTML = (data.objectives && data.objectives.length)
    ? data.objectives.map(o => `<li>${escapeHtml(o)}</li>`).join('')
    : '<li style="color:var(--text-muted); list-style:none; margin-left:-18px;">Chưa có mục tiêu.</li>';

  document.getElementById('view-category').textContent = data.course_categories?.name || '—';
  document.getElementById('view-level').textContent = data.level || '—';
  document.getElementById('view-department').textContent = data.departments?.name || '—';
  document.getElementById('view-start').textContent = data.start_date ? new Date(data.start_date).toLocaleDateString('vi-VN') : '—';
  document.getElementById('view-end').textContent = data.end_date ? new Date(data.end_date).toLocaleDateString('vi-VN') : '—';
}

function buildBadgesHtml(data) {
  const badges = [];
  badges.push(data.status === 'active' ? '<span class="badge badge-active">Hoạt động</span>' : '<span class="badge badge-inactive">Ngừng</span>');
  badges.push(data.visibility === 'public' ? '<span class="badge badge-primary">Công khai</span>' : '<span class="badge badge-neutral">Riêng tư</span>');
  return badges.join('');
}

// Băm chuỗi id đơn giản chỉ để chọn ổn định 1 trong 4 tông màu icon cho mỗi khoá học
function courseIdHash(id) {
  let hash = 0;
  const str = String(id || '');
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash;
}

function fillEditForm(data) {
  document.getElementById('c-title').value = data.title || '';
  document.getElementById('c-icon').value = data.icon || '📘';
  document.getElementById('c-instructor').value = data.instructor_name || '';
  document.getElementById('c-description').value = data.description || '';
  document.getElementById('c-objectives').value = (data.objectives || []).join('\n');
  document.getElementById('c-level').value = data.level || '';
  document.getElementById('c-category').value = data.category_id || '';
  document.getElementById('c-department').value = data.department_id || '';
  document.getElementById('c-start-date').value = data.start_date || '';
  document.getElementById('c-end-date').value = data.end_date || '';
  document.getElementById('c-visibility').value = data.visibility || 'private';
  document.getElementById('c-status').checked = data.status === 'active';
}

function wireInfoToggle() {
  document.getElementById('edit-info-btn').addEventListener('click', () => {
    // Nút nằm ở khối hero (hiện xuyên suốt các tab) nên phải tự chuyển về tab Thông tin trước
    document.querySelector('#course-tabs [data-tab="info"]')?.click();
    document.getElementById('info-view').classList.add('hidden');
    document.getElementById('info-edit').classList.remove('hidden');
  });
  document.getElementById('cancel-edit-info-btn').addEventListener('click', () => {
    fillEditForm(currentCourse);
    document.getElementById('info-edit').classList.add('hidden');
    document.getElementById('info-view').classList.remove('hidden');
  });
}

function wireInfoForm() {
  document.getElementById('course-info-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('info-msg');
    const objectivesRaw = document.getElementById('c-objectives').value.trim();

    const payload = {
      title: document.getElementById('c-title').value.trim(),
      icon: document.getElementById('c-icon').value.trim() || '📘',
      instructor_name: document.getElementById('c-instructor').value.trim() || null,
      description: document.getElementById('c-description').value.trim() || null,
      objectives: objectivesRaw ? objectivesRaw.split('\n').map(s => s.trim()).filter(Boolean) : null,
      level: document.getElementById('c-level').value || null,
      category_id: document.getElementById('c-category').value || null,
      department_id: document.getElementById('c-department').value || null,
      start_date: document.getElementById('c-start-date').value || null,
      end_date: document.getElementById('c-end-date').value || null,
      visibility: document.getElementById('c-visibility').value,
      status: document.getElementById('c-status').checked ? 'active' : 'inactive',
    };

    const { data, error } = await supabase
      .from('courses').update(payload).eq('id', courseId)
      .select('*, course_categories(name), departments(name)').single();

    if (error) { msg.textContent = `Lỗi: ${error.message}`; return; }

    currentCourse = data;
    document.getElementById('page-title').textContent = data.title;
    renderView(data);
    document.getElementById('info-edit').classList.add('hidden');
    document.getElementById('info-view').classList.remove('hidden');
    msg.textContent = '';
  });
}

/* ============ TAB: BÀI HỌC ============ */

function wireLessonModal() {
  const modal = document.getElementById('lesson-modal');
  document.getElementById('add-lesson-btn').addEventListener('click', () => openLessonModal(null));
  document.getElementById('lesson-cancel-btn').addEventListener('click', () => modal.classList.remove('open'));

  document.querySelectorAll('input[name="lesson-source"]').forEach(r => {
    r.addEventListener('change', () => {
      const isUpload = document.querySelector('input[name="lesson-source"]:checked').value === 'upload';
      document.getElementById('upload-fields').classList.toggle('hidden', !isUpload);
      document.getElementById('link-fields').classList.toggle('hidden', isUpload);
    });
  });

  document.getElementById('lessons-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.edit) openLessonModal(id);
    if (btn.dataset.delete) await deleteLesson(id);
  });

  document.getElementById('lesson-form').addEventListener('submit', submitLesson);
}

function openLessonModal(id) {
  editingLessonId = id;
  const modal = document.getElementById('lesson-modal');
  document.getElementById('lesson-form').reset();
  document.getElementById('lesson-msg').textContent = '';

  if (id) {
    const lesson = lessonsCache.find(l => String(l.id) === String(id));
    document.getElementById('lesson-modal-title').textContent = 'Sửa bài học';
    document.getElementById('l-title').value = lesson.title;
    document.querySelector(`input[name="lesson-source"][value="link"]`).checked = true;
    document.getElementById('upload-fields').classList.add('hidden');
    document.getElementById('link-fields').classList.remove('hidden');
    document.getElementById('l-type-link').value = lesson.type;
    document.getElementById('l-url').value = lesson.file_url;
  } else {
    document.getElementById('lesson-modal-title').textContent = 'Thêm bài học';
    document.querySelector(`input[name="lesson-source"][value="upload"]`).checked = true;
    document.getElementById('upload-fields').classList.remove('hidden');
    document.getElementById('link-fields').classList.add('hidden');
  }
  modal.classList.add('open');
}

async function loadLessons() {
  const { data, error } = await supabase.from('lessons').select('*').eq('course_id', courseId).order('sort_order');
  lessonsCache = data || [];
  const wrap = document.getElementById('lessons-list');
  if (error) { wrap.innerHTML = `<p class="field-hint">Lỗi: ${error.message}</p>`; return; }
  if (!lessonsCache.length) { wrap.innerHTML = `<div class="empty-illustration"><div class="icon">🎬</div><p>Chưa có bài học nào.</p></div>`; return; }

  wrap.innerHTML = lessonsCache.map((l, idx) => `
    <div class="lesson-row" draggable="true" data-id="${l.id}">
      <span class="lesson-drag-handle" title="Kéo để sắp xếp lại">${ICON_GRIP}</span>
      <span class="lesson-order">${idx + 1}</span>
      <span class="lesson-type-col"><span class="lesson-type-badge ${TYPE_CLASSES[l.type] || 'type-doc'}">${TYPE_LABELS[l.type] || l.type}</span></span>
      <span class="lesson-title">${escapeHtml(l.title)}</span>
      <div class="lesson-actions">
        <button class="icon-btn edit" data-id="${l.id}" data-edit="1" title="Sửa">${ICON_EDIT}</button>
        <button class="icon-btn delete" data-id="${l.id}" data-delete="1" title="Xoá">${ICON_TRASH}</button>
      </div>
    </div>
  `).join('');

  attachDragEvents(wrap);
}

function attachDragEvents(wrap) {
  let draggingEl = null;

  wrap.querySelectorAll('.lesson-row').forEach((row) => {
    row.addEventListener('dragstart', () => {
      draggingEl = row;
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      draggingEl = null;
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggingEl || draggingEl === row) return;
      const rect = row.getBoundingClientRect();
      const isBefore = (e.clientY - rect.top) < rect.height / 2;
      wrap.insertBefore(draggingEl, isBefore ? row : row.nextSibling);
    });
  });

  wrap.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (!draggingEl) return;
    const newOrderIds = [...wrap.querySelectorAll('.lesson-row')].map((r) => r.dataset.id);
    await persistLessonOrder(newOrderIds);
  });
}

async function persistLessonOrder(orderedIds) {
  // Chỉ lưu lại nếu thứ tự thực sự thay đổi
  const oldOrderIds = lessonsCache.map((l) => String(l.id));
  const sameOrder = oldOrderIds.length === orderedIds.length && oldOrderIds.every((id, i) => id === orderedIds[i]);
  if (sameOrder) return;

  await Promise.all(orderedIds.map((id, idx) =>
    supabase.from('lessons').update({ sort_order: idx + 1 }).eq('id', id)
  ));
  await loadLessons();
}

async function deleteLesson(id) {
  if (!confirm('Xoá bài học này? Tiến độ học viên đã học bài này (nếu có) cũng sẽ mất theo.')) return;
  const { error } = await supabase.from('lessons').delete().eq('id', id);
  if (error) { alert(`Lỗi: ${error.message}`); return; }
  loadLessons();
}

async function submitLesson(e) {
  e.preventDefault();
  const msg = document.getElementById('lesson-msg');
  const submitBtn = document.getElementById('lesson-submit-btn');
  const title = document.getElementById('l-title').value.trim();
  const source = document.querySelector('input[name="lesson-source"]:checked').value;

  let type, fileUrl;

  if (source === 'link') {
    type = document.getElementById('l-type-link').value;
    fileUrl = document.getElementById('l-url').value.trim();
    if (!fileUrl) { msg.textContent = 'Vui lòng nhập đường dẫn.'; return; }
  } else {
    type = document.getElementById('l-type-upload').value;
    const file = document.getElementById('l-file').files[0];
    if (!file && !editingLessonId) { msg.textContent = 'Vui lòng chọn file.'; return; }

    if (file) {
      submitBtn.disabled = true;
      msg.textContent = 'Đang tải file lên...';
      const bucket = type === 'video' ? 'lesson-videos' : 'lesson-files';
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${courseId}/${Date.now()}_${safeName}`;
      const { error: uploadErr } = await supabase.storage.from(bucket).upload(path, file);
      submitBtn.disabled = false;
      if (uploadErr) { msg.textContent = `Lỗi tải file: ${uploadErr.message}`; return; }
      fileUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    } else {
      const lesson = lessonsCache.find(l => String(l.id) === String(editingLessonId));
      fileUrl = lesson.file_url;
    }
  }

  const payload = { title, type, file_url: fileUrl, course_id: courseId };

  let error;
  if (editingLessonId) {
    ({ error } = await supabase.from('lessons').update(payload).eq('id', editingLessonId));
  } else {
    const maxOrder = lessonsCache.length ? Math.max(...lessonsCache.map(l => l.sort_order || 0)) : 0;
    payload.sort_order = maxOrder + 1;
    ({ error } = await supabase.from('lessons').insert(payload));
  }

  if (error) { msg.textContent = `Lỗi lưu: ${error.message}`; return; }
  document.getElementById('lesson-modal').classList.remove('open');
  loadLessons();
}

/* ============ TAB: PHÂN QUYỀN ============ */

async function loadAssignLookups() {
  const [depRes, posRes] = await Promise.all([
    supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
    supabase.from('positions').select('id, name').eq('is_active', true).order('name'),
  ]);

  const depList = document.getElementById('assign-department-list');
  const posList = document.getElementById('assign-position-list');

  depList.innerHTML = (depRes.data || []).length
    ? (depRes.data || []).map(checkboxRow).join('')
    : '<p class="field-hint">Chưa có phòng ban nào.</p>';
  posList.innerHTML = (posRes.data || []).length
    ? (posRes.data || []).map(checkboxRow).join('')
    : '<p class="field-hint">Chưa có chức danh nào.</p>';
}

function checkboxRow(item) {
  return `<label><input type="checkbox" value="${item.id}" /> ${escapeHtml(item.name)}</label>`;
}

function wireAssignActions() {
  document.getElementById('assign-department-list').addEventListener('change', updateAssignComboState);
  document.getElementById('assign-position-list').addEventListener('change', updateAssignComboState);
  document.getElementById('assign-combo-btn').addEventListener('click', assignByDeptAndPosition);

  document.getElementById('assign-search').addEventListener('input', debounce(searchUsersForAssign, 350));
  document.getElementById('assign-selected-btn').addEventListener('click', assignSelectedUsers);

  document.getElementById('assigned-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-remove]');
    if (!btn) return;
    if (!confirm('Gỡ học viên này khỏi khoá học?')) return;
    const { error } = await supabase.from('course_assignments').delete().eq('id', btn.dataset.remove);
    if (error) { alert(error.message); return; }
    loadAssignedStudents();
    loadProgressReport();
  });
}

function getCheckedValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`)].map((cb) => cb.value);
}

function updateAssignComboState() {
  const deptCount = getCheckedValues('assign-department-list').length;
  const posCount = getCheckedValues('assign-position-list').length;
  document.getElementById('assign-combo-btn').disabled = !(deptCount && posCount);
}

async function assignByDeptAndPosition() {
  const msg = document.getElementById('assign-combo-msg');
  const deptIds = getCheckedValues('assign-department-list');
  const posIds = getCheckedValues('assign-position-list');
  if (!deptIds.length || !posIds.length) return;

  msg.textContent = 'Đang gán...';
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id')
    .in('department_id', deptIds)
    .in('position_id', posIds)
    .eq('is_active', true);

  if (error) { msg.textContent = `Lỗi: ${error.message}`; return; }
  await insertAssignments((users || []).map((u) => u.id));
  msg.textContent = '';
}

async function searchUsersForAssign() {
  const q = document.getElementById('assign-search').value.trim();
  const resultsEl = document.getElementById('assign-search-results');
  if (!q) { resultsEl.innerHTML = ''; return; }

  const { data: assignedRows } = await supabase.from('course_assignments').select('user_id').eq('course_id', courseId);
  const assignedIds = new Set((assignedRows || []).map(r => r.user_id));

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, employee_code')
    .or(`full_name.ilike.%${q}%,employee_code.ilike.%${q}%`)
    .limit(20);

  const filtered = (data || []).filter(u => !assignedIds.has(u.id));
  if (!filtered.length) { resultsEl.innerHTML = `<p class="field-hint">Không có kết quả (hoặc đã được gán hết).</p>`; return; }

  resultsEl.innerHTML = filtered.map(u => `
    <label style="display:flex; align-items:center; gap:8px; padding:6px 0; font-size:13.5px;">
      <input type="checkbox" value="${u.id}" ${selectedNewUserIds.has(u.id) ? 'checked' : ''} />
      ${escapeHtml(u.full_name)} <span style="color:var(--text-muted);">(${escapeHtml(u.employee_code)})</span>
    </label>
  `).join('');

  resultsEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selectedNewUserIds.add(cb.value);
      else selectedNewUserIds.delete(cb.value);
    });
  });
}

async function assignSelectedUsers() {
  if (!selectedNewUserIds.size) { alert('Chưa chọn học viên nào.'); return; }
  await insertAssignments([...selectedNewUserIds]);
  selectedNewUserIds.clear();
  document.getElementById('assign-search-results').innerHTML = '';
  document.getElementById('assign-search').value = '';
}

async function insertAssignments(userIds) {
  if (!userIds.length) { alert('Không có học viên phù hợp (có thể đã được gán hết).'); return; }
  const { data: existing } = await supabase.from('course_assignments').select('user_id').eq('course_id', courseId);
  const existingIds = new Set((existing || []).map(r => r.user_id));
  const toInsert = userIds.filter(id => !existingIds.has(id)).map(user_id => ({ course_id: courseId, user_id }));
  if (!toInsert.length) { alert('Tất cả đã được gán rồi.'); return; }

  const { error } = await supabase.from('course_assignments').insert(toInsert);
  if (error) { alert(`Lỗi: ${error.message}`); return; }
  loadAssignedStudents();
  loadProgressReport();
}

async function loadAssignedStudents() {
  const { data, error } = await supabase
    .from('course_assignments')
    .select('id, assigned_at, profiles(full_name, employee_code, departments(name))')
    .eq('course_id', courseId)
    .order('assigned_at', { ascending: false });

  const tbody = document.getElementById('assigned-body');
  tbody.innerHTML = '';
  if (error) { tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Lỗi: ${error.message}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Chưa gán học viên nào.</td></tr>`; return; }

  data.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.profiles?.full_name || '—')}</td>
      <td>${escapeHtml(row.profiles?.employee_code || '—')}</td>
      <td>${escapeHtml(row.profiles?.departments?.name || '—')}</td>
      <td>${row.assigned_at ? new Date(row.assigned_at).toLocaleDateString('vi-VN') : '—'}</td>
      <td><button class="icon-btn delete" data-remove="${row.id}" title="Gỡ">${ICON_TRASH}</button></td>
    `;
    tbody.appendChild(tr);
  });
}

/* ============ TAB: BÁO CÁO TIẾN ĐỘ ============ */

async function loadProgressReport() {
  const tbody = document.getElementById('progress-body');
  tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Đang tải...</td></tr>`;

  const { data: lessons } = await supabase.from('lessons').select('id').eq('course_id', courseId);
  const lessonIds = (lessons || []).map(l => l.id);
  const totalLessons = lessonIds.length;

  const { data: assigned } = await supabase
    .from('course_assignments')
    .select('user_id, profiles(full_name, employee_code, departments(name))')
    .eq('course_id', courseId);

  if (!assigned || !assigned.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Chưa có học viên nào được gán khoá học này.</td></tr>`;
    return;
  }

  let doneMap = {};
  if (lessonIds.length) {
    const { data: progress } = await supabase
      .from('lesson_progress')
      .select('user_id, lesson_id')
      .in('lesson_id', lessonIds)
      .eq('is_completed', true);
    (progress || []).forEach(p => { doneMap[p.user_id] = (doneMap[p.user_id] || 0) + 1; });
  }

  tbody.innerHTML = assigned.map(a => {
    const done = doneMap[a.user_id] || 0;
    const percent = totalLessons ? Math.round((done / totalLessons) * 100) : 0;
    return `
      <tr>
        <td>${escapeHtml(a.profiles?.full_name || '—')}</td>
        <td>${escapeHtml(a.profiles?.employee_code || '—')}</td>
        <td>${escapeHtml(a.profiles?.departments?.name || '—')}</td>
        <td>${done}/${totalLessons}</td>
        <td>
          <div class="mini-progress"><div class="mini-progress-fill" style="width:${percent}%"></div></div>
          <span style="font-size:11.5px; color:var(--text-muted);">${percent}%</span>
        </td>
      </tr>
    `;
  }).join('');
}

/* ============ Helpers ============ */

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}