/**
 * app.js — точка входа учебника «Linux за 2 месяца».
 * v2: модули, карта курса, онбординг, темы, симулятор v2.
 */
import { renderLesson, renderCheatSheet } from './renderer.js';
import { onChange, completedLessons, resetProgress, isLessonDoneExported, setLessonTotal } from './progress.js';
import { applyTheme, getStoredTheme, renderThemeDots } from './theme.js';

const sidebar = document.getElementById('sidebar');
const sidebarList = document.getElementById('sidebar-list');
const main = document.getElementById('main');
const progressBadge = document.getElementById('progress-badge');
const resetBtn = document.getElementById('reset-progress');
const menuBtn = document.getElementById('menu-toggle');
const loader = document.getElementById('global-loader');
const onboarding = document.getElementById('onboarding');
const onboardingAction = document.getElementById('onboarding-action');
const themeDots = document.getElementById('theme-dots');

let manifest = { modules: [], lessons: [] };
let currentId = null;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setTitle(title) {
  document.title = (title ? title + ' — ' : '') + 'Linux за 2 месяца';
}

function showLoader() {
  main.innerHTML = loader.innerHTML;
}

function showError(heading, text, actionsHtml) {
  main.innerHTML = `<div class="error-box"><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(text)}</p>${actionsHtml || ''}</div>`;
}

function moduleLessons(moduleNum) {
  return manifest.lessons.filter(l => l.module === moduleNum);
}

function moduleProgress(moduleNum) {
  const list = moduleLessons(moduleNum);
  const done = list.filter(l => isLessonDoneExported(l.id)).length;
  return { total: list.length, done };
}

function buildSidebar() {
  sidebarList.innerHTML = '';

  const roadmapLi = document.createElement('li');
  roadmapLi.innerHTML = `<a href="#/roadmap" data-id="roadmap"><span class="lesson-title">🗺️ Карта курса</span></a>`;
  roadmapLi.querySelector('a').addEventListener('click', (e) => {
    e.preventDefault();
    loadRoadmap();
    if (window.innerWidth < 768) sidebar.classList.remove('open');
  });
  sidebarList.appendChild(roadmapLi);

  const cheat = document.createElement('li');
  cheat.innerHTML = `<a href="#cheatsheet" data-id="cheatsheet"><span class="lesson-title">📑 Полный справочник</span></a>`;
  cheat.querySelector('a').addEventListener('click', (e) => {
    e.preventDefault();
    loadCheatSheet();
    if (window.innerWidth < 768) sidebar.classList.remove('open');
  });
  sidebarList.appendChild(cheat);

  manifest.modules.forEach(mod => {
    const group = document.createElement('li');
    group.className = 'module-group';
    group.dataset.module = mod.num;

    const summary = document.createElement('button');
    summary.className = 'module-summary';
    summary.type = 'button';
    summary.innerHTML = `<span class="module-name">Модуль ${mod.num}. ${escapeHtml(mod.title)}</span><span class="module-progress" data-module-progress="${mod.num}">0/0</span>`;
    summary.addEventListener('click', () => group.classList.toggle('collapsed'));
    group.appendChild(summary);

    const ul = document.createElement('ul');
    ul.className = 'module-lessons';
    moduleLessons(mod.num).forEach(item => {
      const li = document.createElement('li');
      li.dataset.id = item.id;
      li.innerHTML = `<a href="#${item.id}" data-id="${item.id}"><span class="lesson-title">${escapeHtml(item.title)}</span></a>`;
      li.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        loadLesson(item.id);
        if (window.innerWidth < 768) sidebar.classList.remove('open');
      });
      ul.appendChild(li);
    });
    group.appendChild(ul);
    sidebarList.appendChild(group);
  });
  updateSidebarMarks();
}

function updateSidebarMarks() {
  manifest.lessons.forEach(item => {
    const li = sidebarList.querySelector(`li[data-id="${item.id}"]`);
    if (!li) return;
    const done = isLessonDoneExported(item.id);
    li.classList.toggle('done', done);
  });
  manifest.modules.forEach(mod => {
    const { done, total } = moduleProgress(mod.num);
    const badge = sidebarList.querySelector(`[data-module-progress="${mod.num}"]`);
    if (badge) badge.textContent = `${done}/${total}`;
  });
  const completed = completedLessons(manifest.lessons.map(m => m.id));
  progressBadge.textContent = `${completed.length}/${manifest.lessons.length || 40}`;
}

