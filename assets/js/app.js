/**
 * app.js — точка входа v4: один полноэкранный терминал.
 */
import './simulator.js';
import { createTerminalUI } from './terminal-ui.js';
import { createLessonEngine } from './lesson-engine.js';
import {
  applyTheme, getStoredTheme, isValidTheme, listThemeLabels
} from './theme.js';
import {
  onChange, resetProgress, isLessonDoneExported,
  setLastLessonIndex, getLastLessonIndex,
  setCurrentLesson, getCurrentLesson, setScrollPosition, getScrollPosition
} from './progress.js';

const Simulator = globalThis.TerminalSimulator;
const ONBOARDED_KEY = 'linux-tutorial-onboarded';

const terminal = document.getElementById('terminal');
const onboarding = document.getElementById('onboarding');
const onboardingScreen = document.getElementById('onboarding-screen');
const onboardingAction = document.getElementById('onboarding-action');

let manifest = { modules: [], lessons: [] };
let currentLessonIndex = null;
let freeSession = Simulator.createSession({});
let userShell = 'bash';
let pendingReset = false;

applyTheme(getStoredTheme());

const ui = createTerminalUI({
  onSubmit: handleCommand,
  getAutocompleteSession: () => {
    if (engine.currentState() === 'terminal') return engine.getCurrentSession();
    return freeSession;
  }
});

const engine = createLessonEngine({
  ui,
  getUserShell: () => userShell,
  onDone: (lessonId) => {
    // Урок завершён — ничего дополнительного, движок уже напечатал.
  }
});

onChange(() => {
  // Прогресс изменился извне — можно обновить что-то, если нужно.
});

// Сохраняем позицию прокрутки с небольшим дебаунсом.
let scrollSaveTimer = null;
ui.onScroll((y) => {
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => setScrollPosition(y), 200);
});
window.addEventListener('beforeunload', () => {
  setScrollPosition(ui.getScrollTop());
});

