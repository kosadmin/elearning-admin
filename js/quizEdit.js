import { supabase } from './supabaseClient.js';
import { initTabs } from './tabs.js';

const ICON_EDIT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const ICON_GRIP = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`;
const COVER_CLASSES = ['cover-0', 'cover-1', 'cover-2', 'cover-3'];

let quizId = null;
let currentQuiz = null;
let questionsCache = [];
let editingQuestionId = null;
let selectedNewUserIds = new Set();
let departmentOptions = [];
let positionOptions = [];

export async function initQuizEditPage() {
  const params = new URLSearchParams(location.search);
  quizId = params.get('id');
  if (!quizId) { alert('Thiếu ID bài kiểm tra.'); location.href = 'quizzes.html'; return; }

  initTabs('#quiz-tabs');

  await loadCoursesIntoSelect();
  await loadQuiz();
  wireInfoToggle();
  wireInfoForm();

  wireQuestionModal();
  await loadQuestions();

  await loadAssignLookups();
  wireAssignActions();
  await loadAssignedStudents();

  await loadResults();
}

/* ============ TAB: THÔNG TIN ============ */

async function loadCoursesIntoSelect() {
  const { data } = await supabase.from('courses').select('id, title').order('title');
  const select = document.getElementById('q-course');
  (data || []).forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.title;
    select.appendChild(opt);
  });
}

async function loadQuiz() {
  const { data, error } = await supabase
    .from('quizzes')
    .select('*, courses(id, title)')
    .eq('id', quizId).single();
  if (error) { alert(error.message); location.href = 'quizzes.html'; return; }
  currentQuiz = data;
  document.getElementById('page-title').textContent = data.title;
  renderView(data);
  fillEditForm(data);
  toggleAssignVisibility(data);
}

function renderView(data) {
  const isOverdue = data.due_date && new Date(data.due_date) < new Date();
  const badges = [];
  badges.push(data.allow_retake
    ? '<span class="badge badge-primary">Cho phép làm lại</span>'
    : '<span class="badge badge-neutral">Làm 1 lần</span>');
  if (data.passing_score != null) badges.push(`<span class="badge badge-active">Đạt: ${data.passing_score}đ</span>`);
  if (isOverdue) badges.push('<span class="badge badge-inactive">Đã hết hạn</span>');
  const badgesHtml = badges.join('');

  const heroCover = document.getElementById('hero-cover');
  heroCover.className = 'detail-hero-cover ' + COVER_CLASSES[quizIdHash(quizId) % COVER_CLASSES.length];
  document.getElementById('hero-title').textContent = data.title;
  document.getElementById('hero-sub').textContent = data.course_id
    ? `Khoá học: ${data.courses?.title || '—'}`
    : 'Bài thi độc lập';
  document.getElementById('hero-badges').innerHTML = badgesHtml;

  document.getElementById('view-course').textContent = data.course_id ? (data.courses?.title || '—') : 'Bài thi độc lập (không gắn khoá học)';
  document.getElementById('view-time').textContent = `${data.time_limit_minutes} phút`;
  document.getElementById('view-retake').textContent = data.allow_retake ? 'Có' : 'Không';
  document.getElementById('view-max-attempts').textContent = data.max_attempts != null ? `${data.max_attempts} lần` : 'Không giới hạn';
  document.getElementById('view-passing').textContent = data.passing_score != null ? `${data.passing_score}đ` : 'Không yêu cầu';
  document.getElementById('view-due').textContent = data.due_date ? new Date(data.due_date).toLocaleString('vi-VN') : 'Không có hạn';
}

function quizIdHash(id) {
  let hash = 0;
  const str = String(id || '');
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash;
}

function fillEditForm(data) {
  document.getElementById('q-title').value = data.title || '';
  document.getElementById('q-course').value = data.course_id || '';
  document.getElementById('q-time').value = data.time_limit_minutes ?? 30;
  document.getElementById('q-retake').checked = !!data.allow_retake;
  document.getElementById('q-max-attempts').value = data.max_attempts ?? '';
  document.getElementById('q-passing').value = data.passing_score ?? '';
  document.getElementById('q-due').value = data.due_date ? toDatetimeLocalValue(data.due_date) : '';
  toggleMaxAttemptsField();
}

function toggleMaxAttemptsField() {
  const wrap = document.getElementById('q-max-attempts-wrap');
  wrap.classList.toggle('hidden', !document.getElementById('q-retake').checked);
}

function toDatetimeLocalValue(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function wireInfoToggle() {
  document.getElementById('edit-info-btn').addEventListener('click', () => {
    document.querySelector('#quiz-tabs [data-tab="info"]')?.click();
    document.getElementById('info-view').classList.add('hidden');
    document.getElementById('info-edit').classList.remove('hidden');
  });
  document.getElementById('cancel-edit-info-btn').addEventListener('click', () => {
    fillEditForm(currentQuiz);
    document.getElementById('info-edit').classList.add('hidden');
    document.getElementById('info-view').classList.remove('hidden');
  });
  document.getElementById('q-retake').addEventListener('change', toggleMaxAttemptsField);
}

function wireInfoForm() {
  document.getElementById('quiz-info-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('info-msg');

    const allowRetake = document.getElementById('q-retake').checked;
    const payload = {
      title: document.getElementById('q-title').value.trim(),
      course_id: document.getElementById('q-course').value || null,
      time_limit_minutes: parseInt(document.getElementById('q-time').value, 10) || 30,
      allow_retake: allowRetake,
      max_attempts: (allowRetake && document.getElementById('q-max-attempts').value) ? parseInt(document.getElementById('q-max-attempts').value, 10) : null,
      passing_score: document.getElementById('q-passing').value ? parseInt(document.getElementById('q-passing').value, 10) : null,
      due_date: document.getElementById('q-due').value ? new Date(document.getElementById('q-due').value).toISOString() : null,
    };

    const { data, error } = await supabase
      .from('quizzes').update(payload).eq('id', quizId)
      .select('*, courses(id, title)').single();

    if (error) { msg.textContent = `Lỗi: ${error.message}`; return; }

    currentQuiz = data;
    document.getElementById('page-title').textContent = data.title;
    renderView(data);
    toggleAssignVisibility(data);
    document.getElementById('info-edit').classList.add('hidden');
    document.getElementById('info-view').classList.remove('hidden');
    msg.textContent = '';
  });
}

function toggleAssignVisibility(data) {
  const note = document.getElementById('assign-course-note');
  const block = document.getElementById('assign-standalone-block');
  if (data.course_id) {
    note.classList.remove('hidden');
    block.classList.add('hidden');
    document.getElementById('assign-course-link').href = `course-edit.html?id=${data.course_id}`;
  } else {
    note.classList.add('hidden');
    block.classList.remove('hidden');
  }
}

/* ============ TAB: CÂU HỎI ============ */

function wireQuestionModal() {
  const modal = document.getElementById('question-modal');
  document.getElementById('add-question-btn').addEventListener('click', () => openQuestionModal(null));
  document.getElementById('question-cancel-btn').addEventListener('click', () => modal.classList.remove('open'));
  document.getElementById('qq-add-option-btn').addEventListener('click', () => addOptionRow('', false));

  document.getElementById('questions-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.edit) openQuestionModal(id);
    if (btn.dataset.delete) await deleteQuestion(id);
  });

  document.getElementById('question-form').addEventListener('submit', submitQuestion);
}

function addOptionRow(value = '', checked = false) {
  const wrap = document.getElementById('qq-options-wrap');
  const row = document.createElement('div');
  row.className = 'option-row';
  row.innerHTML = `
    <input type="radio" name="qq-correct" ${checked ? 'checked' : ''} />
    <input type="text" class="field-input" placeholder="Nội dung đáp án" />
    <button type="button" class="icon-btn delete" title="Xoá đáp án">${ICON_TRASH}</button>
  `;
  row.querySelector('input[type="text"]').value = value;
  row.querySelector('button').addEventListener('click', () => {
    if (wrap.querySelectorAll('.option-row').length <= 2) { alert('Cần tối thiểu 2 đáp án.'); return; }
    row.remove();
  });
  wrap.appendChild(row);
}

function openQuestionModal(id) {
  editingQuestionId = id;
  document.getElementById('question-form').reset();
  document.getElementById('qq-options-wrap').innerHTML = '';
  document.getElementById('question-msg').textContent = '';

  if (id) {
    const q = questionsCache.find((x) => String(x.id) === String(id));
    document.getElementById('question-modal-title').textContent = 'Sửa câu hỏi';
    document.getElementById('qq-text').value = q.question_text;
    document.getElementById('qq-points').value = q.points ?? 1;
    document.getElementById('qq-explanation').value = q.explanation || '';
    (q.options || []).forEach((opt) => addOptionRow(opt, opt === q.correct_answer));
  } else {
    document.getElementById('question-modal-title').textContent = 'Thêm câu hỏi';
    document.getElementById('qq-points').value = 1;
    addOptionRow('', true);
    addOptionRow('', false);
  }
  document.getElementById('question-modal').classList.add('open');
}

async function loadQuestions() {
  const { data, error } = await supabase.from('quiz_questions').select('*').eq('quiz_id', quizId).order('sort_order');
  questionsCache = data || [];
  const wrap = document.getElementById('questions-list');
  if (error) { wrap.innerHTML = `<p class="field-hint">Lỗi: ${error.message}</p>`; return; }
  if (!questionsCache.length) { wrap.innerHTML = `<div class="empty-illustration"><div class="icon">❓</div><p>Chưa có câu hỏi nào.</p></div>`; return; }

  wrap.innerHTML = questionsCache.map((q, idx) => `
    <div class="lesson-row" draggable="true" data-id="${q.id}">
      <span class="lesson-drag-handle" title="Kéo để sắp xếp lại">${ICON_GRIP}</span>
      <span class="lesson-order">${idx + 1}</span>
      <span class="lesson-title">${escapeHtml(q.question_text)}</span>
      <span class="badge badge-primary badge-sm" style="margin-right:6px; flex-shrink:0;">${q.points ?? 1}đ</span>
      <div class="lesson-actions">
        <button class="icon-btn edit" data-id="${q.id}" data-edit="1" title="Sửa">${ICON_EDIT}</button>
        <button class="icon-btn delete" data-id="${q.id}" data-delete="1" title="Xoá">${ICON_TRASH}</button>
      </div>
    </div>
  `).join('');

  attachQuestionDragEvents(wrap);
}

function attachQuestionDragEvents(wrap) {
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
    await persistQuestionOrder(newOrderIds);
  });
}

async function persistQuestionOrder(orderedIds) {
  const oldOrderIds = questionsCache.map((q) => String(q.id));
  const sameOrder = oldOrderIds.length === orderedIds.length && oldOrderIds.every((id, i) => id === orderedIds[i]);
  if (sameOrder) return;

  await Promise.all(orderedIds.map((id, idx) =>
    supabase.from('quiz_questions').update({ sort_order: idx + 1 }).eq('id', id)
  ));
  await loadQuestions();
}

async function deleteQuestion(id) {
  if (!confirm('Xoá câu hỏi này? Các lượt làm bài đã nộp trước đó sẽ không bị ảnh hưởng, nhưng câu hỏi sẽ mất khỏi bài kiểm tra.')) return;
  const { error } = await supabase.from('quiz_questions').delete().eq('id', id);
  if (error) { alert(`Lỗi: ${error.message}`); return; }
  loadQuestions();
}

async function submitQuestion(e) {
  e.preventDefault();
  const msg = document.getElementById('question-msg');
  const text = document.getElementById('qq-text').value.trim();
  const points = parseInt(document.getElementById('qq-points').value, 10) || 1;
  const explanation = document.getElementById('qq-explanation').value.trim() || null;

  const rows = [...document.querySelectorAll('#qq-options-wrap .option-row')];
  const options = rows.map((r) => r.querySelector('input[type="text"]').value.trim());
  const correctIdx = rows.findIndex((r) => r.querySelector('input[type="radio"]').checked);

  if (!text) { msg.textContent = 'Vui lòng nhập nội dung câu hỏi.'; return; }
  if (options.some((o) => !o)) { msg.textContent = 'Vui lòng nhập đầy đủ nội dung các đáp án.'; return; }
  if (correctIdx === -1) { msg.textContent = 'Vui lòng chọn 1 đáp án đúng.'; return; }
  if (new Set(options).size !== options.length) { msg.textContent = 'Các đáp án không được trùng nhau.'; return; }

  const payload = {
    quiz_id: quizId,
    question_text: text,
    options,
    correct_answer: options[correctIdx],
    points,
    explanation,
  };

  let error;
  if (editingQuestionId) {
    ({ error } = await supabase.from('quiz_questions').update(payload).eq('id', editingQuestionId));
  } else {
    const maxOrder = questionsCache.length ? Math.max(...questionsCache.map((q) => q.sort_order || 0)) : 0;
    payload.sort_order = maxOrder + 1;
    ({ error } = await supabase.from('quiz_questions').insert(payload));
  }

  if (error) { msg.textContent = `Lỗi lưu: ${error.message}`; return; }
  document.getElementById('question-modal').classList.remove('open');
  loadQuestions();
}

/* ============ TAB: PHÂN QUYỀN (chỉ áp dụng khi bài thi độc lập) ============ */

async function loadAssignLookups() {
  const [depRes, posRes] = await Promise.all([
    supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
    supabase.from('positions').select('id, name').eq('is_active', true).order('name'),
  ]);
  departmentOptions = depRes.data || [];
  positionOptions = posRes.data || [];

  document.getElementById('qassign-department-panel').innerHTML = departmentOptions.length
    ? departmentOptions.map(checkboxRow).join('')
    : '<p class="field-hint">Chưa có phòng ban nào.</p>';
  document.getElementById('qassign-position-panel').innerHTML = positionOptions.length
    ? positionOptions.map(checkboxRow).join('')
    : '<p class="field-hint">Chưa có chức danh nào.</p>';
}

function checkboxRow(item) {
  return `<label><input type="checkbox" value="${item.id}" /> ${escapeHtml(item.name)}</label>`;
}

function wireAssignActions() {
  setupDropdown('qassign-department-trigger', 'qassign-department-panel');
  setupDropdown('qassign-position-trigger', 'qassign-position-panel');
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-select')) closeAllDropdowns();
  });

  document.getElementById('qassign-department-panel').addEventListener('change', () => {
    updateDropdownSummary('qassign-department-panel', 'qassign-department-summary', departmentOptions, 'Chọn phòng ban...');
    updateAssignComboState();
  });
  document.getElementById('qassign-position-panel').addEventListener('change', () => {
    updateDropdownSummary('qassign-position-panel', 'qassign-position-summary', positionOptions, 'Chọn chức danh...');
    updateAssignComboState();
  });
  document.getElementById('qassign-combo-btn').addEventListener('click', assignByDeptAndPosition);

  document.getElementById('qassign-search').addEventListener('input', debounce(searchUsersForAssign, 350));
  document.getElementById('qassign-selected-btn').addEventListener('click', assignSelectedUsers);

  document.getElementById('qassigned-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-remove]');
    if (!btn) return;
    if (!confirm('Gỡ học viên này khỏi bài kiểm tra?')) return;
    const { error } = await supabase.from('quiz_assignments').delete().eq('id', btn.dataset.remove);
    if (error) { alert(error.message); return; }
    loadAssignedStudents();
  });
}

function setupDropdown(triggerId, panelId) {
  const trigger = document.getElementById(triggerId);
  const panel = document.getElementById(panelId);
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !panel.classList.contains('hidden');
    closeAllDropdowns();
    if (!isOpen) panel.classList.remove('hidden');
  });
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-select-panel').forEach((p) => p.classList.add('hidden'));
}

function updateDropdownSummary(panelId, summaryId, options, placeholder) {
  const checkedIds = new Set(getCheckedValues(panelId));
  const summaryEl = document.getElementById(summaryId);
  if (!checkedIds.size) {
    summaryEl.textContent = placeholder;
    summaryEl.classList.add('dropdown-select-summary-muted');
    return;
  }
  summaryEl.classList.remove('dropdown-select-summary-muted');
  const names = options.filter((o) => checkedIds.has(String(o.id))).map((o) => o.name);
  summaryEl.textContent = names.length <= 2 ? names.join(', ') : `${names[0]} +${names.length - 1} khác`;
}

function getCheckedValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`)].map((cb) => cb.value);
}

