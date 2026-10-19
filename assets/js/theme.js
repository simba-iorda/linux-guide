/**
 * theme.js — переключение тем и сохранение в localStorage.
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
  return theme;
}

export function isValidTheme(key) {
  return THEMES.some(t => t.key === key);
}

export function listThemeLabels() {
  return THEMES.map(t => `${t.key} — ${t.label}`);
}
