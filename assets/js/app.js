import './simulator.js';
import { createTerminalUI } from './terminal-ui.js';
import { createLessonEngine } from './lesson-engine.js';
import { createChallengeEngine } from './challenge-engine.js';
import { challenges } from '../../content/challenges/index.js';
import { applyTheme, getStoredTheme, isValidTheme, listThemeLabels } from './theme.js';
import {
  resetProgress, isLessonDone, getChallengeProgress, getLocation, setLocation,
  getLegacyModule, setLegacyModule
} from './progress.js';

const Simulator = globalThis.TerminalSimulator;
const ONBOARDED_KEY = 'linux-tutorial-onboarded';
const onboarding = document.getElementById('onboarding');
const terminal = document.getElementById('terminal');
const nav = document.getElementById('course-nav');
const mapToggle = document.getElementById('map-toggle');
const activeTask = document.getElementById('active-task');
const activeTaskText = document.getElementById('active-task-text');
const activeHint = document.getElementById('active-hint');
const activeCheck = document.getElementById('active-check');
const activeRetry = document.getElementById('active-retry');
const activeNext = document.getElementById('active-next');
const terminalMode = document.getElementById('terminal-mode');
const terminalTitle = document.getElementById('terminal-title');
const terminalStatus = document.getElementById('terminal-status');
const headerProgress = document.getElementById('header-progress');

let manifest = { modules: [], lessons: [] };
let view = { type: 'free' };
let freeSession = Simulator.createSession({ tree: { documents: {}, projects: {} } });
let loading = null;
let ready = false;
let resetPending = false;
const expandedModules = new Set();

applyTheme(getStoredTheme());

const ui = createTerminalUI({
  onSubmit: handleCommand,
  onClear: clear,
  getAutocompleteSession: () => view.type === 'challenge'
    ? challengeEngine.session() : engine.getCurrentSession() || (engine.currentState() === 'quiz' ? null : freeSession)
});

const engine = createLessonEngine({
  ui,
  onDone: () => refresh(),
  onActivity: refresh
});

const challengeEngine = createChallengeEngine({
  ui,
  onChange: refresh,
  onPass: () => ui.appendComment(view.module < challenges.length
    ? 'Следующий модуль открыт. Введи «дальше».'
    : 'Это последнее испытание курса. Все пройденные испытания видны в карте.')
});

function lessonIndex(lessonId) {
  return manifest.lessons.findIndex(lesson => lesson.id === lessonId);
}

function moduleIndex(module) {
  return manifest.lessons.findIndex(lesson => lesson.module === module);
}

function currentModule() {
  if (view.type === 'challenge') return view.module;
  if (view.type === 'lesson') return manifest.lessons[view.index].module;
  return 1;
}

function isPassed(module) {
  return getChallengeProgress(challenges[module - 1].id).passed;
}

function prerequisite(module) {
  for (let previous = Math.max(1, getLegacyModule()); previous < module; previous++) {
    if (!isPassed(previous)) return previous;
  }
  return null;
}

function titleOfView() {
  if (view.type === 'lesson') return manifest.lessons[view.index].title;
  if (view.type === 'challenge') return challenges[view.module - 1].title;
  return 'Свободная песочница';
}

function refresh() {
  const lessonsDone = manifest.lessons.filter(lesson => isLessonDone(lesson.id)).length;
  const challengesDone = challenges.filter(challenge => getChallengeProgress(challenge.id).passed).length;
  headerProgress.textContent = `${lessonsDone}/${manifest.lessons.length} уроков · ${challengesDone}/${challenges.length} испытаний`;
  terminalTitle.textContent = titleOfView();
  terminalMode.textContent = { lesson: 'Bash', challenge: 'Испытание', free: 'Bash' }[view.type];
  terminal.dataset.mode = view.type;
  const activity = engine.activity();
  const challengeState = challengeEngine.state();
  const lessonDone = view.type === 'lesson' && engine.currentState() === 'idle';
  activeTask.hidden = !activity && !challengeState && !lessonDone;
  activeRetry.hidden = challengeState?.phase !== 'failed';
  activeNext.hidden = challengeState?.phase !== 'passed' && !lessonDone;
  activeCheck.hidden = challengeState?.phase !== 'playing';
  activeHint.hidden = challengeState ? challengeState.phase !== 'playing' : engine.currentState() !== 'terminal';
  activeTaskText.textContent = challengeState
    ? (challengeState.phase === 'playing'
      ? `Попытка ${challengeState.number} · подсказок: ${challengeState.hintsLeft}`
      : challengeState.phase === 'passed' ? 'Испытание пройдено' : 'Попытка завершена · заново')
    : activity || (lessonDone ? 'Урок завершён' : '');
  terminalStatus.textContent = view.type === 'lesson'
    ? `Урок ${view.index + 1}` : view.type === 'challenge' ? `Модуль ${view.module}` : '';
  if (!nav.hidden) renderCourseNav();
}

