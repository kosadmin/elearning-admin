import { supabase } from './supabaseClient.js';
import { requireAdmin } from './auth.js';

export async function initSimpleCrud({ tableName, pageKey, singularLabel }) {
  await requireAdmin(pageKey);

  const tbody = document.getElementById('data-body');
  const addBtn = document.getElementById('add-btn');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const form = document.getElementById('item-form');
  const nameInput = document.getElementById('name-input');
  const cancelBtn = document.getElementById('cancel-btn');

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
          <button class="btn btn-secondary btn-sm" data-edit="${row.id}">Sửa</button>
          <button class="btn btn-danger btn-sm" data-delete="${row.id}">Xoá</button>
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

  function closeModal() {
    modal.classList.remove('open');
    form.reset();
    editingId = null;
  }

  addBtn.addEventListener('click', () => openModal('add', null));
  cancelBtn.addEventListener('click', closeModal);

  tbody.addEventListener('click', async (e) => {
    const editId = e.target.dataset.edit;
    const deleteId = e.target.dataset.delete;

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
    if (editingId) {
      ({ error } = await supabase.from(tableName).update({ name }).eq('id', editingId));
    } else {
      ({ error } = await supabase.from(tableName).insert({ name }));
    }

    if (error) {
      alert(`Lỗi lưu: ${error.message}`);
      return;
    }
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