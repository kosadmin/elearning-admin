import { supabase } from './supabaseClient.js';

const ICON_EDIT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_LOCK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const ICON_UNLOCK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;

const ICON_KEY = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`;

let departments = [], positions = [];
const userCache = new Map(); // id -> {full_name, employee_code} để dùng cho popup đặt lại mật khẩu

/* ============================================================
   KHỞI TẠO TRANG
   ============================================================ */

export async function initStudentsPage() {
  await loadLookups();
  populateSelects();
  wireFilters();
  wireCreateModal();
  wireEditModal();
  wireImportModal();
  wireResetModal();
  await loadStudents();
}

async function loadLookups() {
  const [depRes, posRes] = await Promise.all([
    supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
    supabase.from('positions').select('id, name').eq('is_active', true).order('name'),
  ]);
  departments = depRes.data || [];
  positions = posRes.data || [];
}

function optionsHtml(list, emptyLabel) {
  return `<option value="">${emptyLabel}</option>` + list.map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
}

function populateSelects() {
  document.querySelectorAll('[data-select="department"]').forEach(el => el.innerHTML = optionsHtml(departments, el.dataset.emptyLabel));
  document.querySelectorAll('[data-select="position"]').forEach(el => el.innerHTML = optionsHtml(positions, el.dataset.emptyLabel));
}

/* ============================================================
   DANH SÁCH NGƯỜI DÙNG
   ============================================================ */

function currentStatusFilter() {
  return document.querySelector('#status-tabs .tab-item.active')?.dataset.status || '';
}

async function loadStudents() {
  const search = document.getElementById('f-search').value.trim();
  const depFilter = document.getElementById('f-department').value;
  const statusFilter = currentStatusFilter();

  let query = supabase
    .from('profiles')
    .select('id, full_name, employee_code, email, phone, role, is_active, departments(name), positions(name)')
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
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Lỗi tải dữ liệu: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Không tìm thấy người dùng phù hợp.</td></tr>`;
    return;
  }

  data.forEach(row => {
    userCache.set(row.id, { full_name: row.full_name, employee_code: row.employee_code });
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.full_name || '—')}</td>
      <td>${escapeHtml(row.employee_code)}</td>
      <td>${escapeHtml(row.departments?.name || '—')}</td>
      <td>${escapeHtml(row.positions?.name || '—')}</td>
      <td>${row.role === 'admin' ? '<span class="badge badge-primary">Quản trị viên</span>' : '<span class="badge badge-neutral">Học viên</span>'}</td>
      <td>${row.is_active ? '<span class="badge badge-active">Hoạt động</span>' : '<span class="badge badge-inactive">Đã khoá</span>'}</td>
      <td>
        <button class="icon-btn edit" data-edit="${row.id}" title="Sửa">${ICON_EDIT}</button>
        <button class="icon-btn lock" data-reset="${row.id}" title="Đặt lại mật khẩu">${ICON_KEY}</button>
        <button class="icon-btn lock" data-toggle="${row.id}" data-active="${row.is_active}" title="${row.is_active ? 'Khoá tài khoản' : 'Mở khoá'}">${row.is_active ? ICON_LOCK : ICON_UNLOCK}</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function wireFilters() {
  document.getElementById('f-search').addEventListener('input', debounce(loadStudents, 350));
  document.getElementById('f-department').addEventListener('change', loadStudents);

  document.querySelectorAll('#status-tabs .tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#status-tabs .tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadStudents();
    });
  });

  document.getElementById('students-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.edit) {
      openEditModal(btn.dataset.edit);
    }
    if (btn.dataset.reset) {
      openResetModal(btn.dataset.reset);
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

/* ============================================================
   TẠO TÀI KHOẢN (1 NGƯỜI)
   ============================================================ */

// Gọi edge function và trả về chuỗi lỗi (hoặc null nếu thành công)
async function callCreateUser(payload) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', { body: payload });
  if (error) {
    let detail = error.message;
    if (error.context) {
      try {
        const body = await error.context.json();
        if (body?.error) detail = body.error;
      } catch (_) {}
    }
    return detail;
  }
  if (data?.error) return data.error;
  return null;
}

