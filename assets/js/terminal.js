/**
 * terminal.js — рендер одного блока терминала.
 * v2: окно терминала, режимы bash/fish/zsh, ghost-автоподсказка в fish.
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

export function createTerminal(data, lessonId, taskId) {
  const shellMode = data.shell || 'bash';

  const wrapper = document.createElement('div');
  wrapper.className = 'terminal-block';
  if (isTerminalDone(taskId)) wrapper.classList.add('terminal-passed');

  /* Шапка окна */
  const header = document.createElement('div');
  header.className = 'terminal-header';

  const lights = document.createElement('div');
  lights.className = 'terminal-lights';
  ['red', 'yellow', 'green'].forEach(c => {
    const span = document.createElement('span');
    span.className = `terminal-light terminal-light-${c}`;
    lights.appendChild(span);
  });

  const titleWrap = document.createElement('div');
  titleWrap.className = 'terminal-title-wrap';
  const title = document.createElement('span');
  title.className = 'terminal-title';
  title.textContent = data.title || 'Терминал';
  titleWrap.appendChild(title);

  const tabs = document.createElement('div');
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

  header.appendChild(lights);
  header.appendChild(titleWrap);
  header.appendChild(tabs);
  wrapper.appendChild(header);

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

  const buttons = document.createElement('div');
  buttons.className = 'terminal-buttons';

  const hintBtn = document.createElement('button');
  hintBtn.className = 'terminal-btn';
  hintBtn.type = 'button';
  hintBtn.textContent = 'Подсказка';
  const hintText = document.createElement('div');
  hintText.className = 'terminal-hint';
  hintText.hidden = true;
  hintText.textContent = data.hint || 'Попробуй выполнить команду из условия.';

  const solutionBtn = document.createElement('button');
  solutionBtn.className = 'terminal-btn';
  solutionBtn.type = 'button';
  solutionBtn.textContent = 'Показать решение';
  const solutionText = document.createElement('div');
  solutionText.className = 'terminal-solution';
  solutionText.hidden = true;
  if (Array.isArray(data.solution)) {
    solutionText.innerHTML = '<code>' + escapeHtml(data.solution.join('\n')) + '</code>';
  }

  buttons.appendChild(hintBtn);
  buttons.appendChild(solutionBtn);
  wrapper.appendChild(buttons);
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
    const status = header.querySelector('.terminal-status');
    if (!status) {
      const s = document.createElement('span');
      s.className = 'terminal-status';
      s.textContent = '✓ выполнено';
      titleWrap.appendChild(s);
    }
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
    hintBtn.textContent = hintText.hidden ? 'Подсказка' : 'Скрыть подсказку';
  });

  solutionBtn.addEventListener('click', () => {
    solutionText.hidden = !solutionText.hidden;
    solutionBtn.textContent = solutionText.hidden ? 'Показать решение' : 'Скрыть решение';
  });

  if (isTerminalDone(taskId)) {
    showSuccess();
    solutionText.hidden = false;
  }

  input.focus();
  return wrapper;
}
