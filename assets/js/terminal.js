/**
 * terminal.js — рендер одного блока терминала.
 */
import './simulator.js';
import { markTerminal, isTerminalDone } from './progress.js';

const Simulator = globalThis.TerminalSimulator;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function promptFor(cwd) {
  let display;
  if (cwd === '/home/user') display = '~';
  else if (cwd.startsWith('/home/user/')) display = '~' + cwd.slice('/home/user'.length);
  else display = cwd;
  return `user@linux:${display}$`;
}

export function createTerminal(data, lessonId, taskId) {
  const wrapper = document.createElement('div');
  wrapper.className = 'terminal-block';
  if (isTerminalDone(taskId)) wrapper.classList.add('terminal-passed');

  const header = document.createElement('div');
  header.className = 'terminal-header';
  header.innerHTML = `<span class="terminal-title">${escapeHtml(data.title || 'Терминал')}</span>`;
  if (isTerminalDone(taskId)) {
    header.innerHTML += ' <span class="terminal-status">✓ выполнено</span>';
  }
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
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'terminal-input';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Команда терминала');
  promptLine.appendChild(promptSpan);
  promptLine.appendChild(input);
  wrapper.appendChild(promptLine);

  const buttons = document.createElement('div');
  buttons.className = 'terminal-buttons';

  const hintBtn = document.createElement('button');
  hintBtn.className = 'terminal-btn';
  hintBtn.textContent = 'Подсказка';
  const hintText = document.createElement('div');
  hintText.className = 'terminal-hint';
  hintText.hidden = true;
  hintText.textContent = data.hint || 'Попробуй выполнить команду из условия.';

  const solutionBtn = document.createElement('button');
  solutionBtn.className = 'terminal-btn';
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

  const session = Simulator.createSession(data.setup || {});
  let inputHistory = [];
  let historyIndex = -1;

  function updatePrompt() {
    promptSpan.textContent = promptFor(session.cwd) + ' ';
  }
  updatePrompt();

  function appendLine(html, className) {
    const line = document.createElement('div');
    line.className = 'terminal-line' + (className ? ' ' + className : '');
    line.innerHTML = html;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function appendCommand(text) {
    appendLine('<span class="terminal-prompt">' + escapeHtml(promptFor(session.cwd)) + '</span> ' + escapeHtml(text), 'terminal-command-line');
  }

  function showSuccess() {
    if (success.hidden === false) return;
    success.hidden = false;
    wrapper.classList.add('terminal-passed');
    const status = header.querySelector('.terminal-status');
    if (!status) header.innerHTML += ' <span class="terminal-status">✓ выполнено</span>';
    markTerminal(lessonId, taskId);
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
    const check = Simulator.runChecks(session, data.check || []);
    if (check.passed) showSuccess();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      runCommand(input.value);
      input.value = '';
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        input.value = inputHistory[historyIndex];
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < inputHistory.length - 1) {
        historyIndex++;
        input.value = inputHistory[historyIndex];
      } else {
        historyIndex = inputHistory.length;
        input.value = '';
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
      const res = Simulator.autocomplete(session, input.value);
      if (res.list.length === 1) {
        input.value = res.suggestion + ' ';
      } else if (res.list.length > 1) {
        appendLine(escapeHtml(res.list.join('  ')), 'terminal-hint-list');
      }
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