function wireCreateModal() {
  const modal = document.getElementById('create-modal');
  document.getElementById('create-add-btn').addEventListener('click', () => {
    document.getElementById('create-form').reset();
    document.getElementById('create-msg').textContent = '';
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
      email: document.getElementById('c-email').value.trim(),
      phone: document.getElementById('c-phone').value.trim(),
      role: document.getElementById('c-system-role').value,
      password: document.getElementById('c-password').value,
    };

    const err = await callCreateUser(payload);
    if (err) { msg.textContent = `Lỗi: ${err}`; return; }

    modal.classList.remove('open');
    loadStudents();
  });
}

/* ============================================================
   SỬA NGƯỜI DÙNG
   ============================================================ */

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
    .select('id, full_name, employee_code, email, phone, role, is_active, department_id, position_id, departments(name), positions(name)')
    .eq('id', id).single();
  if (error) { alert(error.message); return; }

  // Phòng ban/chức danh đã bị tắt không có trong dropdown -> thêm tạm để không bị trống khi sửa
  ensureOption('e-department', data.department_id, data.departments?.name);
  ensureOption('e-position', data.position_id, data.positions?.name);

  document.getElementById('e-id').value = data.id;
  document.getElementById('e-full-name').value = data.full_name || '';
  document.getElementById('e-employee-code').value = data.employee_code;
  document.getElementById('e-department').value = data.department_id || '';
  document.getElementById('e-position').value = data.position_id || '';
  document.getElementById('e-email').value = data.email || '';
  document.getElementById('e-phone').value = data.phone || '';
  document.getElementById('e-system-role').value = data.role;
  document.getElementById('e-status').checked = data.is_active;
  document.getElementById('edit-msg').textContent = '';

  document.getElementById('edit-modal').classList.add('open');
}

function ensureOption(selectId, value, name) {
  const sel = document.getElementById(selectId);
  sel.querySelectorAll('[data-temp]').forEach(o => o.remove());
  if (!value || [...sel.options].some(o => o.value === value)) return;
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = `${name || value} (đã ngừng hoạt động)`;
  opt.dataset.temp = '1';
  sel.appendChild(opt);
}

/* ============================================================
   ĐẶT LẠI MẬT KHẨU
   ============================================================ */

function wireResetModal() {
  const modal = document.getElementById('reset-modal');
  const msg = document.getElementById('reset-msg');
  const pwInput = document.getElementById('reset-password');
  const submitBtn = document.getElementById('reset-submit-btn');
  const copyBtn = document.getElementById('reset-copy-btn');

  document.getElementById('reset-cancel-btn').addEventListener('click', () => modal.classList.remove('open'));
  document.getElementById('reset-gen-btn').addEventListener('click', () => { pwInput.value = generatePassword(); });

  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(pwInput.value); copyBtn.textContent = 'Đã sao chép'; }
    catch (_) { pwInput.select(); document.execCommand('copy'); copyBtn.textContent = 'Đã sao chép'; }
  });

  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('reset-user-id').value;
    const newPassword = pwInput.value;
    if (newPassword.length < 6) { msg.textContent = 'Mật khẩu phải có ít nhất 6 ký tự.'; return; }

    submitBtn.disabled = true;
    msg.textContent = 'Đang đặt lại mật khẩu...';

    const { data, error } = await supabase.functions.invoke('admin-reset-password', {
      body: { user_id: userId, new_password: newPassword },
    });

    let detail = error?.message || data?.error;
    if (error?.context) {
      try { detail = (await error.context.json()).error || detail; } catch (_) {}
    }
    if (detail) { msg.textContent = `Lỗi: ${detail}`; submitBtn.disabled = false; return; }

    msg.textContent = 'Đã đặt lại mật khẩu thành công. Hãy gửi mật khẩu mới cho người dùng (cửa sổ này đóng là không xem lại được).';
    copyBtn.classList.remove('hidden');
    submitBtn.classList.add('hidden');
  });
}

function openResetModal(userId) {
  const u = userCache.get(userId) || {};
  document.getElementById('reset-user-id').value = userId;
  document.getElementById('reset-target').textContent = `Người dùng: ${u.full_name || '—'} (${u.employee_code || '—'})`;
  document.getElementById('reset-password').value = generatePassword();
  document.getElementById('reset-msg').textContent = '';
  document.getElementById('reset-submit-btn').classList.remove('hidden');
  document.getElementById('reset-submit-btn').disabled = false;
  const copyBtn = document.getElementById('reset-copy-btn');
  copyBtn.classList.add('hidden');
  copyBtn.textContent = 'Sao chép mật khẩu';
  document.getElementById('reset-modal').classList.add('open');
}

