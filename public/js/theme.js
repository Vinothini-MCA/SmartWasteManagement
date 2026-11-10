// Dark/Light theme toggle
// Dark  = black background, gold accent, white text
// Light = white background, gold accent, black text
(function () {
  const stored = localStorage.getItem('swm-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', stored);

  function updateIcon() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const current = document.documentElement.getAttribute('data-theme');
    btn.textContent = current === 'dark' ? '\u2600' : '\u263D'; // sun / moon
    btn.setAttribute('aria-label', current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateIcon();
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('swm-theme', next);
        updateIcon();
      });
    }
  });
})();