function renderCourseNav() {
  const focused = nav.contains(document.activeElement) ? document.activeElement?.dataset.route : null;
  const content = document.createDocumentFragment();
  for (const mod of manifest.modules) {
    const details = document.createElement('details');
    details.open = expandedModules.has(mod.num);
    details.addEventListener('toggle', () => {
      if (details.open) expandedModules.add(mod.num);
      else expandedModules.delete(mod.num);
    });
    const summary = document.createElement('summary');
    summary.textContent = `${String(mod.num).padStart(2, '0')}  ${mod.title}`;
    details.append(summary);
    const lessons = manifest.lessons.filter(lesson => lesson.module === mod.num);
    for (const lesson of lessons) {
      const index = lessonIndex(lesson.id);
      const label = `${String(index + 1).padStart(2, '0')}  ${lesson.title}`;
      const button = navButton(label, `урок ${index + 1}`, isLessonDone(lesson.id), view.type === 'lesson' && view.index === index);
      details.append(button);
    }
    const def = challenges[mod.num - 1];
    const gate = navButton(def.title, `испытание ${mod.num}`, isPassed(mod.num), view.type === 'challenge' && view.module === mod.num);
    gate.classList.add('nav-challenge');
    details.append(gate);
    content.append(details);
  }
  nav.replaceChildren(content);
  if (focused) Array.from(nav.querySelectorAll('button')).find(button => button.dataset.route === focused)?.focus();
}

function navButton(label, route, done, current) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.route = route;
  button.textContent = `${done ? '✓ ' : ''}${label}`;
  if (current) button.setAttribute('aria-current', 'page');
  button.addEventListener('click', () => {
    if (matchMedia('(max-width: 760px)').matches) showMap(false);
    handleCommand(route);
  });
  return button;
}

function showMap(show) {
  nav.hidden = !show;
  mapToggle.setAttribute('aria-expanded', String(show));
  if (show) {
    expandedModules.add(currentModule());
    renderCourseNav();
    nav.querySelector('details[open] summary')?.focus();
  }
}

function showTerminal() {
  onboarding.hidden = true;
  terminal.hidden = false;
  try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch {
    // Optional storage.
  }
}

function setAddress(fragment) {
  history.replaceState(null, '', location.pathname + location.search + fragment);
}

function saveView(locationData, fragment) {
  setLocation(locationData);
  setAddress(fragment);
  document.title = `${titleOfView()} — Linux за 2 месяца`;
}

function cancelLoad() {
  loading?.abort();
  loading = null;
  ui.setEnabled(true);
}

