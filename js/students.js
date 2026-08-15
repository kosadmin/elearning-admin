import { supabase } from './supabaseClient.js';

const ICON_EDIT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_LOCK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const ICON_UNLOCK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;

let departments = [], positions = [], roles = [];

export async function initStudentsPage() {
  await loadLookups();
  populateSelects();
  wireFilters();
  wireCreateModal();
  wireEditModal();
  await loadStudents();
}

async function loadLookups() {
  const [depRes, posRes, roleRes] = await Promise.all([
    supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
    supabase.from('positions').select('id, name').eq('is_active', true).order('name'),
    supabase.from('user_roles').select('id, name').order('name'),
  ]);
  departments = depRes.data || [];
  positions = posRes.data || [];
  roles = roleRes.data || [];
}

function optionsHtml(list, emptyLabel) {
  return `<option value="">${emptyLabel}</option>` + list.map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
}

function populateSelects() {
  document.querySelectorAll('[data-select="department"]').forEach(el => el.innerHTML = optionsHtml(departments, el.dataset.emptyLabel));
  document.querySelectorAll('[data-select="position"]').forEach(el => el.innerHTML = optionsHtml(positions, el.dataset.emptyLabel));
  document.querySelectorAll('[data-select="role"]').forEach(el => el.innerHTML = optionsHtml(roles, el.dataset.emptyLabel));
}

async function loadStudents() {
  const search = document.getElementById('f-search').value.trim();
  const depFilter = document.getElementById('f-department').value;
  const statusFilter = document.getElementById('f-status').value;

  let query = supabase
    .from('profiles')
    .select('id, full_name, employee_code, email, phone, role, is_active, departments(name), positions(name), user_roles(name)')
    .order('full_name');

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,employee_code.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  if (depFilter) query = query.eq('department_id', depFilter);
  if (statusFilter) query = query.eq('is_active', statusFilter === 'active');

  const { data, error } = await query;
  const tbody = document.getElementById('students-body');
  tbody.innerHTML = '';

  if (error) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
    return;
  }
  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Không tìm thấy người dùng phù hợp.</td></tr>`;
    return;
  }

  data.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.full_name || '—')}</td>
      <td>${escapeHtml(row.employee_code)}</td>
      <td>${escapeHtml(row.departments?.name || '—')}</td>
      <td>${escapeHtml(row.user_roles?.name || '—')}</td>
      <td>${row.is_active ? '<span class="badge badge-active">Hoạt động</span>' : '<span class="badge badge-inactive">Đã khoá</span>'}</td>
      <td>
        <button class="icon-btn edit" data-edit="${row.id}" title="Sửa">${ICON_EDIT}</button>
        <button class="icon-btn lock" data-toggle="${row.id}" data-active="${row.is_active}" title="${row.is_active ? 'Khoá tài khoản' : 'Mở khoá'}">${row.is_active ? ICON_LOCK : ICON_UNLOCK}</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function wireFilters() {
  document.getElementById('f-search').addEventListener('input', debounce(loadStudents, 350));
  document.getElementById('f-department').addEventListener('change', loadStudents);
  document.getElementById('f-status').addEventListener('change', loadStudents);

  document.getElementById('students-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.edit) {
      openEditModal(btn.dataset.edit);
    }
    if (btn.dataset.toggle) {
      const id = btn.dataset.toggle;
      const isActive = btn.dataset.active === 'true';
      const label = isActive ? 'khoá' : 'mở khoá';
      if (!confirm(`Xác nhận ${label} tài khoản này?`)) return;
      const { error } = await supabase.from('profiles').update({ is_active: !isActive }).eq('id', id);
      if (error) { alert(`Lỗi: ${error.message}`); return; }
      loadStudents();
    }
  });
}

/* ---------- Tạo tài khoản ---------- */
function wireCreateModal() {
  const modal = document.getElementById('create-modal');
  document.getElementById('create-add-btn').addEventListener('click', () => {
    document.getElementById('create-form').reset();
    modal.classList.add('open');
  });
  document.getElementById('create-cancel-btn').addEventListener('click', () => modal.classList.remove('open'));

  document.getElementById('gen-password-btn').addEventListener('click', () => {
    document.getElementById('c-password').value = generatePassword();
  });

  document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('create-msg');
    msg.textContent = 'Đang tạo tài khoản...';

    const payload = {
      full_name: document.getElementById('c-full-name').value.trim(),
      employee_code: document.getElementById('c-employee-code').value.trim(),
      department_id: document.getElementById('c-department').value,
      position_id: document.getElementById('c-position').value,
      job_role_id: document.getElementById('c-role').value || null,
      email: document.getElementById('c-email').value.trim(),
      phone: document.getElementById('c-phone').value.trim(),
      role: document.getElementById('c-system-role').value,
      password: document.getElementById('c-password').value,
    };

    const { data, error } = await supabase.functions.invoke('admin-create-user', { body: payload });

    if (error) {
      msg.textContent = `Lỗi: ${error.message}`;
      return;
    }
    if (data?.error) {
      msg.textContent = `Lỗi: ${data.error}`;
      return;
    }

    modal.classList.remove('open');
    loadStudents();
  });
}

/* ---------- Sửa thông tin ---------- */
function wireEditModal() {
  const modal = document.getElementById('edit-modal');
  document.getElementById('edit-cancel-btn').addEventListener('click', () => modal.classList.remove('open'));

  document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('e-id').value;
    const payload = {
      full_name: document.getElementById('e-full-name').value.trim(),
      employee_code: document.getElementById('e-employee-code').value.trim(),
      department_id: document.getElementById('e-department').value,
      position_id: document.getElementById('e-position').value,
      job_role_id: document.getElementById('e-role').value || null,
      email: document.getElementById('e-email').value.trim() || null,
      phone: document.getElementById('e-phone').value.trim() || null,
      role: document.getElementById('e-system-role').value,
      is_active: document.getElementById('e-status').checked,
    };
    const { error } = await supabase.from('profiles').update(payload).eq('id', id);
    const msg = document.getElementById('edit-msg');
    if (error) { msg.textContent = `Lỗi: ${error.message}`; return; }
    modal.classList.remove('open');
    loadStudents();
  });
}

async function openEditModal(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, employee_code, email, phone, role, is_active, department_id, position_id, job_role_id')
    .eq('id', id).single();
  if (error) { alert(error.message); return; }

  document.getElementById('e-id').value = data.id;
  document.getElementById('e-full-name').value = data.full_name || '';
  document.getElementById('e-employee-code').value = data.employee_code;
  document.getElementById('e-department').value = data.department_id || '';
  document.getElementById('e-position').value = data.position_id || '';
  document.getElementById('e-role').value = data.job_role_id || '';
  document.getElementById('e-email').value = data.email || '';
  document.getElementById('e-phone').value = data.phone || '';
  document.getElementById('e-system-role').value = data.role;
  document.getElementById('e-status').checked = data.is_active;
  document.getElementById('edit-msg').textContent = '';

  document.getElementById('edit-modal').classList.add('open');
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
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