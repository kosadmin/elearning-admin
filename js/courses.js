import { supabase } from './supabaseClient.js';

const ICON_TRASH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const ICON_BOOK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;

// Xoay vòng 4 tông màu icon cho đỡ đơn điệu khi danh sách dài
const COVER_CLASSES = ['cover-0', 'cover-1', 'cover-2', 'cover-3'];

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
  if (!grid) return; // tránh lỗi nếu HTML thiếu phần tử này
  grid.innerHTML = '';

  if (error) {
    grid.innerHTML = `<p class="empty-text">Lỗi: ${escapeHtml(error.message)}</p>`;
    return;
  }
  if (!data.length) {
    grid.innerHTML = `<p class="empty-text">Chưa có khoá học nào phù hợp.</p>`;
    return;
  }

  data.forEach((row, idx) => {
    const lessonCount = row.lessons?.[0]?.count || 0;
    const coverClass = COVER_CLASSES[idx % COVER_CLASSES.length];
    const statusBadge = row.status === 'active'
      ? '<span class="badge badge-active badge-sm">Hoạt động</span>'
      : '<span class="badge badge-inactive badge-sm">Ngừng</span>';
    const visibilityBadge = row.visibility === 'public'
      ? '<span class="badge badge-primary badge-sm">Công khai</span>'
      : '<span class="badge badge-neutral badge-sm">Riêng tư</span>';

    const card = document.createElement('a');
    card.href = `course-edit.html?id=${row.id}`;
    card.className = 'course-card-v2';
    card.innerHTML = `
      <button class="course-card-menu" data-delete="${row.id}" title="Xoá">${ICON_TRASH}</button>
      <div class="course-card-row">
        <div class="course-card-icon-box ${coverClass}">${row.icon || '📘'}</div>
        <div class="course-card-info">
          <div class="course-card-title-v2">${escapeHtml(row.title)}</div>
          <div class="course-card-sub-v2">${row.instructor_name ? 'GV: ' + escapeHtml(row.instructor_name) : 'Chưa có giảng viên'}</div>
        </div>
      </div>
      <div class="course-card-badges-row">${statusBadge}${visibilityBadge}</div>
      <div class="course-card-divider"></div>
      <div class="course-card-footer-v2">
        <div class="course-card-meta">${ICON_BOOK}<span>${lessonCount} bài học</span></div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function wireFilters() {
  document.getElementById('f-search')?.addEventListener('input', debounce(loadCourses, 350));

  document.querySelectorAll('#status-tabs .tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#status-tabs .tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadCourses();
    });
  });

  document.getElementById('courses-grid')?.addEventListener('click', async (e) => {
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