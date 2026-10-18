/**
 * theme.js — переключатель тем и сохранение в localStorage.
 */
const STORAGE_KEY = 'linux-tutorial-theme';

export const THEMES = [
  { key: 'mocha', label: 'Catppuccin Mocha' },
  { key: 'macchiato', label: 'Catppuccin Macchiato' },
  { key: 'frappe', label: 'Catppuccin Frappé' },
  { key: 'latte', label: 'Catppuccin Latte' },
  { key: 'dracula', label: 'Dracula' },
  { key: 'nord', label: 'Nord' },
  { key: 'gruvbox', label: 'Gruvbox Dark' },
  { key: 'tokyonight', label: 'Tokyo Night' }
];

export function getStoredTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && THEMES.find(t => t.key === raw)) return raw;
  } catch (e) {
    // ignore
  }
  return 'mocha';
}

export function applyTheme(key) {
  const theme = THEMES.find(t => t.key === key) || THEMES[0];
  document.documentElement.dataset.theme = theme.key;
  try {
    localStorage.setItem(STORAGE_KEY, theme.key);
  } catch (e) {
    // ignore
  }
  updateActiveDot(theme.key);
}

function updateActiveDot(activeKey) {
  const dots = document.querySelectorAll('.theme-dot');
  dots.forEach(btn => {
    const active = btn.dataset.theme === activeKey;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

export function renderThemeDots(container) {
  if (!container) return;
  container.innerHTML = '';
  THEMES.forEach(theme => {
    const btn = document.createElement('button');
    btn.className = 'theme-dot';
    btn.type = 'button';
    btn.dataset.theme = theme.key;
    btn.title = theme.label;
    btn.setAttribute('aria-label', `Тема ${theme.label}`);
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => applyTheme(theme.key));
    container.appendChild(btn);
  });
  updateActiveDot(getStoredTheme());
}