/* ============================================================
   NHẬP HÀNG LOẠT TỪ EXCEL
   ============================================================ */

const IMPORT_SHEET_NAME = 'Nhập người dùng';
const IMPORT_MAX_ROWS = 500;
const IMPORT_CONCURRENCY = 3;
const IMPORT_REQUIRED_HEADERS = ['Họ tên', 'Mã nhân sự', 'Phòng ban', 'Chức danh'];

let importRows = [];
let importRunning = false;

function wireImportModal() {
  const modal = document.getElementById('import-modal');
  const fileInput = document.getElementById('import-file');
  const runBtn = document.getElementById('import-run-btn');
  const resultBtn = document.getElementById('import-result-btn');
  const closeBtn = document.getElementById('import-close-btn');

  document.getElementById('import-template-btn').addEventListener('click', downloadImportTemplate);

  document.getElementById('import-open-btn').addEventListener('click', async () => {
    await loadLookups(); // lấy phòng ban/chức danh mới nhất để đối chiếu khi nhập
    importRows = [];
    fileInput.value = '';
    document.getElementById('import-body').innerHTML = `<tr class="empty-row"><td colspan="5">Chọn file Excel để xem trước dữ liệu.</td></tr>`;
    document.getElementById('import-summary').textContent = '';
    runBtn.disabled = true;
    runBtn.textContent = 'Bắt đầu nhập';
    resultBtn.classList.add('hidden');
    modal.classList.add('open');
  });

  closeBtn.addEventListener('click', () => {
    if (importRunning) { alert('Đang nhập dữ liệu, vui lòng chờ hoàn tất.'); return; }
    modal.classList.remove('open');
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await readImportFile(file);
  });

  runBtn.addEventListener('click', runImport);
  resultBtn.addEventListener('click', downloadImportResult);
}

