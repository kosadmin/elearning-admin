import { supabase } from './supabaseClient.js';

const ICON_EDIT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

let departments = [];

export async function initCoursesPage() {
  await loadDepartments();
  populateDeptSelects();
  wireModal();
  await loadCourses();
}

async function loadDepartments() {
  const { data } = await supabase.from('departments').select('id, name').eq('is_active', true).order('name');
  departments = data || [];
}

function populateDeptSelects() {
  document.querySelectorAll('[data-select="department"]').forEach(el => {
    el.innerHTML = `<option value="">${el.dataset.emptyLabel}</option>` + departments.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  });
}

async function loadCourses() {
  const { data, error } = await supabase
    .from('courses')
    .select('id, title, icon, instructor_name, level, status, visibility, lessons(count)')
    .order('created_at', { ascending: false });

  const tbody = document.getElementById('courses-body');
  tbody.innerHTML = '';
  if (error) { tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Lỗi: ${error.message}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Chưa có khoá học nào.</td></tr>`; return; }

  data.forEach(row => {
    const lessonCount = row.lessons?.[0]?.count || 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.icon || '📘'} ${escapeHtml(row.title)}</td>
      <td>${escapeHtml(row.instructor_name || '—')}</td>
      <td>${escapeHtml(row.level || '—')}</td>
      <td>${row.visibility === 'public' ? '<span class="badge badge-primary">Công khai</span>' : '<span class="badge badge-neutral">Riêng tư</span>'}</td>
      <td>${row.status === 'active' ? '<span class="badge badge-active">Hoạt động</span>' : '<span class="badge badge-inactive">Ngừng</span>'}</td>
      <td>${lessonCount} bài</td>
      <td>
        <a class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" href="course-edit.html?id=${row.id}&title=${encodeURIComponent(row.title)}">Quản lý</a>
        <button class="icon-btn edit" data-edit="${row.id}" title="Sửa">${ICON_EDIT}</button>
        <button class="icon-btn delete" data-delete="${row.id}" title="Xoá">${ICON_TRASH}</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function wireModal() {
  const modal = document.getElementById('course-modal');
  let editingId = null;

  document.getElementById('add-course-btn').addEventListener('click', () => {
    editingId = null;
    document.getElementById('course-modal-title').textContent = 'Thêm khoá học';
    document.getElementById('course-form').reset();
    document.getElementById('c-icon').value = '📘';
    document.getElementById('c-status').checked = true;
    modal.classList.add('open');
  });

  document.getElementById('course-cancel-btn').addEventListener('click', () => modal.classList.remove('open'));

  document.getElementById('courses-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.edit) {
      const { data, error } = await supabase.from('courses').select('*').eq('id', btn.dataset.edit).single();
      if (error) { alert(error.message); return; }
      editingId = data.id;
      document.getElementById('course-modal-title').textContent = 'Sửa khoá học';
      document.getElementById('c-title').value = data.title || '';
      document.getElementById('c-icon').value = data.icon || '📘';
      document.getElementById('c-instructor').value = data.instructor_name || '';
      document.getElementById('c-description').value = data.description || '';
      document.getElementById('c-level').value = data.level || '';
      document.getElementById('c-department').value = data.department_id || '';
      document.getElementById('c-visibility').value = data.visibility || 'private';
      document.getElementById('c-objectives').value = (data.objectives || []).join('\n');
      document.getElementById('c-status').checked = data.status === 'active';
      modal.classList.add('open');
    }

    if (btn.dataset.delete) {
      if (!confirm('Xoá khoá học này? Toàn bộ bài học, phân quyền liên quan sẽ mất theo. Hành động không thể hoàn tác.')) return;
      const { error } = await supabase.from('courses').delete().eq('id', btn.dataset.delete);
      if (error) { alert(`Không thể xoá: ${error.message}`); return; }
      loadCourses();
    }
  });

  document.getElementById('course-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const objectivesRaw = document.getElementById('c-objectives').value.trim();
    const payload = {
      title: document.getElementById('c-title').value.trim(),
      icon: document.getElementById('c-icon').value.trim() || '📘',
      instructor_name: document.getElementById('c-instructor').value.trim() || null,
      description: document.getElementById('c-description').value.trim() || null,
      level: document.getElementById('c-level').value || null,
      department_id: document.getElementById('c-department').value || null,
      visibility: document.getElementById('c-visibility').value,
      objectives: objectivesRaw ? objectivesRaw.split('\n').map(s => s.trim()).filter(Boolean) : null,
      status: document.getElementById('c-status').checked ? 'active' : 'inactive',
    };

    let error;
    if (editingId) ({ error } = await supabase.from('courses').update(payload).eq('id', editingId));
    else ({ error } = await supabase.from('courses').insert(payload));

    if (error) { alert(`Lỗi lưu: ${error.message}`); return; }
    modal.classList.remove('open');
    loadCourses();
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}