import { supabase } from './supabaseClient.js';

const ICON_EDIT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

export async function initSimpleCrud({ tableName, singularLabel, ids }) {
  const {
    tbodyId = 'data-body', addBtnId = 'add-btn', modalId = 'modal',
    modalTitleId = 'modal-title', formId = 'item-form',
    nameInputId = 'name-input', cancelBtnId = 'cancel-btn',
  } = ids || {};

  const tbody = document.getElementById(tbodyId);
  const addBtn = document.getElementById(addBtnId);
  const modal = document.getElementById(modalId);
  const modalTitle = document.getElementById(modalTitleId);
  const form = document.getElementById(formId);
  const nameInput = document.getElementById(nameInputId);
  const cancelBtn = document.getElementById(cancelBtnId);

  let editingId = null;

  async function load() {
    const { data, error } = await supabase.from(tableName).select('id, name').order('name');
    tbody.innerHTML = '';
    if (error) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="2">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
      return;
    }
    if (!data.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="2">Chưa có ${singularLabel.toLowerCase()} nào.</td></tr>`;
      return;
    }
    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(row.name)}</td>
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
    modal.classList.add('open');
    nameInput.focus();
  }
  function closeModal() { modal.classList.remove('open'); form.reset(); editingId = null; }

  addBtn.addEventListener('click', () => openModal('add', null));
  cancelBtn.addEventListener('click', closeModal);

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const editId = btn.dataset.edit;
    const deleteId = btn.dataset.delete;

    if (editId) {
      const { data } = await supabase.from(tableName).select('id, name').eq('id', editId).single();
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
    const name = nameInput.value.trim();
    if (!name) return;
    let error;
    if (editingId) ({ error } = await supabase.from(tableName).update({ name }).eq('id', editingId));
    else ({ error } = await supabase.from(tableName).insert({ name }));
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