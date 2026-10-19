/**
 * app.js — точка входа учебника «Linux за 2 месяца».
 * v3: весь сайт — терминал kitty. Навигация = powerline-таббар снизу.
 */
import { renderLesson, renderCheatSheet } from './renderer.js';
import { resetTerminalAutoFocus } from './terminal.js';
import { onChange, completedLessons, resetProgress, isLessonDoneExported, setLessonTotal } from './progress.js';
import { applyTheme, getStoredTheme, renderThemeDots } from './theme.js';

const main = document.getElementById('main');
const tabBarInner = document.getElementById('tab-bar-inner');
const sidebar = document.getElementById('sidebar');
const sidebarList = document.getElementById('sidebar-list');
const resetBtn = document.getElementById('reset-progress');
const menuBtn = document.getElementById('menu-toggle');
const loader = document.getElementById('global-loader');
const onboarding = document.getElementById('onboarding');
const onboardingScreen = onboarding?.querySelector('.onboarding-screen');
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

/* ---------- powerline-таббар снизу ---------- */
function buildTabBar() {
  tabBarInner.innerHTML = '';

  // Карта курса
  const roadmapTab = makeTab('roadmap', '🗺 Карта', () => loadRoadmap());
  tabBarInner.appendChild(roadmapTab);

  // Модули как вкладки
  manifest.modules.forEach(mod => {
    const label = `M${mod.num}`;
    const tab = makeTab(`module-${mod.num}`, label, () => toggleModuleTab(mod.num));
    tab.title = `${mod.title}: ${mod.goal}`;
    tabBarInner.appendChild(tab);
  });

  // Справочник
  const cheatTab = makeTab('cheatsheet', '📑 Справочник', () => loadCheatSheet());
  tabBarInner.appendChild(cheatTab);

  // Общий прогресс
  const progress = document.createElement('span');
  progress.className = 'tab-progress';
  progress.id = 'tab-progress';
  tabBarInner.appendChild(progress);

  buildSidebar();
  updateMarks();
}

function makeTab(id, label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'tab';
  btn.dataset.id = id;
  btn.textContent = label;
  btn.type = 'button';
  btn.addEventListener('click', () => {
    onClick();
    if (window.innerWidth < 768) sidebar.classList.remove('open');
  });
  return btn;
}

function toggleModuleTab(moduleNum) {
  // На десктопе открываем первый непройденный урок модуля, иначе первый
  const lessons = moduleLessons(moduleNum);
  const next = lessons.find(l => !isLessonDoneExported(l.id)) || lessons[0];
  if (next) loadLesson(next.id);
}

/* ---------- мобильный сайдбар ---------- */
function buildSidebar() {
  sidebarList.innerHTML = '';

  const roadmapLi = document.createElement('li');
  roadmapLi.innerHTML = `<a href="#/roadmap" data-id="roadmap"><span>🗺 Карта курса</span></a>`;
  roadmapLi.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); loadRoadmap(); sidebar.classList.remove('open'); });
  sidebarList.appendChild(roadmapLi);

  const cheatLi = document.createElement('li');
  cheatLi.innerHTML = `<a href="#cheatsheet" data-id="cheatsheet"><span>📑 Полный справочник</span></a>`;
  cheatLi.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); loadCheatSheet(); sidebar.classList.remove('open'); });
  sidebarList.appendChild(cheatLi);

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
      li.innerHTML = `<a href="#${item.id}" data-id="${item.id}"><span>${escapeHtml(item.title)}</span></a>`;
      li.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); loadLesson(item.id); sidebar.classList.remove('open'); });
      ul.appendChild(li);
    });
    group.appendChild(ul);
    sidebarList.appendChild(group);
  });
}

function updateMarks() {
  manifest.lessons.forEach(item => {
    const li = sidebarList.querySelector(`li[data-id="${item.id}"]`);
    if (li) li.classList.toggle('done', isLessonDoneExported(item.id));

    const moduleNum = item.module;
    const tab = tabBarInner.querySelector(`.tab[data-id="module-${moduleNum}"]`);
    if (tab) {
      const { done, total } = moduleProgress(moduleNum);
      tab.classList.toggle('done', done === total && total > 0);
    }
  });
  manifest.modules.forEach(mod => {
    const { done, total } = moduleProgress(mod.num);
    const badge = sidebarList.querySelector(`[data-module-progress="${mod.num}"]`);
    if (badge) badge.textContent = `${done}/${total}`;
  });
  const completed = completedLessons(manifest.lessons.map(m => m.id)).length;
  const total = manifest.lessons.length || 40;
  const progress = document.getElementById('tab-progress');
  if (progress) progress.textContent = `[${bar(completed, total)}] ${completed}/${total}`;
}

function bar(done, total) {
  const w = 10;
  const filled = total ? Math.round((done / total) * w) : 0;
  return '#'.repeat(filled) + '-'.repeat(w - filled);
}

function addNextLink(lessonId) {
  const idx = manifest.lessons.findIndex(m => m.id === lessonId);
  const nav = document.createElement('nav');
  nav.className = 'lesson-next';
  if (idx >= 0 && idx < manifest.lessons.length - 1) {
    const next = manifest.lessons[idx + 1];
    nav.innerHTML = `<a href="#${next.id}" class="next-link">cd ${escapeHtml(next.id)}<span># Следующий урок: ${escapeHtml(next.title)}</span></a>`;
    nav.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); loadLesson(next.id); });
  } else {
    nav.innerHTML = `<a href="#/roadmap" class="next-link">tree --progress /курс<span># Посмотреть прогресс</span></a>`;
    nav.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); loadRoadmap(); });
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
    resetTerminalAutoFocus();
    const { root } = renderLesson(md, id);
    main.innerHTML = '';
    main.appendChild(root);
    addNextLink(id);
    history.replaceState(null, '', '#' + id);
    const item = manifest.lessons.find(m => m.id === id);
    setTitle(item ? item.title : id);
    updateActiveTab(id);
    window.scrollTo(0, 0);
  } catch (e) {
    setTitle('Ошибка');
    showError('Не удалось загрузить урок', e.message, `<p><a href="#/roadmap" class="roadmap-link">Перейти к карте курса</a></p>`);
    main.querySelector('.roadmap-link')?.addEventListener('click', (e) => { e.preventDefault(); loadRoadmap(); });
  }
}

