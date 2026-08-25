import { supabase } from './supabaseClient.js';

const ICON_TRASH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const ICON_QUESTION = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
const ICON_CLOCK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

const COVER_CLASSES = ['cover-0', 'cover-1', 'cover-2', 'cover-3'];

export async function initQuizzesPage() {
  await loadCoursesIntoSelect();
  wireCreateModal();
  wireFilters();
  await loadQuizzes();
}

async function loadCoursesIntoSelect() {
  const { data } = await supabase.from('courses').select('id, title').order('title');
  const select = document.getElementById('new-quiz-course');
  (data || []).forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.title;
    select.appendChild(opt);
  });
}

function currentKindFilter() {
  return document.querySelector('#kind-tabs .tab-item.active')?.dataset.kind || '';
}

async function loadQuizzes() {
  const search = document.getElementById('f-search').value.trim();
  const kind = currentKindFilter();

  let query = supabase
    .from('quizzes')
    .select('id, title, course_id, time_limit_minutes, allow_retake, max_attempts, passing_score, due_date, courses(title), quiz_questions(count)')
    .order('id', { ascending: false });

  if (search) query = query.ilike('title', `%${search}%`);
  if (kind === 'course') query = query.not('course_id', 'is', null);
  if (kind === 'standalone') query = query.is('course_id', null);

  const { data, error } = await query;
  const grid = document.getElementById('quizzes-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (error) {
    grid.innerHTML = `<p class="empty-text">Lỗi: ${escapeHtml(error.message)}</p>`;
    return;
  }
  if (!data.length) {
    grid.innerHTML = `<p class="empty-text">Chưa có bài kiểm tra nào phù hợp.</p>`;
    return;
  }

  const now = new Date();

  data.forEach((row, idx) => {
    const questionCount = row.quiz_questions?.[0]?.count || 0;
    const coverClass = COVER_CLASSES[idx % COVER_CLASSES.length];
    const isOverdue = row.due_date && new Date(row.due_date) < now;

    const badges = [];
    badges.push(row.allow_retake
      ? '<span class="badge badge-primary badge-sm">Cho phép làm lại</span>'
      : '<span class="badge badge-neutral badge-sm">Làm 1 lần</span>');
    if (row.passing_score != null) badges.push(`<span class="badge badge-active badge-sm">Đạt: ${row.passing_score}đ</span>`);
    if (isOverdue) badges.push('<span class="badge badge-inactive badge-sm">Đã hết hạn</span>');

    const card = document.createElement('a');
    card.href = `quiz-edit.html?id=${row.id}`;
    card.className = 'course-card-v2';
    card.innerHTML = `
      <button class="course-card-menu" data-delete="${row.id}" title="Xoá">${ICON_TRASH}</button>
      <div class="course-card-row">
        <div class="course-card-icon-box ${coverClass}">📝</div>
        <div class="course-card-info">
          <div class="course-card-title-v2">${escapeHtml(row.title)}</div>
          <div class="course-card-sub-v2">${row.course_id ? 'Khoá học: ' + escapeHtml(row.courses?.title || '—') : 'Bài thi độc lập'}</div>
        </div>
      </div>
      <div class="course-card-badges-row">${badges.join('')}</div>
      <div class="course-card-divider"></div>
      <div class="course-card-footer-v2">
        <div class="course-card-meta">${ICON_QUESTION}<span>${questionCount} câu hỏi</span></div>
        <div class="course-card-meta">${ICON_CLOCK}<span>${row.time_limit_minutes} phút</span></div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function wireFilters() {
  document.getElementById('f-search')?.addEventListener('input', debounce(loadQuizzes, 350));

  document.querySelectorAll('#kind-tabs .tab-item').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#kind-tabs .tab-item').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      loadQuizzes();
    });
  });

  document.getElementById('quizzes-grid')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Xoá bài kiểm tra này? Toàn bộ câu hỏi, phân quyền và kết quả làm bài liên quan sẽ mất theo. Hành động không thể hoàn tác.')) return;
    const { error } = await supabase.from('quizzes').delete().eq('id', btn.dataset.delete);
    if (error) { alert(`Không thể xoá: ${error.message}`); return; }
    loadQuizzes();
  });
}

function wireCreateModal() {
  const modal = document.getElementById('create-quiz-modal');
  document.getElementById('add-quiz-btn').addEventListener('click', () => {
    document.getElementById('create-quiz-form').reset();
    modal.classList.add('open');
  });
  document.getElementById('create-quiz-cancel').addEventListener('click', () => modal.classList.remove('open'));

  document.getElementById('create-quiz-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('new-quiz-title').value.trim();
    const courseId = document.getElementById('new-quiz-course').value || null;
    const timeLimit = parseInt(document.getElementById('new-quiz-time').value, 10) || 30;
    if (!title) return;

    const { data, error } = await supabase
      .from('quizzes')
      .insert({ title, course_id: courseId, time_limit_minutes: timeLimit })
      .select().single();
    if (error) { alert(`Lỗi: ${error.message}`); return; }
    location.href = `quiz-edit.html?id=${data.id}`;
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