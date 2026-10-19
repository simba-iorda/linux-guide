/**
 * terminal.js — рендер одного блока терминала.
 * v4: единое терминальное окно урока. Без рамки/светофора/заголовка.
 *   - bash/fish/zsh — компактная строка внутри потока.
 *   - Клик в любое место блока возвращает фокус инпуту.
 *   - IntersectionObserver аккуратно подаёт фокус, когда задача попадает
 *     во viewport, но не выхватывает его во время прокрутки пользователем.
 */
import './simulator.js';
import { markTerminal, isTerminalDone } from './progress.js';

const Simulator = globalThis.TerminalSimulator;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const SHELLS = [
  { key: 'bash', label: 'bash' },
  { key: 'fish', label: 'fish' },
  { key: 'zsh', label: 'zsh' }
];

/* ---------- фокус: защита от случайного захвата при скролле ---------- */
let userScrolling = false;
let scrollTimer = null;

if (typeof window !== 'undefined') {
  window.addEventListener('wheel', markUserScroll, { passive: true });
  window.addEventListener('touchmove', markUserScroll, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) {
      markUserScroll();
    }
  }, { passive: true });
}

let autoFocusGiven = false;
const pendingAutoFocus = [];

function shouldAutoFocus() {
  if (autoFocusGiven) return false;
  if (userScrolling) return false;
  const ae = document.activeElement;
  if (ae && ae !== document.body && !ae.closest('.terminal-block')) {
    // можно перебрать фокус, только если текущий элемент скрыт (например, кнопка онбординга)
    if (ae.offsetParent !== null) return false;
  }
  if (typeof window !== 'undefined' && window.getSelection().toString()) return false;
  return true;
}

function tryAutoFocus(input) {
  if (!shouldAutoFocus()) return false;
  input.focus();
  autoFocusGiven = true;
  return true;
}

function isInViewport(el) {
  if (typeof window === 'undefined') return false;
  const rect = el.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0;
}

function flushPendingFocus() {
  if (autoFocusGiven || userScrolling) return;
  const visible = pendingAutoFocus
    .filter(item => document.body.contains(item.input) && isInViewport(item.input))
    .sort((a, b) => a.input.getBoundingClientRect().top - b.input.getBoundingClientRect().top);
  pendingAutoFocus.length = 0;
  for (const item of visible) {
    if (tryAutoFocus(item.input)) break;
  }
}

function markUserScroll() {
  userScrolling = true;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    userScrolling = false;
    flushPendingFocus();
  }, 150);
}

export function resetTerminalAutoFocus() {
  autoFocusGiven = false;
  pendingAutoFocus.length = 0;
}