function updateAssignComboState() {
  const deptCount = getCheckedValues('qassign-department-panel').length;
  const posCount = getCheckedValues('qassign-position-panel').length;
  document.getElementById('qassign-combo-btn').disabled = !(deptCount && posCount);
}

async function assignByDeptAndPosition() {
  const msg = document.getElementById('qassign-combo-msg');
  const deptIds = getCheckedValues('qassign-department-panel');
  const posIds = getCheckedValues('qassign-position-panel');
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
  const q = document.getElementById('qassign-search').value.trim();
  const resultsEl = document.getElementById('qassign-search-results');
  if (!q) { resultsEl.innerHTML = ''; return; }

  const { data: assignedRows } = await supabase.from('quiz_assignments').select('user_id').eq('quiz_id', quizId);
  const assignedIds = new Set((assignedRows || []).map((r) => r.user_id));

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, employee_code')
    .or(`full_name.ilike.%${q}%,employee_code.ilike.%${q}%`)
    .limit(20);

  const filtered = (data || []).filter((u) => !assignedIds.has(u.id));
  if (!filtered.length) { resultsEl.innerHTML = `<p class="field-hint">Không có kết quả (hoặc đã được gán hết).</p>`; return; }

  resultsEl.innerHTML = filtered.map((u) => `
    <label style="display:flex; align-items:center; gap:8px; padding:6px 0; font-size:13.5px;">
      <input type="checkbox" value="${u.id}" ${selectedNewUserIds.has(u.id) ? 'checked' : ''} />
      ${escapeHtml(u.full_name)} <span style="color:var(--text-muted);">(${escapeHtml(u.employee_code)})</span>
    </label>
  `).join('');

  resultsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
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
  document.getElementById('qassign-search-results').innerHTML = '';
  document.getElementById('qassign-search').value = '';
}

