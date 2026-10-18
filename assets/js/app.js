/**
 * app.js — точка входа учебника «Linux с нуля».
 */
import { renderLesson, renderCheatSheet } from './renderer.js';
import { onChange, completedLessons, resetProgress, isLessonDoneExported, setLessonTotal } from './progress.js';

const sidebar = document.getElementById('sidebar');
const sidebarList = document.getElementById('sidebar-list');
const main = document.getElementById('main');
const progressBadge = document.getElementById('progress-badge');
const resetBtn = document.getElementById('reset-progress');
const menuBtn = document.getElementById('menu-toggle');
const loader = document.getElementById('global-loader');

let manifest = [];
let currentId = null;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setTitle(title) {
  document.title = (title ? title + ' — ' : '') + 'Linux с нуля';
}

function showLoader() {
  main.innerHTML = loader.innerHTML;
}

function showError(heading, text) {
  main.innerHTML = `<div class="error-box"><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(text)}</p></div>`;
}

function buildSidebar() {
  sidebarList.innerHTML = '';

  const cheat = document.createElement('li');
  cheat.innerHTML = `<a href="#cheatsheet" data-id="cheatsheet">Полный справочник</a>`;
  cheat.querySelector('a').addEventListener('click', (e) => {
    e.preventDefault();
    loadCheatSheet();
    if (window.innerWidth < 768) sidebar.classList.remove('open');
  });
  sidebarList.appendChild(cheat);

  manifest.forEach(item => {
    const li = document.createElement('li');
    li.dataset.id = item.id;
    li.innerHTML = `<a href="#${item.id}" data-id="${item.id}"><span class="lesson-title">${escapeHtml(item.title)}</span><span class="lesson-minutes">${item.minutes} мин</span></a>`;
    li.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      loadLesson(item.id);
      if (window.innerWidth < 768) sidebar.classList.remove('open');
    });
    sidebarList.appendChild(li);
  });
  updateSidebarMarks();
}

function updateSidebarMarks() {
  manifest.forEach(item => {
    const li = sidebarList.querySelector(`li[data-id="${item.id}"]`);
    if (!li) return;
    const done = isLessonDoneExported(item.id);
    li.classList.toggle('done', done);
  });
  const completed = completedLessons(manifest.map(m => m.id));
  progressBadge.textContent = `${completed.length}/${manifest.length}`;
}

function addNextLink(lessonId) {
  const idx = manifest.findIndex(m => m.id === lessonId);
  const nav = document.createElement('nav');
  nav.className = 'lesson-next';
  if (idx >= 0 && idx < manifest.length - 1) {
    const next = manifest[idx + 1];
    nav.innerHTML = `<a href="#${next.id}" class="next-link">Следующий урок →<span>${escapeHtml(next.title)}</span></a>`;
    nav.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      loadLesson(next.id);
    });
  } else {
    nav.innerHTML = `<a href="#cheatsheet" class="next-link">Полный справочник →</a>`;
    nav.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      loadCheatSheet();
    });
  }
  main.appendChild(nav);
}

async function loadLesson(id) {
  currentId = id;
  setTitle('Загрузка…');
  showLoader();
  try {
    const res = await fetch(`content/lessons/${id}.md`);
    if (!res.ok) {
      if (res.status === 404) throw new Error('Урок не найден (404). Возможно, контент ещё не добавлен.');
      throw new Error(`Ошибка загрузки: ${res.status}`);
    }
    const md = await res.text();
    const { root } = renderLesson(md, id);
    main.innerHTML = '';
    main.appendChild(root);
    addNextLink(id);
    history.replaceState(null, '', '#' + id);
    const item = manifest.find(m => m.id === id);
    setTitle(item ? item.title : id);
    updateActiveSidebar(id);
    window.scrollTo(0, 0);
  } catch (e) {
    setTitle('Ошибка');
    showError('Не удалось загрузить урок', e.message);
  }
}

async function loadCheatSheet() {
  currentId = 'cheatsheet';
  setTitle('Полный справочник');
  showLoader();
  try {
    const res = await fetch('content/cheatsheet.md');
    if (!res.ok) {
      if (res.status === 404) throw new Error('Справочник не найден (404).');
      throw new Error(`Ошибка загрузки: ${res.status}`);
    }
    const md = await res.text();
    const root = renderCheatSheet(md);
    main.innerHTML = '';
    main.appendChild(root);
    history.replaceState(null, '', '#cheatsheet');
    updateActiveSidebar('cheatsheet');
    window.scrollTo(0, 0);
  } catch (e) {
    setTitle('Ошибка');
    showError('Не удалось загрузить справочник', e.message);
  }
}

function updateActiveSidebar(id) {
  sidebarList.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.dataset.id === id));
}

function countBlocks(md) {
  const quiz = (md.match(/^```quiz\s*\n/gm) || []).length;
  const terminal = (md.match(/^```terminal\s*\n/gm) || []).length;
  return { quiz, terminal };
}

async function preloadLessonTotals() {
  await Promise.all(manifest.map(async (item) => {
    try {
      const res = await fetch(`content/lessons/${item.id}.md`);
      if (!res.ok) return;
      const md = await res.text();
      const { quiz, terminal } = countBlocks(md);
      setLessonTotal(item.id, quiz, terminal);
    } catch (e) {
      // ignore
    }
  }));
}

async function init() {
  showLoader();
  try {
    const res = await fetch('content/lessons/manifest.json');
    if (!res.ok) {
      if (res.status === 404) throw new Error('Список уроков не найден (404). Убедись, что content/lessons/manifest.json на месте.');
      throw new Error(`Ошибка загрузки: ${res.status}`);
    }
    manifest = await res.json();
    buildSidebar();
    onChange(updateSidebarMarks);
    await preloadLessonTotals();
    updateSidebarMarks();

    const hash = location.hash.replace('#', '');
    if (hash === 'cheatsheet') await loadCheatSheet();
    else if (manifest.find(m => m.id === hash)) await loadLesson(hash);
    else if (manifest.length) await loadLesson(manifest[0].id);
    else showError('Список уроков пуст', 'manifest.json загружен, но не содержит уроков.');
  } catch (e) {
    setTitle('Ошибка');
    showError('Не удалось загрузить учебник', e.message + ' Проверь, что сервер запущен (./start.sh или python3 -m http.server 8000).');
  }
}

resetBtn.addEventListener('click', () => {
  if (confirm('Сбросить весь прогресс?')) {
    resetProgress();
    updateSidebarMarks();
  }
});

menuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

init();
