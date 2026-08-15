import { supabase } from './supabaseClient.js';

export async function requireAdmin() {
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

  highlightActiveNav();
  fillTopbarUser(profile.full_name);
  wireLogout();

  return profile;
}

function highlightActiveNav() {
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sidebar a[data-page]').forEach(a => {
    if (a.dataset.page === currentPage) a.classList.add('active');
  });
}

function fillTopbarUser(fullName) {
  const nameEl = document.getElementById('topbar-user-name');
  const avatarEl = document.getElementById('topbar-avatar');
  if (nameEl) nameEl.textContent = fullName || 'Admin';
  if (avatarEl) avatarEl.textContent = (fullName || 'A').trim().charAt(0).toUpperCase();
}

function wireLogout() {
  const btn = document.getElementById('logout-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
}