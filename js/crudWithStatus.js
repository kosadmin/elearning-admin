import { supabase } from './supabaseClient.js';

const ICON_EDIT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

export async function initCrudWithStatus({ tableName, singularLabel, ids }) {
  const { tbodyId, addBtnId, modalId, modalTitleId, formId, nameInputId, descInputId, statusInputId, cancelBtnId } = ids;

  const tbody = document.getElementById(tbodyId);
  const addBtn = document.getElementById(addBtnId);
  const modal = document.getElementById(modalId);
  const modalTitle = document.getElementById(modalTitleId);
  const form = document.getElementById(formId);
  const nameInput = document.getElementById(nameInputId);
  const descInput = document.getElementById(descInputId);
  const statusInput = document.getElementById(statusInputId);
  const cancelBtn = document.getElementById(cancelBtnId);

  let editingId = null;

  async function load() {
    const { data, error } = await supabase.from(tableName).select('id, name, description, is_active').order('name');
    tbody.innerHTML = '';
    if (error) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
      return;
    }
    if (!data.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Chưa có ${singularLabel.toLowerCase()} nào.</td></tr>`;
      return;
    }
    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(row.name)}</td>
        <td style="color:var(--text-muted);">${escapeHtml(row.description || '—')}</td>
        <td>${row.is_active ? '<span class="badge badge-active">Hoạt động</span>' : '<span class="badge badge-inactive">Ngừng</span>'}</td>
        <td>
          <button class="icon-btn edit" data-edit="${row.id}" title="Sửa">${ICON_EDIT}</button>
          <button class="icon-btn delete" data-delete="${row.id}" title="Xoá">${ICON_TRASH}</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function openModal(mode, row) {
    editingId = row ? row.id : null;
    modalTitle.textContent = mode === 'edit' ? `Sửa ${singularLabel}` : `Thêm ${singularLabel}`;
    nameInput.value = row ? row.name : '';
    descInput.value = row ? (row.description || '') : '';
    statusInput.checked = row ? row.is_active : true;
    modal.classList.add('open');
    nameInput.focus();
  }
  function closeModal() { modal.classList.remove('open'); form.reset(); statusInput.checked = true; editingId = null; }

  addBtn.addEventListener('click', () => openModal('add', null));
  cancelBtn.addEventListener('click', closeModal);

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const editId = btn.dataset.edit;
    const deleteId = btn.dataset.delete;

    if (editId) {
      const { data } = await supabase.from(tableName).select('id, name, description, is_active').eq('id', editId).single();
      openModal('edit', data);
    }
    if (deleteId) {
      if (!confirm(`Xoá ${singularLabel.toLowerCase()} này? Hành động không thể hoàn tác.`)) return;
      const { error } = await supabase.from(tableName).delete().eq('id', deleteId);
      if (error) {
        const msg = error.message.includes('foreign key')
          ? 'Không thể xoá vì đang được dùng bởi khoá học hoặc học viên khác.'
          : error.message;
        alert(`Không thể xoá: ${msg}`);
        return;
      }
      load();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: nameInput.value.trim(),
      description: descInput.value.trim() || null,
      is_active: statusInput.checked,
    };
    if (!payload.name) return;

    let error;
    if (editingId) ({ error } = await supabase.from(tableName).update(payload).eq('id', editingId));
    else ({ error } = await supabase.from(tableName).insert(payload));

    if (error) { alert(`Lỗi lưu: ${error.message}`); return; }
    closeModal();
    load();
  });

  load();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}