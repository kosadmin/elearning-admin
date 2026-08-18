import { supabase } from './supabaseClient.js';

const ICON_EDIT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

export async function initCoursesPage() {
  wireCreateModal();
  wireFilters();
  await loadCourses();
}

function currentStatusFilter() {
  return document.querySelector('#status-tabs .tab-item.active')?.dataset.status || '';
}

async function loadCourses() {
  const search = document.getElementById('f-search').value.trim();
  const statusFilter = currentStatusFilter();

  let query = supabase
    .from('courses')
    .select('id, title, instructor_name, description, objectives, level, start_date, end_date, visibility, status, course_categories(name), departments(name), lessons(count)')
    .order('created_at', { ascending: false });

  if (search) query = query.ilike('title', `%${search}%`);
  if (statusFilter) query = query.eq('status', statusFilter);

  const { data, error } = await query;
  const tbody = document.getElementById('courses-body');
  tbody.innerHTML = '';

  if (error) { tbody.innerHTML = `<tr class="empty-row"><td colspan="13">Lỗi: ${error.message}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="13">Chưa có khoá học nào.</td></tr>`; return; }

  data.forEach(row => {
    const lessonCount = row.lessons?.[0]?.count || 0;
    const objectivesText = (row.objectives || []).join(', ');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.title)}</td>
      <td>${escapeHtml(row.instructor_name || '—')}</td>
      <td>${escapeHtml(row.course_categories?.name || '—')}</td>
      <td>${escapeHtml(row.level || '—')}</td>
      <td>${escapeHtml(row.departments?.name || '—')}</td>
      <td class="truncate" title="${escapeHtml(row.description || '')}">${escapeHtml(row.description || '—')}</td>
      <td class="truncate" title="${escapeHtml(objectivesText)}">${escapeHtml(objectivesText || '—')}</td>
      <td>${row.start_date ? new Date(row.start_date).toLocaleDateString('vi-VN') : '—'}</td>
      <td>${row.end_date ? new Date(row.end_date).toLocaleDateString('vi-VN') : '—'}</td>
      <td>${row.visibility === 'public' ? '<span class="badge badge-primary">Công khai</span>' : '<span class="badge badge-neutral">Riêng tư</span>'}</td>
      <td>${row.status === 'active' ? '<span class="badge badge-active">Hoạt động</span>' : '<span class="badge badge-inactive">Ngừng</span>'}</td>
      <td>${lessonCount} bài</td>
      <td>
        <a class="icon-btn edit" href="course-edit.html?id=${row.id}" title="Sửa">${ICON_EDIT}</a>
        <button class="icon-btn delete" data-delete="${row.id}" title="Xoá">${ICON_TRASH}</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function wireFilters() {
  document.getElementById('f-search').addEventListener('input', debounce(loadCourses, 350));
  document.querySelectorAll('#status-tabs .tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#status-tabs .tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadCourses();
    });
  });

  document.getElementById('courses-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn || !btn.dataset.delete) return;
    if (!confirm('Xoá khoá học này? Toàn bộ bài học, phân quyền liên quan sẽ mất theo. Hành động không thể hoàn tác.')) return;
    const { error } = await supabase.from('courses').delete().eq('id', btn.dataset.delete);
    if (error) { alert(`Không thể xoá: ${error.message}`); return; }
    loadCourses();
  });
}

function wireCreateModal() {
  const modal = document.getElementById('create-course-modal');
  document.getElementById('add-course-btn').addEventListener('click', () => {
    document.getElementById('create-course-form').reset();
    modal.classList.add('open');
  });
  document.getElementById('create-course-cancel').addEventListener('click', () => modal.classList.remove('open'));

  document.getElementById('create-course-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('new-course-title').value.trim();
    if (!title) return;
    const { data, error } = await supabase.from('courses').insert({ title }).select().single();
    if (error) { alert(`Lỗi: ${error.message}`); return; }
    location.href = `course-edit.html?id=${data.id}`;
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}