function updateActiveTab(id) {
  const item = manifest.lessons.find(m => m.id === id);
  const moduleNum = item ? item.module : null;

  tabBarInner.querySelectorAll('.tab').forEach(btn => {
    const bid = btn.dataset.id;
    let active = false;
    if (id === 'roadmap' && bid === 'roadmap') active = true;
    else if (id === 'cheatsheet' && bid === 'cheatsheet') active = true;
    else if (moduleNum && bid === `module-${moduleNum}`) active = true;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });

  sidebarList.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.dataset.id === id));
}

/* ---------- roadmap как вывод tree ---------- */
function renderRoadmap() {
  currentId = 'roadmap';
  setTitle('Карта курса');
  main.innerHTML = '';

  const root = document.createElement('article');
  root.className = 'roadmap';

  const h1 = document.createElement('h1');
  root.appendChild(h1);

  const subtitle = document.createElement('p');
  subtitle.className = 'roadmap-subtitle';
  subtitle.textContent = '2 месяца по 30 минут в день — 8 модулей, 40 уроков.';
  root.appendChild(subtitle);

  const totalDone = completedLessons(manifest.lessons.map(l => l.id)).length;
  const total = manifest.lessons.length || 40;

  const totalBar = document.createElement('div');
  totalBar.className = 'roadmap-total';
  totalBar.innerHTML = `<span class="roadmap-total-bar">[${bar(totalDone, total)}] ${totalDone}/${total} уроков</span>`;
  root.appendChild(totalBar);

  const tree = document.createElement('pre');
  tree.className = 'roadmap-tree';
  tree.textContent = buildTreeText(totalDone, total);
  root.appendChild(tree);

  // Клики по урокам в дереве
  tree.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-id]');
    if (!a) return;
    e.preventDefault();
    loadLesson(a.dataset.id);
  });

  main.appendChild(root);
  history.replaceState(null, '', '#/roadmap');
  updateActiveTab('roadmap');
  window.scrollTo(0, 0);
}

function buildTreeText(totalDone, total) {
  const lines = [];
  lines.push('/курс/');

  manifest.modules.forEach((mod, modIdx) => {
    const lessons = moduleLessons(mod.num);
    const { done, total: modTotal } = moduleProgress(mod.num);
    const isLastModule = modIdx === manifest.modules.length - 1;
    const modPrefix = isLastModule ? '└── ' : '├── ';
    const childPrefix = isLastModule ? '    ' : '│   ';
    const doneMark = done === modTotal && modTotal > 0 ? ' ✓' : '';
    lines.push(`${modPrefix}M${mod.num}_${escapeTree(mod.title)}${doneMark}`);

    lessons.forEach((l, lIdx) => {
      const isLastLesson = lIdx === lessons.length - 1;
      const lessonPrefix = isLastLesson ? '└── ' : '├── ';
      const lessonDone = isLessonDoneExported(l.id) ? ' ✓' : '';
      lines.push(`${childPrefix}${lessonPrefix}${l.id}${lessonDone}`);
    });
  });

  lines.push('');
  lines.push(`# Прогресс: [${bar(totalDone, total)}] ${totalDone}/${total}`);
  return lines.join('\n');
}

function escapeTree(text) {
  return text.replace(/\s+/g, '_');
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
    updateActiveTab('cheatsheet');
    window.scrollTo(0, 0);
  } catch (e) {
    setTitle('Ошибка');
    showError('Не удалось загрузить справочник', e.message);
  }
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
    } catch (e) {}
  }));
}

/* ---------- onboarding как login ---------- */
function maybeShowOnboarding() {
  const flag = 'linux-tutorial-onboarded';
  try {
    if (localStorage.getItem(flag)) return;
  } catch (e) { return; }
  if (!onboarding) return;
  onboarding.hidden = false;
  onboardingAction.hidden = true;
  runLoginSequence();
}

function runLoginSequence() {
  const lines = [
    'login: user',
    'password:',
    '',
    'Welcome to Linux Tutorial 2.0 (tty1)',
    '',
    'Ты в песочнице. Сломать ничего нельзя.',
    'Это терминал-имитатор: пробуй команды, ошибайся и учись.',
    'Курс рассчитан на 2 месяца по 30 минут в день.',
    ''
  ];
  let i = 0;
  onboardingScreen.textContent = '';

  function next() {
    if (i >= lines.length) {
      onboardingAction.hidden = false;
      onboardingAction.focus();
      return;
    }
    onboardingScreen.textContent += lines[i] + '\n';
    i++;
    setTimeout(next, 220);
  }
  next();
}

function hideOnboarding() {
  if (!onboarding) return;
  onboarding.hidden = true;
  try {
    localStorage.setItem('linux-tutorial-onboarded', '1');
  } catch (e) {}
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
    buildTabBar();
    onChange(updateMarks);
    await preloadLessonTotals();
    updateMarks();

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
    updateMarks();
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