function setTitle(title) {
  document.title = (title ? title + ' — ' : '') + 'Linux за 2 месяца';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function lessonNumberById(id) {
  const idx = manifest.lessons.findIndex(l => l.id === id);
  return idx >= 0 ? idx + 1 : null;
}

function lessonByNumber(num) {
  const idx = (parseInt(num, 10) || 0) - 1;
  return manifest.lessons[idx];
}

function bar(done, total) {
  const w = 10;
  const filled = total ? Math.round((done / total) * w) : 0;
  return '#'.repeat(filled) + '-'.repeat(w - filled);
}

function moduleLessons(moduleNum) {
  return manifest.lessons.filter(l => l.module === moduleNum);
}

function print(text, className = 'output') {
  ui.appendLine(text, className);
}

function printLines(text, className = 'output') {
  ui.appendLines(text, className);
}

function printCourseMap() {
  const totalDone = manifest.lessons.filter(l => isLessonDoneExported(l.id)).length;
  const total = manifest.lessons.length || 40;
  print('/курс/');
  manifest.modules.forEach((mod, modIdx) => {
    const lessons = moduleLessons(mod.num);
    const done = lessons.filter(l => isLessonDoneExported(l.id)).length;
    const isLastModule = modIdx === manifest.modules.length - 1;
    const modPrefix = isLastModule ? '└── ' : '├── ';
    const childPrefix = isLastModule ? '    ' : '│   ';
    const doneMark = done === lessons.length && lessons.length > 0 ? ' ✓' : '';
    print(`${modPrefix}M${mod.num}_${mod.title.replace(/\s+/g, '_')}${doneMark}`);
    lessons.forEach((l, lIdx) => {
      const isLastLesson = lIdx === lessons.length - 1;
      const lessonPrefix = isLastLesson ? '└── ' : '├── ';
      const lessonDone = isLessonDoneExported(l.id) ? ' ✓' : '';
      print(`${childPrefix}${lessonPrefix}${l.id}${lessonDone}`);
    });
  });
  print('');
  print(`# Прогресс: [${bar(totalDone, total)}] ${totalDone}/${total}`);
}

function printHelp() {
  print('Linux — это терминал. Здесь ты управляешь всем сам: быстро, минималистично, настраивается под тебя — надо только чуть вкатиться.');
  print('');
  print('Доступные команды:');
  print('  помощь, help          — этот список');
  print('  курс                  — карта курса с прогрессом');
  print('  урок <номер>          — открыть урок (1–' + (manifest.lessons.length || 40) + ')');
  print('  дальше                — следующий урок');
  print('  назад                 — предыдущий урок');
  print('  тема список           — список тем');
  print('  тема <имя>            — сменить тему');
  print('  shell bash|fish|zsh   — переключить оболочку');
  print('  сброс                 — сбросить прогресс');
  print('  clear, очистить       — очистить терминал');
}

function applyShell(shell) {
  if (!['bash', 'fish', 'zsh'].includes(shell)) {
    print(`shell: неизвестный режим «${shell}». Доступны: bash, fish, zsh.`, 'error');
    return;
  }
  userShell = shell;
  freeSession.shell = shell;
  engine.setTaskShell(shell);
  if (engine.currentState() !== 'terminal') {
    ui.setPrompt(shell, freeSession.cwd);
  }
  print(`Режим оболочки: ${shell}`);
}

function applyThemeByName(name) {
  if (name === 'список') {
    print('Доступные темы:');
    listThemeLabels().forEach(l => print('  ' + l));
    return;
  }
  if (!isValidTheme(name)) {
    print(`тема: неизвестная тема «${name}». Набери «тема список».`, 'error');
    return;
  }
  const theme = applyTheme(name);
  print(`Тема установлена: ${theme.label}`);
}

function runFreeShellCommand(raw) {
  const line = raw.trim();
  if (!line) return;
  ui.appendCommandLine(line);
  const result = Simulator.exec(freeSession, line);
  if (result.clear) {
    ui.clearScrollback();
  } else if (result.stdout) {
    if (result.exit !== 0 && /command not found/.test(String(result.stdout || ''))) {
      print(`bash: ${line.split(/\s+/)[0]}: команда не найдена`, 'error');
      print('набери помощь', 'comment');
    } else {
      printLines(result.stdout, 'output');
    }
  }
  ui.setPrompt(freeSession.shell, freeSession.cwd);
}

async function loadLessonByIndex(idx) {
  if (idx < 0 || idx >= manifest.lessons.length) {
    print('Такого урока нет.', 'error');
    return;
  }
  currentLessonIndex = idx;
  setLastLessonIndex(idx);
  setCurrentLesson(idx);
  const lesson = manifest.lessons[idx];
  setTitle(lesson.title);

  if (ui.appendLine) {
    // Новый урок всегда начинается сверху экрана.
    ui.setAutoScroll(false);
    const anchor = ui.appendAnchor();
    const hasContent = terminal.querySelector('.scrollback').childElementCount > 1;
    if (hasContent) print('────────────────────────────', 'comment');
    ui.appendCommandLine(`cat уроки/${lesson.id}.md`);

    try {
      const res = await fetch(`content/lessons/${lesson.id}.md`);
      if (!res.ok) {
        print(`урок ${idx + 1}: не удалось загрузить (${res.status})`, 'error');
        ui.setAutoScroll(true);
        return;
      }
      const md = await res.text();
      engine.start(lesson.id, md);
      ui.scrollToElement(anchor);
      ui.setAutoScroll(true);
    } catch (e) {
      print(`урок ${idx + 1}: ${e.message}`, 'error');
      ui.setAutoScroll(true);
    }
  }
}

function handleMeta(cmd) {
  const parts = cmd.split(/\s+/);
  const name = parts[0].toLowerCase();
  const arg = parts[1] || '';
  const rest = parts.slice(1).join(' ');

  if (name === 'помощь' || name === 'help') {
    printHelp();
    return true;
  }

  if (name === 'курс') {
    printCourseMap();
    return true;
  }

  if (name === 'урок') {
    if (!arg) {
      print('набери: урок <номер>', 'error');
    } else {
      const lesson = lessonByNumber(arg);
      if (lesson) loadLessonByIndex(manifest.lessons.indexOf(lesson));
      else print(`урок ${escapeHtml(arg)}: такого урока нет.`, 'error');
    }
    return true;
  }

  if (name === 'дальше') {
    const start = currentLessonIndex !== null ? currentLessonIndex + 1 : (getLastLessonIndex() || 0);
    if (start >= manifest.lessons.length) {
      print('Это был последний урок. Ты дошёл до конца курса!', 'success');
    } else {
      loadLessonByIndex(start);
    }
    return true;
  }

  if (name === 'назад') {
    const start = currentLessonIndex !== null ? currentLessonIndex - 1 : (getLastLessonIndex() || 0) - 1;
    if (start < 0) {
      print('Это самое начало курса.', 'warn');
    } else {
      loadLessonByIndex(start);
    }
    return true;
  }

  if (name === 'тема') {
    applyThemeByName(arg.toLowerCase());
    return true;
  }

  if (name === 'shell') {
    applyShell(arg.toLowerCase());
    return true;
  }

  if (name === 'сброс') {
    if (pendingReset) {
      resetProgress();
      currentLessonIndex = null;
      engine.reset();
      freeSession = Simulator.createSession({});
      userShell = 'bash';
      ui.clearScrollback();
      ui.setPrompt('bash', '/home/user');
      print('Прогресс сброшен. Набери помощь.', 'success');
      pendingReset = false;
    } else {
      print('Точно? Набери сброс ещё раз.', 'warn');
      pendingReset = true;
    }
    return true;
  }

  if (name === 'clear' || name === 'очистить') {
    ui.clearScrollback();
    return true;
  }

  return false;
}

function handleCommand(raw) {
  pendingReset = false;
  const trimmed = raw.trim();
  if (!trimmed) return;

  // Мета-команды работают всегда.
  if (handleMeta(trimmed)) {
    ui.focus();
    return;
  }

  // Если урок активен и ожидает ввода, отдаём движку.
  if (engine.isActive() && engine.currentState() !== 'idle') {
    engine.handleInput(trimmed);
    ui.focus();
    return;
  }

  // Иначе — свободный shell.
  runFreeShellCommand(trimmed);
  ui.focus();
}

/* ---------- onboarding ---------- */
function maybeShowOnboarding() {
  try {
    if (localStorage.getItem(ONBOARDED_KEY)) return false;
  } catch (e) { return false; }
  if (!onboarding) return false;
  onboarding.hidden = false;
  onboardingAction.hidden = true;
  runLoginSequence();
  return true;
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
  try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch (e) {}
}

function printWelcomeBack() {
  print('Welcome back to Linux Tutorial 2.0');
  print('Linux — это терминал. Здесь ты управляешь всем сам: быстро, минималистично, настраивается под тебя — надо только чуть вкатиться.');
  const lastIdx = getLastLessonIndex();
  if (lastIdx !== null && manifest.lessons[lastIdx]) {
    const num = lastIdx + 1;
    print(`Продолжаем урок ${num} — набери урок ${num} или дальше.`);
  } else {
    print('Набери помощь, чтобы увидеть команды, или урок 1, чтобы начать.');
  }
}

/* ---------- инициализация ---------- */
async function init() {
  ui.setPrompt('bash', '/home/user');

  try {
    const res = await fetch('content/lessons/manifest.json');
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    manifest = await res.json();
    setTitle('');

    if (!maybeShowOnboarding()) {
      printWelcomeBack();
      const savedLesson = getCurrentLesson();
      if (savedLesson !== null && manifest.lessons[savedLesson]) {
        await loadLessonByIndex(savedLesson);
        const savedY = getScrollPosition();
        if (savedY !== null) {
          const maxY = ui.getScrollHeight() - ui.getClientHeight();
          ui.setScrollTop(Math.max(0, Math.min(savedY, maxY)));
        }
      }
    }
  } catch (e) {
    setTitle('Ошибка');
    print('Не удалось загрузить учебник: ' + e.message, 'error');
    print('Проверь, что сервер запущен (./start.sh или python3 -m http.server 8000).', 'error');
  }

  ui.focus();
}

if (onboardingAction) {
  onboardingAction.addEventListener('click', () => {
    hideOnboarding();
    print('Welcome to Linux Tutorial 2.0');
    print('Linux — это терминал. Здесь ты управляешь всем сам: быстро, минималистично, настраивается под тебя — надо только чуть вкатиться.');
    print('Набери помощь, чтобы увидеть список команд.');
    ui.focus();
  });
}

init();
