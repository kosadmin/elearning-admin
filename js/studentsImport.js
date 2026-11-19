import { supabase } from './supabaseClient.js';

const MAX_ROWS = 500;
const CONCURRENCY = 3;
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const str = (v) => String(v ?? '').trim();

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
function normPhone(v) {
  let p = str(v).replace(/[\s.\-]/g, '');
  if (/^\d{9}$/.test(p)) p = '0' + p;          // Excel hay làm mất số 0 đầu
  return p;
}
function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}

export function wireImportModal({ getDepartments, getPositions, onDone }) {
  const modal = document.getElementById('import-modal');
  const body = document.getElementById('import-body');
  const summary = document.getElementById('import-summary');
  const runBtn = document.getElementById('import-run-btn');
  const resultBtn = document.getElementById('import-result-btn');
  let rows = [];

  document.getElementById('import-open-btn').addEventListener('click', () => {
    rows = []; body.innerHTML = ''; summary.textContent = '';
    document.getElementById('import-file').value = '';
    runBtn.disabled = true; resultBtn.classList.add('hidden');
    modal.classList.add('open');
  });
  document.getElementById('import-close-btn').addEventListener('click', () => modal.classList.remove('open'));

  document.getElementById('import-template-btn').addEventListener('click', () => {
    downloadCsv('mau-nhap-nguoi-dung.csv', [
      ['Họ tên', 'Mã nhân sự', 'Phòng ban', 'Chức danh', 'Quyền', 'Email', 'SĐT', 'Mật khẩu'],
      ['Nguyễn Văn A', 'AMS010', 'AnMaison | Lễ Tân', 'Nhân viên', 'Học viên', '', '0901234567', ''],
    ]);
  });

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
    if (raw.length > MAX_ROWS) { summary.textContent = `Tối đa ${MAX_ROWS} dòng/lần.`; return; }
    await prepareRows(raw);
  });

  async function prepareRows(raw) {
    const deps = new Map(getDepartments().map(d => [norm(d.name), d.id]));
    const poss = new Map(getPositions().map(p => [norm(p.name), p.id]));

    // Dữ liệu đã tồn tại trong DB
    const { data: existing } = await supabase.from('profiles').select('employee_code, phone, email');
    const used = {
      code: new Set((existing || []).map(x => x.employee_code?.toUpperCase())),
      phone: new Set((existing || []).map(x => x.phone).filter(Boolean)),
      email: new Set((existing || []).map(x => x.email?.toLowerCase()).filter(Boolean)),
    };

    rows = raw.map((r, i) => {
      const item = {
        line: i + 2, // dòng Excel (dòng 1 là tiêu đề)
        full_name: str(r['Họ tên']),
        employee_code: str(r['Mã nhân sự']).toUpperCase(), // đồng bộ với get_login_email (phân biệt hoa thường)
        department_id: deps.get(norm(r['Phòng ban'])),
        position_id: poss.get(norm(r['Chức danh'])),
        role: /admin|quản trị/i.test(str(r['Quyền'])) ? 'admin' : 'student',
        email: str(r['Email']).toLowerCase(),
        phone: normPhone(r['SĐT']),
        password: str(r['Mật khẩu']) || genPassword(),
        status: 'pending', msg: '',
      };
      const err = [];
      if (!item.full_name) err.push('thiếu họ tên');
      if (!item.employee_code) err.push('thiếu mã NV');
      if (!item.department_id) err.push(`không tìm thấy phòng ban "${str(r['Phòng ban'])}"`);
      if (!item.position_id) err.push(`không tìm thấy chức danh "${str(r['Chức danh'])}"`);
      if (item.password.length < 6) err.push('mật khẩu < 6 ký tự');
      if (used.code.has(item.employee_code)) err.push('mã NV đã tồn tại');
      if (item.phone && used.phone.has(item.phone)) err.push('SĐT đã tồn tại');
      if (item.email && used.email.has(item.email)) err.push('email đã tồn tại');
      // trùng ngay trong file
      used.code.add(item.employee_code);
      if (item.phone) used.phone.add(item.phone);
      if (item.email) used.email.add(item.email);
      if (err.length) { item.status = 'error'; item.msg = err.join('; '); }
      return item;
    });
    render();
    const ok = rows.filter(r => r.status === 'pending').length;
    summary.textContent = `${ok} dòng hợp lệ, ${rows.length - ok} dòng lỗi (sẽ bị bỏ qua).`;
    runBtn.disabled = ok === 0;
  }

  function render() {
    body.innerHTML = rows.map((r, i) => `
      <tr>
        <td>${r.line}</td>
        <td>${esc(r.full_name)}</td>
        <td>${esc(r.employee_code)}</td>
        <td>${r.status === 'ok' ? '<span class="badge badge-active">Đã tạo</span>'
            : r.status === 'error' ? `<span class="badge badge-inactive">Lỗi</span> ${esc(r.msg)}`
            : r.status === 'running' ? 'Đang tạo...' : 'Chờ'}</td>
      </tr>`).join('');
  }

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    const queue = rows.filter(r => r.status === 'pending');
    let done = 0;

    async function worker() {
      while (queue.length) {
        const r = queue.shift();
        r.status = 'running'; render();
        const { data, error } = await supabase.functions.invoke('admin-create-user', {
          body: {
            full_name: r.full_name, employee_code: r.employee_code,
            department_id: r.department_id, position_id: r.position_id,
            email: r.email, phone: r.phone, role: r.role, password: r.password,
          },
        });
        let detail = error?.message || data?.error;
        if (error?.context) { try { detail = (await error.context.json()).error || detail; } catch (_) {} }
        if (detail) { r.status = 'error'; r.msg = detail; } else { r.status = 'ok'; }
        done++; summary.textContent = `Đang xử lý ${done}/${done + queue.length}...`;
        render();
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const ok = rows.filter(r => r.status === 'ok').length;
    summary.textContent = `Xong: tạo thành công ${ok}/${rows.length}.`;
    resultBtn.classList.remove('hidden');
    onDone();
  });

  resultBtn.addEventListener('click', () => {
    downloadCsv('ket-qua-nhap.csv', [
      ['Dòng', 'Họ tên', 'Mã NV', 'Mật khẩu', 'Kết quả', 'Ghi chú'],
      ...rows.map(r => [r.line, r.full_name, r.employee_code, r.status === 'ok' ? r.password : '', r.status, r.msg]),
    ]);
  });
}

function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