function addNextLink(lessonId) {
  const idx = manifest.lessons.findIndex(m => m.id === lessonId);
  const nav = document.createElement('nav');
  nav.className = 'lesson-next';
  if (idx >= 0 && idx < manifest.lessons.length - 1) {
    const next = manifest.lessons[idx + 1];
    nav.innerHTML = `<a href="#${next.id}" class="next-link">Следующий урок →<span>${escapeHtml(next.title)}</span></a>`;
    nav.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      loadLesson(next.id);
    });
  } else {
    nav.innerHTML = `<a href="#/roadmap" class="next-link">Карта курса →<span>Посмотреть прогресс</span></a>`;
    nav.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      loadRoadmap();
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
      if (res.status === 404) {
        throw new Error('Урок пока не готов — контент-дорожки работают над ним. Загляни в Карту курса и начни с доступного урока.');
      }
      throw new Error(`Ошибка загрузки: ${res.status}`);
    }
    const md = await res.text();
    const { root } = renderLesson(md, id);
    main.innerHTML = '';
    main.appendChild(root);
    addNextLink(id);
    history.replaceState(null, '', '#' + id);
    const item = manifest.lessons.find(m => m.id === id);
    setTitle(item ? item.title : id);
    updateActiveSidebar(id);
    window.scrollTo(0, 0);
  } catch (e) {
    setTitle('Ошибка');
    showError(
      'Не удалось загрузить урок',
      e.message,
      `<p><a href="#/roadmap" class="roadmap-link">Перейти к карте курса</a></p>`
    );
    main.querySelector('.roadmap-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      loadRoadmap();
    });
  }
}

function renderRoadmap() {
  currentId = 'roadmap';
  setTitle('Карта курса');
  main.innerHTML = '';

  const root = document.createElement('article');
  root.className = 'roadmap';

  const h1 = document.createElement('h1');
  h1.textContent = 'Карта курса';
  root.appendChild(h1);

  const subtitle = document.createElement('p');
  subtitle.className = 'roadmap-subtitle';
  subtitle.textContent = '2 месяца по 30 минут в день — 8 модулей, 40 уроков, уверенный пользователь Linux.';
  root.appendChild(subtitle);

  const totalDone = completedLessons(manifest.lessons.map(l => l.id)).length;
  const total = manifest.lessons.length || 40;
  const progressWrap = document.createElement('div');
  progressWrap.className = 'roadmap-total';
  progressWrap.innerHTML = `
    <div class="roadmap-total-label">Общий прогресс</div>
    <div class="roadmap-progress-bar"><span style="width:${Math.round((totalDone / total) * 100)}%"></span></div>
    <div class="roadmap-total-count">${totalDone}/${total} уроков</div>
  `;
  root.appendChild(progressWrap);

  const grid = document.createElement('div');
  grid.className = 'roadmap-grid';

  manifest.modules.forEach(mod => {
    const lessons = moduleLessons(mod.num);
    const { done, total: modTotal } = moduleProgress(mod.num);
    const card = document.createElement('section');
    card.className = 'roadmap-card';
    card.innerHTML = `
      <div class="roadmap-card-header">
        <span class="roadmap-module-num">Модуль ${mod.num}</span>
        <h2>${escapeHtml(mod.title)}</h2>
      </div>
      <p class="roadmap-goal">${escapeHtml(mod.goal)}</p>
      <div class="roadmap-progress-bar"><span style="width:${Math.round((done / modTotal) * 100)}%"></span></div>
      <div class="roadmap-card-count">${done}/${modTotal}</div>
      <ul class="roadmap-lessons"></ul>
    `;
    const list = card.querySelector('.roadmap-lessons');
    lessons.forEach(l => {
      const doneClass = isLessonDoneExported(l.id) ? 'done' : '';
      const li = document.createElement('li');
      li.className = doneClass;
      li.innerHTML = `<a href="#${l.id}" data-id="${l.id}">${escapeHtml(l.title)}</a>`;
      li.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        loadLesson(l.id);
      });
      list.appendChild(li);
    });
    grid.appendChild(card);
  });

  root.appendChild(grid);
  main.appendChild(root);
  history.replaceState(null, '', '#/roadmap');
  updateActiveSidebar('roadmap');
  window.scrollTo(0, 0);
}

function loadRoadmap() {
  renderRoadmap();
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
  await Promise.all(manifest.lessons.map(async (item) => {
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

function maybeShowOnboarding() {
  const flag = 'linux-tutorial-onboarded';
  try {
    if (localStorage.getItem(flag)) return;
  } catch (e) {
    return;
  }
  if (!onboarding) return;
  onboarding.hidden = false;
  onboarding.classList.add('visible');
}

function hideOnboarding() {
  if (!onboarding) return;
  onboarding.hidden = true;
  onboarding.classList.remove('visible');
  try {
    localStorage.setItem('linux-tutorial-onboarded', '1');
  } catch (e) {
    // ignore
  }
}

async function init() {
  showLoader();
  applyTheme(getStoredTheme());
  renderThemeDots(themeDots);

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
    if (hash === '/roadmap' || hash === 'roadmap') {
      loadRoadmap();
    } else if (hash === 'cheatsheet') {
      await loadCheatSheet();
    } else if (manifest.lessons.find(m => m.id === hash)) {
      await loadLesson(hash);
    } else {
      loadRoadmap();
    }

    maybeShowOnboarding();
  } catch (e) {
    setTitle('Ошибка');
    showError('Не удалось загрузить учебник', e.message + ' Проверь, что сервер запущен (./start.sh или python3 -m http.server 8000).');
  }
}

resetBtn.addEventListener('click', () => {
  if (confirm('Сбросить весь прогресс?')) {
    resetProgress();
    updateSidebarMarks();
    if (currentId === 'roadmap') loadRoadmap();
  }
});

menuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
});

if (onboardingAction) {
  onboardingAction.addEventListener('click', () => {
    hideOnboarding();
    const first = manifest.lessons[0];
    if (first) loadLesson(first.id);
  });
}

init();
