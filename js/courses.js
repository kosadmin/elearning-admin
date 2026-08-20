import { supabase } from './supabaseClient.js';

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
    .select('id, title, icon, instructor_name, level, status, visibility, course_categories(name), lessons(count)')
    .order('created_at', { ascending: false });

  if (search) query = query.ilike('title', `%${search}%`);
  if (statusFilter) query = query.eq('status', statusFilter);

  const { data, error } = await query;
  const grid = document.getElementById('courses-grid');
  grid.innerHTML = '';

  if (error) { grid.innerHTML = `<p class="field-hint">Lỗi: ${error.message}</p>`; return; }
  if (!data.length) { grid.innerHTML = `<p class="field-hint">Chưa có khoá học nào.</p>`; return; }

  data.forEach(row => {
    const lessonCount = row.lessons?.[0]?.count || 0;
    const card = document.createElement('a');
    card.href = `course-edit.html?id=${row.id}`;
    card.className = 'course-card';
    card.innerHTML = `
      <button class="icon-btn delete course-card-delete" data-delete="${row.id}" title="Xoá">${ICON_TRASH}</button>
      <div class="course-card-icon">${row.icon || '📘'}</div>
      <div class="course-card-title">${escapeHtml(row.title)}</div>
      <div class="course-card-sub">${row.instructor_name ? 'GV: ' + escapeHtml(row.instructor_name) : 'Chưa có giảng viên'}</div>
      <div class="course-card-badges">
        ${row.course_categories?.name ? `<span class="badge badge-neutral">${escapeHtml(row.course_categories.name)}</span>` : ''}
        ${row.level ? `<span class="badge badge-neutral">${escapeHtml(row.level)}</span>` : ''}
        ${row.visibility === 'public' ? '<span class="badge badge-primary">Công khai</span>' : ''}
      </div>
      <div class="course-card-footer">
        <span>${lessonCount} bài học</span>
        ${row.status === 'active' ? '<span class="badge badge-active">Hoạt động</span>' : '<span class="badge badge-inactive">Ngừng</span>'}
      </div>
    `;
    grid.appendChild(card);
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

  document.getElementById('courses-grid').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
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