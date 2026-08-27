import { supabase } from './supabaseClient.js';

const ICON_LESSON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
const ICON_QUIZ = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`;

if (window.Chart && window.ChartDataLabels) {
  Chart.register(ChartDataLabels);
}

let progressChart = null;
let quizChart = null;
let modalChart = null;
let progressStatsCache = null;
let quizRowsCache = null;

export async function initDashboardPage() {
  const [studentsRes, coursesRes, quizzesRes] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    supabase.from('courses').select('*', { count: 'exact', head: true }),
    supabase.from('quizzes').select('*', { count: 'exact', head: true }),
  ]);

  document.getElementById('stat-students').textContent = studentsRes.count ?? 0;
  document.getElementById('stat-courses').textContent = coursesRes.count ?? 0;
  document.getElementById('stat-quizzes').textContent = quizzesRes.count ?? 0;

  const progress = await computeProgressStats();
  progressStatsCache = progress;
  document.getElementById('stat-completion-rate').textContent = progress.avgPercent != null ? `${progress.avgPercent}%` : '—';

  renderProgressChart(progress);
  await renderQuizScoreChart();
  await renderTopStudents();
  await renderRecentActivity();
  wireChartExpand();
}

/* ============ Tính tiến độ tổng thể (dùng chung cho stat-card + biểu đồ donut) ============ */

async function computeProgressStats() {
  const { data: assignments } = await supabase.from('course_assignments').select('user_id, course_id');
  if (!assignments || !assignments.length) {
    return { avgPercent: null, completed: 0, inProgress: 0, notStarted: 0 };
  }

  const courseIds = [...new Set(assignments.map((a) => a.course_id))];
  const { data: lessons } = await supabase.from('lessons').select('id, course_id').in('course_id', courseIds);

  const lessonToCourse = {};
  const totalByCourse = {};
  (lessons || []).forEach((l) => {
    lessonToCourse[l.id] = l.course_id;
    totalByCourse[l.course_id] = (totalByCourse[l.course_id] || 0) + 1;
  });

  const userIds = [...new Set(assignments.map((a) => a.user_id))];
  const { data: progressRows } = await supabase
    .from('lesson_progress')
    .select('user_id, lesson_id')
    .eq('is_completed', true)
    .in('user_id', userIds);

  const doneMap = {};
  (progressRows || []).forEach((p) => {
    const courseId = lessonToCourse[p.lesson_id];
    if (!courseId) return;
    const key = `${p.user_id}|${courseId}`;
    doneMap[key] = (doneMap[key] || 0) + 1;
  });

  let completed = 0, inProgress = 0, notStarted = 0;
  const percents = [];
  assignments.forEach((a) => {
    const total = totalByCourse[a.course_id] || 0;
    if (!total) { notStarted++; percents.push(0); return; }
    const done = doneMap[`${a.user_id}|${a.course_id}`] || 0;
    const percent = Math.round((done / total) * 100);
    percents.push(percent);
    if (percent >= 100) completed++;
    else if (percent > 0) inProgress++;
    else notStarted++;
  });

  const avgPercent = percents.length ? Math.round(percents.reduce((s, v) => s + v, 0) / percents.length) : null;
  return { avgPercent, completed, inProgress, notStarted };
}

function buildProgressConfig(stats) {
  return {
    type: 'doughnut',
    data: {
      labels: ['Hoàn thành 100%', 'Đang học', 'Chưa bắt đầu'],
      datasets: [{
        data: [stats.completed, stats.inProgress, stats.notStarted],
        backgroundColor: ['#22C55E', '#FF7A45', '#E5E7EB'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14, font: { size: 11.5 } } },
        datalabels: {
          color: '#fff',
          font: { weight: '700', size: 12 },
          formatter: (value) => (value > 0 ? value : ''),
        },
      },
    },
  };
}

function renderProgressChart(stats) {
  const canvas = document.getElementById('chart-progress');
  if (!canvas) return;
  if (!stats.completed && !stats.inProgress && !stats.notStarted) {
    canvas.closest('.dash-chart-wrap').innerHTML = '<p class="empty-text">Chưa có học viên nào được gán khoá học.</p>';
    return;
  }
  progressChart = new Chart(canvas, buildProgressConfig(stats));
}

/* ============ Biểu đồ điểm trung bình theo bài kiểm tra ============ */

async function renderQuizScoreChart() {
  const canvas = document.getElementById('chart-quiz-scores');
  if (!canvas) return;

  const [{ data: quizzes }, { data: attempts }] = await Promise.all([
    supabase.from('quizzes').select('id, title'),
    supabase.from('quiz_attempts').select('quiz_id, score'),
  ]);

  if (!quizzes?.length || !attempts?.length) {
    canvas.closest('.dash-chart-wrap').innerHTML = '<p class="empty-text">Chưa có lượt làm bài kiểm tra nào.</p>';
    return;
  }

  const scoresByQuiz = {};
  attempts.forEach((a) => {
    if (!scoresByQuiz[a.quiz_id]) scoresByQuiz[a.quiz_id] = [];
    scoresByQuiz[a.quiz_id].push(Number(a.score) || 0);
  });

  const rows = quizzes
    .filter((q) => scoresByQuiz[q.id]?.length)
    .map((q) => ({
      title: q.title,
      avg: Math.round(scoresByQuiz[q.id].reduce((s, v) => s + v, 0) / scoresByQuiz[q.id].length),
    }))
    .sort((a, b) => b.avg - a.avg);

  if (!rows.length) {
    canvas.closest('.dash-chart-wrap').innerHTML = '<p class="empty-text">Chưa có lượt làm bài kiểm tra nào.</p>';
    return;
  }

  quizRowsCache = rows;
  quizChart = new Chart(canvas, buildQuizScoreConfig(rows, 6));
}

function buildQuizScoreConfig(rows, limit) {
  const visible = rows.slice(0, limit);
  return {
    type: 'bar',
    data: {
      labels: visible.map((r) => (r.title.length > 20 ? r.title.slice(0, 20) + '…' : r.title)),
      datasets: [{
        label: 'Điểm trung bình',
        data: visible.map((r) => r.avg),
        backgroundColor: '#FF7A45',
        borderRadius: 6,
        maxBarThickness: 30,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {
          color: '#fff',
          anchor: 'end',
          align: 'start',
          font: { weight: '700', size: 11 },
          formatter: (value) => `${value}đ`,
        },
      },
      scales: { x: { min: 0, max: 100, ticks: { stepSize: 20 } } },
    },
  };
}

/* ============ Popup xem biểu đồ lớn ============ */

function wireChartExpand() {
  document.querySelectorAll('.chart-expand-btn').forEach((btn) => {
    btn.addEventListener('click', () => openChartModal(btn.dataset.chart));
  });
  document.getElementById('chart-modal-close').addEventListener('click', closeChartModal);
  document.getElementById('chart-modal').addEventListener('click', (e) => {
    if (e.target.id === 'chart-modal') closeChartModal();
  });
}

function openChartModal(type) {
  const canvas = document.getElementById('chart-modal-canvas');
  if (modalChart) { modalChart.destroy(); modalChart = null; }

  let config, title;
  if (type === 'progress') {
    if (!progressStatsCache) return;
    config = buildProgressConfig(progressStatsCache);
    title = 'Phân bổ tiến độ học viên';
  } else {
    if (!quizRowsCache) return;
    config = buildQuizScoreConfig(quizRowsCache, 15);
    title = 'Điểm trung bình theo bài kiểm tra';
  }

  document.getElementById('chart-modal-title').textContent = title;
  document.getElementById('chart-modal').classList.add('open');
  modalChart = new Chart(canvas, config);
}

function closeChartModal() {
  document.getElementById('chart-modal').classList.remove('open');
  if (modalChart) { modalChart.destroy(); modalChart = null; }
}

/* ============ Top học viên ============ */

async function renderTopStudents() {
  const wrap = document.getElementById('top-students-list');

  const { data: students } = await supabase.from('profiles').select('id, full_name, employee_code').eq('role', 'student');
  if (!students?.length) { wrap.innerHTML = '<p class="empty-text">Chưa có học viên nào.</p>'; return; }

  const studentIds = students.map((s) => s.id);

  const { data: assignments } = await supabase.from('course_assignments').select('user_id, course_id').in('user_id', studentIds);
  const courseIds = [...new Set((assignments || []).map((a) => a.course_id))];
  const { data: lessons } = await supabase.from('lessons').select('id, course_id').in('course_id', courseIds.length ? courseIds : ['__none__']);

  const lessonToCourse = {};
  const totalByCourse = {};
  (lessons || []).forEach((l) => {
    lessonToCourse[l.id] = l.course_id;
    totalByCourse[l.course_id] = (totalByCourse[l.course_id] || 0) + 1;
  });

  const { data: progressRows } = await supabase
    .from('lesson_progress')
    .select('user_id, lesson_id')
    .eq('is_completed', true)
    .in('user_id', studentIds);

  const doneMap = {};
  (progressRows || []).forEach((p) => {
    const courseId = lessonToCourse[p.lesson_id];
    if (!courseId) return;
    const key = `${p.user_id}|${courseId}`;
    doneMap[key] = (doneMap[key] || 0) + 1;
  });

  const completedCoursesByUser = {};
  (assignments || []).forEach((a) => {
    const total = totalByCourse[a.course_id] || 0;
    if (!total) return;
    const done = doneMap[`${a.user_id}|${a.course_id}`] || 0;
    if (done >= total) completedCoursesByUser[a.user_id] = (completedCoursesByUser[a.user_id] || 0) + 1;
  });

  const { data: attempts } = await supabase.from('quiz_attempts').select('user_id, quiz_id, score').in('user_id', studentIds);
  const bestByUserQuiz = {};
  (attempts || []).forEach((a) => {
    const key = `${a.user_id}|${a.quiz_id}`;
    bestByUserQuiz[key] = Math.max(bestByUserQuiz[key] ?? -1, Number(a.score) || 0);
  });
  const scoresByUser = {};
  Object.entries(bestByUserQuiz).forEach(([key, score]) => {
    const userId = key.split('|')[0];
    if (!scoresByUser[userId]) scoresByUser[userId] = [];
    scoresByUser[userId].push(score);
  });

  // Xếp hạng: ưu tiên số khoá học đã hoàn thành 100% (giảm dần),
  // nếu bằng nhau thì xét tiếp điểm kiểm tra trung bình (giảm dần).
  const ranked = students
    .map((s) => {
      const completedCourses = completedCoursesByUser[s.id] || 0;
      const scores = scoresByUser[s.id] || [];
      const avgScore = scores.length ? Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length) : null;
      return { ...s, completedCourses, avgScore };
    })
    .filter((s) => s.completedCourses > 0 || s.avgScore != null)
    .sort((a, b) => (b.completedCourses - a.completedCourses) || ((b.avgScore || 0) - (a.avgScore || 0)))
    .slice(0, 5);

  if (!ranked.length) { wrap.innerHTML = '<p class="empty-text">Chưa có dữ liệu học tập để xếp hạng.</p>'; return; }

  wrap.innerHTML = ranked.map((s, idx) => `
    <div class="leaderboard-row">
      <div class="leaderboard-rank ${idx === 0 ? 'top1' : idx === 1 ? 'top2' : idx === 2 ? 'top3' : ''}">${idx + 1}</div>
      <div class="avatar-circle">${escapeHtml((s.full_name || '?').trim().charAt(0).toUpperCase())}</div>
      <div class="leaderboard-name">
        <div class="name">${escapeHtml(s.full_name || '—')}</div>
        <div class="sub">${escapeHtml(s.employee_code || '')}</div>
      </div>
      <div class="leaderboard-stat">
        <strong>${s.completedCourses} khoá</strong>
        ${s.avgScore != null ? s.avgScore + 'đ TB' : '—'}
      </div>
    </div>
  `).join('');
}

/* ============ Hoạt động gần đây ============ */

async function renderRecentActivity() {
  const wrap = document.getElementById('recent-activity-list');

  const [{ data: lessonEvents }, { data: quizEvents }] = await Promise.all([
    supabase
      .from('lesson_progress')
      .select('completed_at, profiles(full_name), lessons(title, courses(title))')
      .eq('is_completed', true)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(10),
    supabase
      .from('quiz_attempts')
      .select('submitted_at, score, profiles(full_name), quizzes(title)')
      .order('submitted_at', { ascending: false })
      .limit(10),
  ]);

  const items = [];
  (lessonEvents || []).forEach((e) => {
    if (!e.completed_at) return;
    const courseTitle = e.lessons?.courses?.title;
    items.push({
      time: e.completed_at,
      type: 'lesson',
      html: `<strong>${escapeHtml(e.profiles?.full_name || 'Một học viên')}</strong> đã hoàn thành bài học <strong>${escapeHtml(e.lessons?.title || '—')}</strong>${courseTitle ? ' (' + escapeHtml(courseTitle) + ')' : ''}`,
    });
  });
  (quizEvents || []).forEach((e) => {
    if (!e.submitted_at) return;
    items.push({
      time: e.submitted_at,
      type: 'quiz',
      html: `<strong>${escapeHtml(e.profiles?.full_name || 'Một học viên')}</strong> đã nộp bài kiểm tra <strong>${escapeHtml(e.quizzes?.title || '—')}</strong> — đạt ${e.score}đ`,
    });
  });

  items.sort((a, b) => new Date(b.time) - new Date(a.time));
  const latest = items.slice(0, 8);

  if (!latest.length) { wrap.innerHTML = '<p class="empty-text">Chưa có hoạt động nào gần đây.</p>'; return; }

  wrap.innerHTML = latest.map((item) => `
    <div class="activity-row">
      <div class="activity-icon ${item.type}">${item.type === 'lesson' ? ICON_LESSON : ICON_QUIZ}</div>
      <div class="activity-text">${item.html}</div>
      <div class="activity-time">${timeAgo(item.time)}</div>
    </div>
  `).join('');
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}