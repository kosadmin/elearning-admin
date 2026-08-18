import { supabase } from './supabaseClient.js';
import { initTabs } from './tabs.js';

const ICON_CHOICES = ['📘','💼','📊','🎯','🛠️','📈','🧾','🧠','✅','📋','⚖️','🔒','💡','🗂️'];

let courseId = null;

export async function initCourseEditPage() {
  const params = new URLSearchParams(location.search);
  courseId = params.get('id');
  if (!courseId) { alert('Thiếu ID khoá học.'); location.href = 'courses.html'; return; }

  initTabs('#course-tabs');
  renderIconPicker();
  await loadLookups();
  await loadCourse();
  wireForm();
}

function renderIconPicker() {
  const wrap = document.getElementById('icon-picker');
  wrap.innerHTML = ICON_CHOICES.map(ic => `<button type="button" data-icon="${ic}">${ic}</button>`).join('');
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    document.getElementById('c-icon').value = btn.dataset.icon;
  });
}

async function loadLookups() {
  const [catRes, depRes] = await Promise.all([
    supabase.from('course_categories').select('id, name').eq('is_active', true).order('name'),
    supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
  ]);
  document.getElementById('c-category').innerHTML = `<option value="">-- Không chọn --</option>` + (catRes.data || []).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  document.getElementById('c-department').innerHTML = `<option value="">-- Không giới hạn --</option>` + (depRes.data || []).map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
}

async function loadCourse() {
  const { data, error } = await supabase.from('courses').select('*').eq('id', courseId).single();
  if (error) { alert(error.message); location.href = 'courses.html'; return; }

  document.getElementById('page-title').textContent = data.title;
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

function wireForm() {
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

    const { error } = await supabase.from('courses').update(payload).eq('id', courseId);
    msg.textContent = error ? `Lỗi: ${error.message}` : 'Đã lưu.';
    if (!error) document.getElementById('page-title').textContent = payload.title;
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}