async function insertAssignments(userIds) {
  if (!userIds.length) { alert('Không có học viên phù hợp (có thể đã được gán hết).'); return; }
  const { data: existing } = await supabase.from('quiz_assignments').select('user_id').eq('quiz_id', quizId);
  const existingIds = new Set((existing || []).map((r) => r.user_id));
  const toInsert = userIds.filter((id) => !existingIds.has(id)).map((user_id) => ({ quiz_id: quizId, user_id }));
  if (!toInsert.length) { alert('Tất cả đã được gán rồi.'); return; }

  const { error } = await supabase.from('quiz_assignments').insert(toInsert);
  if (error) { alert(`Lỗi: ${error.message}`); return; }
  loadAssignedStudents();
}

async function loadAssignedStudents() {
  const { data, error } = await supabase
    .from('quiz_assignments')
    .select('id, assigned_at, profiles(full_name, employee_code, departments(name))')
    .eq('quiz_id', quizId)
    .order('assigned_at', { ascending: false });

  const tbody = document.getElementById('qassigned-body');
  tbody.innerHTML = '';
  if (error) { tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Lỗi: ${error.message}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Chưa gán học viên nào.</td></tr>`; return; }

  data.forEach((row) => {
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

/* ============ TAB: KẾT QUẢ ============ */

async function loadResults() {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('id, score, time_taken_seconds, submitted_at, user_id, profiles(full_name, employee_code)')
    .eq('quiz_id', quizId)
    .order('submitted_at', { ascending: false });

  const tbody = document.getElementById('attempts-body');
  if (error) { tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Lỗi: ${error.message}</td></tr>`; return; }

  const attempts = data || [];
  document.getElementById('stat-total-attempts').textContent = attempts.length;
  document.getElementById('stat-distinct-users').textContent = new Set(attempts.map((a) => a.user_id)).size;

  const avgScore = attempts.length ? Math.round(attempts.reduce((s, a) => s + (Number(a.score) || 0), 0) / attempts.length) : null;
  document.getElementById('stat-avg-score').textContent = avgScore != null ? `${avgScore}đ` : '—';

  const passingScore = currentQuiz?.passing_score;
  if (passingScore != null && attempts.length) {
    const passCount = attempts.filter((a) => (Number(a.score) || 0) >= passingScore).length;
    document.getElementById('stat-pass-rate').textContent = `${Math.round((passCount / attempts.length) * 100)}%`;
  } else {
    document.getElementById('stat-pass-rate').textContent = '—';
  }

  if (!attempts.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Chưa có học viên nào làm bài kiểm tra này.</td></tr>`;
    return;
  }

  tbody.innerHTML = attempts.map((a) => `
    <tr>
      <td>${escapeHtml(a.profiles?.full_name || '—')}</td>
      <td>${escapeHtml(a.profiles?.employee_code || '—')}</td>
      <td>${a.score != null ? a.score + 'đ' : '—'}</td>
      <td>${formatDuration(a.time_taken_seconds)}</td>
      <td>${a.submitted_at ? new Date(a.submitted_at).toLocaleString('vi-VN') : '—'}</td>
    </tr>
  `).join('');
}

function formatDuration(sec) {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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