export function createTerminal(data, lessonId, taskId) {
  const shellMode = data.shell || 'bash';

  const wrapper = document.createElement('div');
  wrapper.className = 'terminal-block';
  if (isTerminalDone(taskId)) wrapper.classList.add('terminal-passed');

  /* shell: bash | fish | zsh */
  const metaLine = document.createElement('div');
  metaLine.className = 'terminal-meta-line';

  const shellLabel = document.createElement('span');
  shellLabel.className = 'terminal-meta-label';
  shellLabel.textContent = '# shell: ';
  metaLine.appendChild(shellLabel);

  const tabs = document.createElement('span');
  tabs.className = 'terminal-shell-tabs';
  const tabButtons = {};
  SHELLS.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'terminal-shell-tab';
    btn.type = 'button';
    btn.textContent = s.label;
    btn.title = `Переключить на ${s.label}`;
    if (s.key === shellMode) btn.classList.add('active');
    btn.addEventListener('click', () => setShell(s.key));
    tabButtons[s.key] = btn;
    tabs.appendChild(btn);
  });
  metaLine.appendChild(tabs);
  wrapper.appendChild(metaLine);

  if (data.task) {
    const task = document.createElement('div');
    task.className = 'terminal-task';
    task.textContent = data.task;
    wrapper.appendChild(task);
  }

  const output = document.createElement('div');
  output.className = 'terminal-output';
  output.setAttribute('role', 'log');
  output.setAttribute('aria-live', 'polite');
  wrapper.appendChild(output);

  const promptLine = document.createElement('div');
  promptLine.className = 'terminal-prompt-line';
  const promptSpan = document.createElement('span');
  promptSpan.className = 'terminal-prompt';
  const inputWrap = document.createElement('span');
  inputWrap.className = 'terminal-input-wrap';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'terminal-input';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Команда терминала');
  const ghost = document.createElement('span');
  ghost.className = 'terminal-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  inputWrap.appendChild(input);
  inputWrap.appendChild(ghost);
  promptLine.appendChild(promptSpan);
  promptLine.appendChild(inputWrap);
  wrapper.appendChild(promptLine);

  const actions = document.createElement('div');
  actions.className = 'terminal-actions';

  const hintBtn = document.createElement('button');
  hintBtn.className = 'terminal-action-btn';
  hintBtn.type = 'button';
  hintBtn.textContent = '[F1] подсказка';
  const hintText = document.createElement('div');
  hintText.className = 'terminal-hint';
  hintText.hidden = true;
  hintText.textContent = data.hint || 'Попробуй выполнить команду из условия.';

  const solutionBtn = document.createElement('button');
  solutionBtn.className = 'terminal-action-btn';
  solutionBtn.type = 'button';
  solutionBtn.textContent = '[F2] решение';
  const solutionText = document.createElement('div');
  solutionText.className = 'terminal-solution';
  solutionText.hidden = true;
  if (Array.isArray(data.solution)) {
    solutionText.innerHTML = '<code>' + escapeHtml(data.solution.join('\n')) + '</code>';
  }

  actions.appendChild(hintBtn);
  actions.appendChild(solutionBtn);
  wrapper.appendChild(actions);
  wrapper.appendChild(hintText);
  wrapper.appendChild(solutionText);

  const success = document.createElement('div');
  success.className = 'terminal-success';
  success.hidden = true;
  success.textContent = 'Задача выполнена ✓';
  wrapper.appendChild(success);

  const session = Simulator.createSession(Object.assign({}, data.setup || {}, { shell: shellMode }));
  let inputHistory = [];
  let historyIndex = -1;
  let currentGhost = '';

  function updatePrompt() {
    promptSpan.textContent = Simulator.getPrompt(session) + ' ';
  }
  updatePrompt();

  function setShell(mode) {
    session.shell = mode;
    SHELLS.forEach(s => tabButtons[s.key].classList.toggle('active', s.key === mode));
    updatePrompt();
    updateGhost();
    input.focus();
  }

  function appendLine(html, className) {
    const line = document.createElement('div');
    line.className = 'terminal-line' + (className ? ' ' + className : '');
    line.innerHTML = html;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function appendCommand(text) {
    appendLine('<span class="terminal-prompt">' + escapeHtml(Simulator.getPrompt(session)) + '</span> ' + escapeHtml(text), 'terminal-command-line');
  }

  function showSuccess() {
    if (success.hidden === false) return;
    success.hidden = false;
    wrapper.classList.add('terminal-passed');
    markTerminal(lessonId, taskId);
  }

  function updateGhost() {
    currentGhost = '';
    ghost.textContent = '';
    input.style.width = Math.max(1, input.value.length + 1) + 'ch';
    if (session.shell !== 'fish') return;
    const val = input.value;
    if (!val) return;
    const match = [...session.history].reverse().find(h => h.startsWith(val) && h.length > val.length);
    if (match) {
      currentGhost = match.slice(val.length);
      ghost.textContent = currentGhost;
    }
  }

  function acceptGhost() {
    if (currentGhost) {
      input.value += currentGhost;
      updateGhost();
      return true;
    }
    return false;
  }

  function runCommand(raw) {
    const line = raw.trim();
    if (!line) return;
    inputHistory.push(line);
    historyIndex = inputHistory.length;
    appendCommand(line);
    const result = Simulator.exec(session, line);
    if (result.clear) {
      output.innerHTML = '';
    } else if (result.stdout) {
      appendLine(escapeHtml(result.stdout), 'terminal-out');
    }
    updatePrompt();
    updateGhost();
    const check = Simulator.runChecks(session, data.check || []);
    if (check.passed) showSuccess();
  }

  input.addEventListener('input', updateGhost);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      runCommand(input.value);
      input.value = '';
      updateGhost();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        input.value = inputHistory[historyIndex];
        updateGhost();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < inputHistory.length - 1) {
        historyIndex++;
        input.value = inputHistory[historyIndex];
        updateGhost();
      } else {
        historyIndex = inputHistory.length;
        input.value = '';
        updateGhost();
      }
      return;
    }
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      output.innerHTML = '';
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (session.shell === 'fish' && acceptGhost()) return;
      const res = Simulator.autocomplete(session, input.value);
      if (res.list.length === 1) {
        input.value = res.suggestion + ' ';
      } else if (res.list.length > 1) {
        appendLine(escapeHtml(res.list.join('  ')), 'terminal-hint-list');
      }
      updateGhost();
      return;
    }
  });

  hintBtn.addEventListener('click', () => {
    hintText.hidden = !hintText.hidden;
    hintBtn.textContent = hintText.hidden ? '[F1] подсказка' : '[F1] скрыть подсказку';
  });

  solutionBtn.addEventListener('click', () => {
    solutionText.hidden = !solutionText.hidden;
    solutionBtn.textContent = solutionText.hidden ? '[F2] решение' : '[F2] скрыть решение';
  });

  /* Клик по блоку возвращает фокус инпуту, но не мешает кнопкам/ссылкам/выделению. */
  function focusInput(e) {
    if (e && e.target.closest('button, a, input, textarea, select')) return;
    if (typeof window !== 'undefined' && window.getSelection().toString()) return;
    input.focus();
  }
  wrapper.addEventListener('click', focusInput);
  output.addEventListener('click', focusInput);

  if (isTerminalDone(taskId)) {
    showSuccess();
    solutionText.hidden = false;
  }

  /* Автофокус при появлении во viewport — осторожно, без гонок со скроллом. */
  if (typeof IntersectionObserver !== 'undefined') {
    const focusItem = { input, wrapper };
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        if (userScrolling) {
          // откладываем фокус до окончания прокрутки пользователя
          if (!pendingAutoFocus.includes(focusItem)) pendingAutoFocus.push(focusItem);
        } else if (tryAutoFocus(input)) {
          io.unobserve(wrapper);
        } else {
          if (!pendingAutoFocus.includes(focusItem)) pendingAutoFocus.push(focusItem);
        }
      });
    }, { threshold: 0.4 });
    io.observe(wrapper);
  }

  return wrapper;
}