// Tạo file Excel mẫu từ phòng ban/chức danh HIỆN TẠI trong database (luôn đúng dữ liệu mới nhất)
async function downloadImportTemplate() {
  if (typeof ExcelJS === 'undefined') {
    alert('Không tải được thư viện tạo Excel. Kiểm tra kết nối mạng rồi tải lại trang.');
    return;
  }
  await loadLookups();

  const depNames = departments.map(d => d.name);
  const posNames = positions.map(p => p.name);
  const roleNames = ['Học viên', 'Quản trị viên'];
  const FONT = 'Arial';
  const ORANGE = 'FFFF7A45', GREY = 'FF9CA3AF';

  const wb = new ExcelJS.Workbook();
  const guide = wb.addWorksheet('Hướng dẫn');
  const ws = wb.addWorksheet(IMPORT_SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
  const ref = wb.addWorksheet('Danh mục');

  // --- Sheet nhập liệu ---
  const cols = [
    ['Họ tên', true, 28], ['Mã nhân sự', true, 16], ['Phòng ban', true, 26], ['Chức danh', true, 22],
    ['Quyền', false, 16], ['Email', false, 28], ['SĐT', false, 16], ['Mật khẩu', false, 18],
  ];
  cols.forEach(([title, required, width], i) => {
    const col = ws.getColumn(i + 1);
    col.width = width;
    const c = ws.getCell(1, i + 1);
    c.value = title;
    c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: required ? ORANGE : GREY } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  ws.getRow(1).height = 24;

  const listRef = (letter, n) => `'Danh mục'!$${letter}$2:$${letter}$${Math.max(n, 1) + 1}`;
  const dvBase = {
    type: 'list', allowBlank: true, showErrorMessage: true, errorStyle: 'warning',
    errorTitle: 'Giá trị lạ', error: 'Giá trị không có trong danh mục, hệ thống có thể từ chối dòng này.',
  };
  for (let r = 2; r <= IMPORT_MAX_ROWS + 1; r++) {
    for (let c = 1; c <= 8; c++) {
      const cell = ws.getCell(r, c);
      cell.numFmt = '@'; // dạng Text: giữ số 0 đầu của SĐT/mã NV
      cell.font = { name: FONT };
    }
    ws.getCell(r, 3).dataValidation = { ...dvBase, formulae: [listRef('A', depNames.length)] };
    ws.getCell(r, 4).dataValidation = { ...dvBase, formulae: [listRef('B', posNames.length)] };
    ws.getCell(r, 5).dataValidation = { ...dvBase, formulae: [listRef('C', roleNames.length)] };
  }

  // --- Sheet danh mục (lấy từ database) ---
  [['Phòng ban', depNames], ['Chức danh', posNames], ['Quyền', roleNames]].forEach(([title, items], j) => {
    ref.getColumn(j + 1).width = 30;
    const h = ref.getCell(1, j + 1);
    h.value = title;
    h.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };
    items.forEach((v, i) => { ref.getCell(i + 2, j + 1).value = v; ref.getCell(i + 2, j + 1).font = { name: FONT }; });
  });
  ref.getCell('E1').value = `Danh sách lấy từ hệ thống lúc ${new Date().toLocaleString('vi-VN')}.`;
  ref.getCell('E1').font = { name: FONT, italic: true, color: { argb: 'FF6B7280' } };

  // --- Sheet hướng dẫn ---
  guide.getColumn(1).width = 18;
  guide.getColumn(2).width = 72;
  const exDep = depNames[0] || 'Tên phòng ban';
  const exPos = posNames[0] || 'Tên chức danh';
  const lines = [
    ['HƯỚNG DẪN NHẬP NGƯỜI DÙNG HÀNG LOẠT', null],
    [null, null],
    ['Bước 1', `Điền dữ liệu vào sheet "${IMPORT_SHEET_NAME}", mỗi người 1 dòng, bắt đầu từ dòng 2 (tối đa ${IMPORT_MAX_ROWS} dòng).`],
    ['Bước 2', 'Lưu file (.xlsx) rồi vào Quản trị người dùng → "Nhập từ Excel" → chọn file.'],
    ['Bước 3', 'Xem bảng kiểm tra, dòng lỗi sẽ báo rõ lý do. Bấm "Bắt đầu nhập".'],
    ['Bước 4', 'Tải "file kết quả" để lấy mật khẩu từng người và gửi cho nhân viên.'],
    [null, null],
    ['CỘT', 'QUY TẮC'],
    ['Họ tên *', 'Bắt buộc.'],
    ['Mã nhân sự *', 'Bắt buộc, không trùng. Tự đổi sang chữ HOA. Dùng làm tên đăng nhập.'],
    ['Phòng ban *', 'Bắt buộc, ghi ĐÚNG tên phòng ban (xem sheet "Danh mục").'],
    ['Chức danh *', 'Bắt buộc, ghi ĐÚNG tên chức danh (xem sheet "Danh mục").'],
    ['Quyền', 'Học viên hoặc Quản trị viên. Để trống = Học viên.'],
    ['Email', 'Không bắt buộc. Nếu trống, tài khoản dùng mãnv@noemail.internal.'],
    ['SĐT', 'Không bắt buộc, không trùng. Có thể đăng nhập bằng SĐT.'],
    ['Mật khẩu', 'Từ 6 ký tự. Để trống = hệ thống tự sinh 10 ký tự ngẫu nhiên.'],
    [null, null],
    ['VÍ DỤ 1 DÒNG', null],
    ['Họ tên', 'Nguyễn Văn A'], ['Mã nhân sự', 'AMS010'], ['Phòng ban', exDep], ['Chức danh', exPos],
    ['Quyền', 'Học viên'], ['Email', '(để trống)'], ['SĐT', '0901234567'], ['Mật khẩu', '(để trống để tự sinh)'],
  ];
  lines.forEach(([a, b], i) => {
    const ca = guide.getCell(i + 1, 1), cb = guide.getCell(i + 1, 2);
    ca.value = a; cb.value = b;
    ca.font = { name: FONT, bold: true }; cb.font = { name: FONT };
    cb.alignment = { wrapText: true, vertical: 'top' }; ca.alignment = { vertical: 'top' };
  });
  guide.getCell('A1').font = { name: FONT, bold: true, size: 14, color: { argb: 'FFE85F2E' } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mau-nhap-nguoi-dung.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

async function readImportFile(file) {
  const summary = document.getElementById('import-summary');
  const runBtn = document.getElementById('import-run-btn');
  runBtn.disabled = true;
  document.getElementById('import-result-btn').classList.add('hidden');

  if (typeof XLSX === 'undefined') {
    summary.textContent = 'Không tải được thư viện đọc Excel. Kiểm tra kết nối mạng rồi tải lại trang.';
    return;
  }

  let rawRows;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = wb.Sheets[IMPORT_SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
    rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  } catch (err) {
    summary.textContent = `Không đọc được file: ${err.message}`;
    return;
  }

  // Bỏ các dòng trống hoàn toàn
  rawRows = rawRows
    .map((r, i) => ({ r, line: i + 2 }))
    .filter(({ r }) => Object.values(r).some(v => String(v).trim() !== ''));

  if (!rawRows.length) { summary.textContent = 'File không có dữ liệu.'; return; }
  if (rawRows.length > IMPORT_MAX_ROWS) { summary.textContent = `File có ${rawRows.length} dòng, tối đa ${IMPORT_MAX_ROWS} dòng mỗi lần.`; return; }

  const headers = Object.keys(rawRows[0].r);
  const missing = IMPORT_REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missing.length) {
    summary.textContent = `Thiếu cột bắt buộc: ${missing.join(', ')}. Hãy dùng đúng file mẫu.`;
    return;
  }

  summary.textContent = 'Đang kiểm tra dữ liệu...';
  await buildImportRows(rawRows);
}

async function buildImportRows(rawRows) {
  const depMap = new Map(departments.map(d => [normText(d.name), d.id]));
  const posMap = new Map(positions.map(p => [normText(p.name), p.id]));

  // Dữ liệu đã có trong hệ thống, để phát hiện trùng trước khi gọi server
  const { data: existing, error } = await supabase.from('profiles').select('employee_code, phone, email');
  if (error) { document.getElementById('import-summary').textContent = `Lỗi kiểm tra dữ liệu: ${error.message}`; return; }

  const used = {
    code: new Set((existing || []).map(x => (x.employee_code || '').toUpperCase())),
    phone: new Set((existing || []).map(x => x.phone).filter(Boolean)),
    email: new Set((existing || []).map(x => (x.email || '').toLowerCase()).filter(Boolean)),
  };

  importRows = rawRows.map(({ r, line }) => {
    const item = {
      line,
      full_name: cell(r['Họ tên']),
      employee_code: cell(r['Mã nhân sự']).toUpperCase().replace(/\s+/g, ''),
      department_name: cell(r['Phòng ban']),
      position_name: cell(r['Chức danh']),
      department_id: depMap.get(normText(r['Phòng ban'])),
      position_id: posMap.get(normText(r['Chức danh'])),
      role: /admin|quản trị/i.test(cell(r['Quyền'])) ? 'admin' : 'student',
      email: cell(r['Email']).toLowerCase(),
      phone: normPhone(r['SĐT']),
      password: cell(r['Mật khẩu']) || generatePassword(),
      status: 'pending',
      msg: '',
    };

    const errs = [];
    if (!item.full_name) errs.push('thiếu họ tên');
    if (!item.employee_code) errs.push('thiếu mã nhân sự');
    if (!item.department_id) errs.push(`không có phòng ban "${item.department_name}"`);
    if (!item.position_id) errs.push(`không có chức danh "${item.position_name}"`);
    if (item.password.length < 6) errs.push('mật khẩu dưới 6 ký tự');
    if (item.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)) errs.push('email không hợp lệ');

    if (item.employee_code && used.code.has(item.employee_code)) errs.push('mã nhân sự đã tồn tại hoặc trùng trong file');
    if (item.phone && used.phone.has(item.phone)) errs.push('SĐT đã tồn tại hoặc trùng trong file');
    if (item.email && used.email.has(item.email)) errs.push('email đã tồn tại hoặc trùng trong file');

    if (errs.length) {
      item.status = 'error';
      item.msg = errs.join('; ');
    } else {
      // chỉ "chiếm" giá trị khi dòng hợp lệ, để dòng sau trùng sẽ bị báo
      used.code.add(item.employee_code);
      if (item.phone) used.phone.add(item.phone);
      if (item.email) used.email.add(item.email);
    }
    return item;
  });

  renderImportTable();
  const ok = importRows.filter(r => r.status === 'pending').length;
  document.getElementById('import-summary').textContent =
    `${importRows.length} dòng: ${ok} hợp lệ, ${importRows.length - ok} lỗi (dòng lỗi sẽ bị bỏ qua).`;
  const runBtn = document.getElementById('import-run-btn');
  runBtn.disabled = ok === 0;
  runBtn.textContent = ok ? `Bắt đầu nhập ${ok} người` : 'Bắt đầu nhập';
}

function renderImportTable() {
  const body = document.getElementById('import-body');
  body.innerHTML = importRows.map(r => {
    let status;
    if (r.status === 'ok') status = '<span class="badge badge-active">Đã tạo</span>';
    else if (r.status === 'error') status = `<span class="badge badge-inactive">Lỗi</span> <span class="field-hint">${escapeHtml(r.msg)}</span>`;
    else if (r.status === 'running') status = '<span class="badge badge-neutral">Đang tạo...</span>';
    else status = '<span class="badge badge-primary">Sẵn sàng</span>';
    return `
      <tr>
        <td>${r.line}</td>
        <td>${escapeHtml(r.full_name)}</td>
        <td>${escapeHtml(r.employee_code)}</td>
        <td>${escapeHtml(r.department_name)} / ${escapeHtml(r.position_name)}</td>
        <td style="white-space:normal; min-width:200px;">${status}</td>
      </tr>`;
  }).join('');
}

async function runImport() {
  const runBtn = document.getElementById('import-run-btn');
  const summary = document.getElementById('import-summary');
  const fileInput = document.getElementById('import-file');

  const queue = importRows.filter(r => r.status === 'pending');
  if (!queue.length) return;
  const total = queue.length;
  let finished = 0;

  importRunning = true;
  runBtn.disabled = true;
  fileInput.disabled = true;

  async function worker() {
    while (queue.length) {
      const r = queue.shift();
      r.status = 'running';
      renderImportTable();

      const err = await callCreateUser({
        full_name: r.full_name,
        employee_code: r.employee_code,
        department_id: r.department_id,
        position_id: r.position_id,
        email: r.email,
        phone: r.phone,
        role: r.role,
        password: r.password,
      });

      if (err) { r.status = 'error'; r.msg = err; } else { r.status = 'ok'; }
      finished++;
      summary.textContent = `Đang xử lý ${finished}/${total}...`;
      renderImportTable();
    }
  }
  await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, total) }, worker));

  importRunning = false;
  fileInput.disabled = false;
  const okCount = importRows.filter(r => r.status === 'ok').length;
  const errCount = importRows.filter(r => r.status === 'error').length;
  summary.textContent = `Hoàn tất: tạo thành công ${okCount}, lỗi ${errCount}. Hãy tải file kết quả để lấy mật khẩu.`;
  runBtn.textContent = 'Đã xong';
  document.getElementById('import-result-btn').classList.remove('hidden');
  loadStudents();
}

function downloadImportResult() {
  const statusLabel = { ok: 'Đã tạo', error: 'Lỗi', pending: 'Chưa xử lý' };
  downloadCsv('ket-qua-nhap-nguoi-dung.csv', [
    ['Dòng', 'Họ tên', 'Mã nhân sự', 'Phòng ban', 'Chức danh', 'Mật khẩu', 'Kết quả', 'Ghi chú'],
    ...importRows.map(r => [
      r.line, r.full_name, r.employee_code, r.department_name, r.position_name,
      r.status === 'ok' ? r.password : '',
      statusLabel[r.status] || r.status, r.msg,
    ]),
  ]);
}

/* ============================================================
   HÀM DÙNG CHUNG
   ============================================================ */

function cell(v) { return String(v ?? '').trim(); }
function normText(s) { return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' '); }

// Excel hay làm mất số 0 đầu của SĐT -> bù lại nếu đúng 9 chữ số
function normPhone(v) {
  let p = cell(v).replace(/[\s.\-()]/g, '');
  if (/^\d{9}$/.test(p)) p = '0' + p;
  return p;
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// CSV có BOM để Excel đọc đúng tiếng Việt
function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
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
