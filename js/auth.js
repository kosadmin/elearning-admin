import { supabase } from './supabaseClient.js';

const NAV_ITEMS = [
  { href: 'index.html', label: 'Dashboard', key: 'dashboard' },
  { href: 'departments.html', label: 'Phòng ban', key: 'departments' },
  { href: 'positions.html', label: 'Chức danh', key: 'positions' },
  { href: 'students.html', label: 'Học viên', key: 'students' },
  { href: 'courses.html', label: 'Khoá học', key: 'courses' },
  { href: 'quizzes.html', label: 'Bài kiểm tra', key: 'quizzes' },
  { href: 'reports.html', label: 'Báo cáo', key: 'reports' },
  { href: 'banners.html', label: 'Banner', key: 'banners' },
  { href: 'settings.html', label: 'Cấu hình', key: 'settings' },
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
  nav.innerHTML = `
    <div class="sidebar">
      <div class="sidebar-title">E-Learning Admin</div>
      <div class="sidebar-user">${fullName || ''}</div>
      <ul>
        ${NAV_ITEMS.map(item => `
          <li><a href="${item.href}" class="${item.key === activeKey ? 'active' : ''}">${item.label}</a></li>
        `).join('')}
      </ul>
      <button id="logout-btn">Đăng xuất</button>
    </div>
  `;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
}