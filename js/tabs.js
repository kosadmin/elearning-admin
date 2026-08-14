export function initTabs(containerSelector) {
  const container = document.querySelector(containerSelector);
  const tabs = container.querySelectorAll('[data-tab]');
  const panels = document.querySelectorAll('[data-tab-panel]');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      panels.forEach(p => {
        p.classList.toggle('hidden', p.dataset.tabPanel !== target);
      });
    });
  });
}