async function loadLessonByIndex(index, { allowResume = false } = {}) {
  const lesson = manifest.lessons[index];
  if (!lesson) { ui.appendError('Такого урока нет.'); return; }
  const gate = allowResume ? null : prerequisite(lesson.module);
  if (gate) {
    openChallenge(gate, { allowResume: true });
    ui.appendComment(`Чтобы открыть модуль ${lesson.module}, сначала пройди это испытание.`);
    return;
  }
  cancelLoad();
  const request = new AbortController();
  loading = request;
  ui.setEnabled(false);
  showTerminal();
  terminalStatus.textContent = 'Загрузка…';
  try {
    const response = await fetch(`content/lessons/${lesson.id}.md`, { signal: request.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    if (loading !== request) return;
    challengeEngine.stop();
    view = { type: 'lesson', index };
    expandedModules.add(lesson.module);
    ui.clearScrollback();
    ui.setScrollTop(0);
    ui.setAutoScroll(false);
    ui.setPrompt('/home/user');
    engine.start(lesson.id, markdown);
    ui.setScrollTop(0);
    ui.setAutoScroll(true);
    saveView({ type: 'lesson', id: lesson.id }, `#урок-${index + 1}`);
  } catch (err) {
    if (loading === request) {
      refresh();
      ui.appendError(`Не удалось загрузить урок ${index + 1}. Повтори «урок ${index + 1}» (${err.message}).`);
    }
  } finally {
    if (loading === request) {
      loading = null;
      ui.setAutoScroll(true);
      ui.setEnabled(true);
      ui.focus();
    }
  }
}

function openChallenge(module, { allowResume = false } = {}) {
  if (!challenges[module - 1]) { ui.appendError('Такого испытания нет.'); return; }
  const gate = allowResume ? null : prerequisite(module);
  if (gate) {
    openChallenge(gate, { allowResume: true });
    ui.appendComment(`Чтобы открыть испытание ${module}, сначала пройди это испытание.`);
    return;
  }
  cancelLoad();
  showTerminal();
  engine.reset();
  view = { type: 'challenge', module };
  expandedModules.add(module);
  ui.clearScrollback();
  challengeEngine.start(challenges[module - 1]);
  saveView({ type: 'challenge', id: challenges[module - 1].id }, `#испытание-${module}`);
  ui.focus();
}

function openFree() {
  cancelLoad();
  showTerminal();
  engine.reset();
  challengeEngine.stop();
  view = { type: 'free' };
  ui.clearScrollback();
  ui.setPrompt(freeSession.cwd);
  ui.appendLine('Песочница Bash', 'challenge-title');
  ui.appendLine('Попробуй pwd и ls. Чтобы вернуться в курс, введи «продолжить».');
  setAddress('');
  document.title = 'Песочница — Linux за 2 месяца';
  refresh();
  ui.focus();
}

function resume() {
  const saved = getLocation();
  if (saved?.type === 'challenge') {
    const index = challenges.findIndex(challenge => challenge.id === saved.id);
    if (index >= 0) { openChallenge(index + 1, { allowResume: true }); return; }
  }
  const index = saved?.id ? lessonIndex(saved.id) : saved?.legacyIndex;
  if (Number.isInteger(index) && manifest.lessons[index]) {
    if (saved.legacyIndex !== undefined) setLegacyModule(manifest.lessons[index].module);
    return loadLessonByIndex(index, { allowResume: true });
  }
  return loadLessonByIndex(0);
}

function moveNext() {
  if (view.type === 'free') { resume(); return; }
  if (view.type === 'challenge') {
    if (challengeEngine.state().phase !== 'passed' && !isPassed(view.module)) {
      ui.appendComment('Заверши испытание и введи «проверить», чтобы открыть следующий модуль.');
      return;
    }
    if (view.module === challenges.length) {
      ui.appendSuccess('Последнее испытание пройдено. Курс завершён.');
      return;
    }
    loadLessonByIndex(moduleIndex(view.module + 1));
    return;
  }
  const next = manifest.lessons[view.index + 1];
  if (next?.module === currentModule()) loadLessonByIndex(view.index + 1);
  else openChallenge(currentModule());
}

function moveBack() {
  if (view.type === 'challenge') {
    const index = manifest.lessons.findLastIndex(lesson => lesson.module === view.module);
    loadLessonByIndex(index, { allowResume: true });
  } else if (view.type === 'lesson' && view.index > 0) {
    loadLessonByIndex(view.index - 1, { allowResume: true });
  } else ui.appendComment('Ты в начале курса.');
}

function printHelp() {
  ui.appendLine('Навигация по курсу', 'challenge-title');
  ui.appendLines([
    'курс                         карта модулей',
    'урок N · дальше · назад       навигация',
    'испытание N                  проверка после модуля',
    'подсказка · задание           помощь с текущей задачей',
    'проверить · заново            проверка и повтор попытки',
    'песочница · продолжить        свободная практика и возврат',
    'справочник [запрос]           поиск по шпаргалке',
    'тема список · тема ИМЯ        оформление',
    'clear · сброс                очистить вывод или сбросить прогресс'
  ].join('\n'));
}

async function printReference(query) {
  const requestView = view;
  try {
    const response = await fetch('content/cheatsheet.md');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    if (view !== requestView) return;
    if (!query) {
      ui.appendLine('Справочник по Linux', 'challenge-title');
      ui.appendComment('Для поиска введи «справочник grep» или «справочник права».');
      return;
    }
    const matches = markdown.split('\n').filter(line => line.toLowerCase().includes(query.toLowerCase()));
    ui.appendLines(matches.slice(0, 20).join('\n') || 'Совпадений нет.');
  } catch (err) {
    if (view === requestView) ui.appendError(`Не удалось открыть справочник (${err.message}).`);
  }
}

function clear() {
  ui.clearScrollback();
  if (view.type === 'challenge') challengeEngine.describe();
  else engine.restoreActive({ clearOutput: true });
}

function handleCommand(raw) {
  if (!ready) return;
  const line = raw.trim();
  if (!line) return;
  const [word, ...args] = line.split(/\s+/);
  const command = word.toLowerCase();
  const argument = args.join(' ');
  const globalCommand = {
    next: 'дальше', back: 'назад', lesson: 'урок', map: 'курс', course: 'курс',
    challenge: 'испытание', practice: 'песочница', theme: 'тема', reset: 'сброс', resume: 'продолжить'
  };
  const name = Object.hasOwn(globalCommand, command) ? globalCommand[command] : command;
  if (name !== 'сброс') resetPending = false;
  if (name === 'курс') { showMap(nav.hidden); return; }
  if (name === 'помощь' || (name === 'help' && view.type === 'free')) {
    if (!onboarding.hidden) openFree();
    printHelp();
  }
  else if (name === 'дальше') moveNext();
  else if (name === 'назад') moveBack();
  else if (name === 'урок' && /^\d+$/.test(argument)) loadLessonByIndex(Number(argument) - 1);
  else if (name === 'испытание') {
    if (!argument || /^\d+$/.test(argument)) openChallenge(argument ? Number(argument) : currentModule());
    else ui.appendError('Введи «испытание N», где N — номер модуля.');
  } else if (name === 'песочница') openFree();
  else if (name === 'продолжить') resume();
  else if (name === 'справочник') printReference(argument);
  else if (name === 'clear' || name === 'очистить') clear();
  else if (name === 'тема') {
    if (!argument || argument === 'список') ui.appendLines(listThemeLabels().join('\n'));
    else if (isValidTheme(argument.toLowerCase())) ui.appendSuccess(`Тема: ${applyTheme(argument.toLowerCase()).label}`);
    else ui.appendError('Неизвестная тема. Введи «тема список».');
  } else if (name === 'сброс') {
    if (resetPending && ['подтвердить', 'confirm'].includes(argument)) {
      resetProgress();
      resetPending = false;
      freeSession = Simulator.createSession({ tree: { documents: {}, projects: {} } });
      openFree();
      ui.appendSuccess('Прогресс сброшен. Введи «урок 1», чтобы начать.');
    } else {
      resetPending = true;
      ui.appendLine('Чтобы стереть прогресс и попытки, введи «сброс подтвердить».', 'warn');
    }
  } else if (view.type === 'challenge') challengeEngine.handleInput(line);
  else if (name === 'задание' && engine.activity()) ui.appendLine(engine.activity(), 'comment');
  else if (engine.currentState() !== 'idle') engine.handleInput(line);
  else {
    ui.setPrompt(freeSession.cwd);
    ui.appendCommandLine(line);
    const result = Simulator.exec(freeSession, line);
    if (result.stdout) ui.appendLines(result.stdout);
    if (result.stderr) ui.appendLines(result.stderr, 'error');
    ui.setPrompt(freeSession.cwd);
  }
  if (!loading) ui.focus();
}

function openAddress() {
  let fragment;
  try { fragment = decodeURIComponent(location.hash.slice(1)); } catch { return false; }
  const match = /^(урок|lesson|испытание|challenge)-(\d+)$/.exec(fragment);
  if (!match) return false;
  const number = Number(match[2]);
  if (['урок', 'lesson'].includes(match[1]) && manifest.lessons[number - 1]) {
    loadLessonByIndex(number - 1);
    return true;
  }
  if (['испытание', 'challenge'].includes(match[1]) && challenges[number - 1]) {
    openChallenge(number);
    return true;
  }
  return false;
}

async function init() {
  try {
    const response = await fetch('content/lessons/manifest.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
    ready = true;
    refresh();
    if (openAddress()) return;
    if (getLocation()) { await resume(); return; }
    let onboarded;
    try { onboarded = localStorage.getItem(ONBOARDED_KEY); } catch { onboarded = false; }
    if (onboarded) openFree();
    else {
      terminal.hidden = true;
      onboarding.hidden = false;
    }
  } catch (err) {
    terminal.hidden = false;
    ui.appendError(`Курс не загрузился (${err.message}). Обнови страницу.`);
  }
}

mapToggle.addEventListener('click', () => { if (ready) showMap(nav.hidden); });
document.getElementById('onboarding-action').addEventListener('click', () => loadLessonByIndex(0));
document.getElementById('onboarding-practice').addEventListener('click', openFree);
document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => handleCommand(button.dataset.command)));
window.addEventListener('hashchange', () => { if (ready) openAddress(); });
init();

export { handleCommand, engine, ui, loadLessonByIndex };
