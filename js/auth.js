import { supabase } from './supabaseClient.js';

const NAV_GROUPS = [
  { label: null, items: [{ href: 'index.html', label: 'Dashboard', key: 'dashboard' }] },
  { label: 'Cấu hình hệ thống', items: [
    { href: 'system-config.html', label: 'Phòng ban / Chức danh / Chung', key: 'system-config' },
  ]},
  { label: 'Người dùng', items: [
    { href: 'students.html', label: 'Học viên & tài khoản', key: 'students' },
  ]},
  { label: 'Bài giảng', items: [
    { href: 'courses.html', label: 'Khoá học', key: 'courses' },
  ]},
  { label: 'Kiểm tra & bài thi', items: [
    { href: 'quizzes.html', label: 'Bài kiểm tra', key: 'quizzes' },
  ]},
  { label: 'Trang chủ app', items: [
    { href: 'banners.html', label: 'Banner', key: 'banners' },
  ]},
  { label: null, items: [
    { href: 'reports.html', label: 'Báo cáo', key: 'reports' },
  ]},
];

export async function requireAdmin(activeKey) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', session.user.id)
    .single();

  if (error || !profile || profile.role !== 'admin') {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
    return null;
  }

  renderNav(activeKey, profile.full_name);
  return profile;
}

function renderNav(activeKey, fullName) {
  const nav = document.getElementById('app-nav');
  if (!nav) return;

  const groupsHtml = NAV_GROUPS.map(group => `
    ${group.label ? `<div class="nav-group-label">${group.label}</div>` : ''}
    <ul>
      ${group.items.map(item => `
        <li><a href="${item.href}" class="${item.key === activeKey ? 'active' : ''}">${item.label}</a></li>
      `).join('')}
    </ul>
  `).join('');

  nav.innerHTML = `
    <div class="sidebar">
      <div class="sidebar-title">E-Learning Admin</div>
      <div class="sidebar-user">${fullName || ''}</div>
      ${groupsHtml}
      <button id="logout-btn">Đăng xuất</button>
    </div>
  `;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
}