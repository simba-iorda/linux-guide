/**
 * terminal-ui.js — один полноэкранный терминал: скроллбэк и строка ввода.
 */

const SCROLL_IDLE_MS = 150;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function abbreviateCwd(cwd) {
  if (cwd === '/home/user') return '~';
  if (cwd.startsWith('/home/user/')) return '~' + cwd.slice('/home/user'.length);
  return cwd;
}

export function formatPrompt(shell, cwd) {
  const d = abbreviateCwd(cwd);
  switch (shell) {
    case 'fish': return `user@linux ${d}>`;
    case 'zsh': return `${d} ❯`;
    case 'bash':
    default:
      return `user@linux:${d}$`;
  }
}

/* ---------- таблицы ---------- */
function wrapText(text, width) {
  if (width <= 0) return [String(text)];
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const word of words) {
    if (!word) continue;
    if (word.length > width) {
      if (cur) { lines.push(cur); cur = ''; }
      for (let i = 0; i < word.length; i += width) {
        lines.push(word.slice(i, i + width));
      }
      continue;
    }
    const sep = cur ? ' ' : '';
    if (cur.length + sep.length + word.length <= width) {
      cur += sep + word;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function renderTableRows(rows, maxWidth) {
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  if (!colCount) return [];
  const paddedRows = rows.map(r => {
    const arr = r.slice();
    while (arr.length < colCount) arr.push('');
    return arr;
  });

  const widths = Array(colCount).fill(0);
  paddedRows.forEach(r => {
    r.forEach((cell, i) => {
      const maxLine = String(cell).split('\n').reduce((m, l) => Math.max(m, l.length), 0);
      widths[i] = Math.max(widths[i], maxLine);
    });
  });

  const totalNatural = widths.reduce((a, b) => a + b, 0) + 3 * colCount + 1;

  // Широкий экран — классическая таблица с рамкой.
  if (totalNatural <= maxWidth) {
    const wrappedRows = paddedRows.map(r => r.map((cell, i) => wrapText(String(cell), widths[i])));
    const out = [];
    const top = '┌' + widths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
    const sep = '├' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
    const bottom = '└' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';

    out.push({ className: 'table', text: top });
    paddedRows.forEach((r, rowIdx) => {
      const cellLines = wrappedRows[rowIdx];
      const height = cellLines.reduce((m, lines) => Math.max(m, lines.length), 0);
      const isHeader = rowIdx === 0;
      for (let l = 0; l < height; l++) {
        const lineText = '│ ' + cellLines.map((lines, i) => (lines[l] || '').padEnd(widths[i])).join(' │ ') + ' │';
        out.push({ className: isHeader ? 'table-header' : 'table', text: lineText });
      }
      if (rowIdx === 0 && paddedRows.length > 1) {
        out.push({ className: 'table', text: sep });
      }
    });
    out.push({ className: 'table', text: bottom });
    return out;
  }

  // Узкий экран — вертикальные карточки.
  const headers = paddedRows[0];
  const out = [];
  for (let rowIdx = 1; rowIdx < paddedRows.length; rowIdx++) {
    const row = paddedRows[rowIdx];
    for (let colIdx = 0; colIdx < colCount; colIdx++) {
      const header = headers[colIdx] || '';
      const value = row[colIdx] || '';
      const html = `<span class="table-header">${escapeHtml(header)}:</span> ${escapeHtml(value)}`;
      out.push({ className: 'table', html });
    }
    if (rowIdx < paddedRows.length - 1) {
      out.push({ className: 'comment', text: '──' });
    }
  }
  return out;
}

export function createTerminalUI({ onSubmit, getAutocompleteSession }) {
  const scrollback = document.getElementById('scrollback');
  const form = document.getElementById('prompt-form');
  const input = document.getElementById('command-input');
  const prompt = document.getElementById('prompt-display');
  const ghost = document.getElementById('input-ghost');
  const terminal = document.querySelector('.terminal');

  let shell = 'bash';
  let cwd = '/home/user';
  let history = [];
  let historyIndex = -1;
  let ghostText = '';
  let userScrolling = false;
  let scrollTimer = null;
  let enabled = true;
  let autoScroll = true;
  let onScrollCallback = null;
  const tableBlocks = new Set();

  function setPrompt(newShell, newCwd) {
    shell = newShell || shell;
    cwd = newCwd || cwd;
    prompt.textContent = formatPrompt(shell, cwd) + ' ';
  }

  function appendLine(text, className = 'output') {
    const line = document.createElement('div');
    line.className = 'line ' + className;
    line.textContent = text;
    scrollback.appendChild(line);
    maybeScroll();
    return line;
  }

  function appendLines(text, className = 'output') {
    const lines = String(text).split('\n');
    // Preserve trailing empty line semantics similar to terminal output.
    const endsNewline = text.endsWith('\n');
    lines.forEach((l, i) => {
      if (i === lines.length - 1 && l === '' && endsNewline) return;
      appendLine(l, className);
    });
  }

  function appendCommandLine(cmdText) {
    appendLine(prompt.textContent + cmdText, 'prompt-line');
  }

  function maybeScroll() {
    if (userScrolling || !autoScroll) return;
    scrollback.scrollTop = scrollback.scrollHeight;
  }

  function setAutoScroll(value) {
    autoScroll = value;
  }

  function markUserScroll() {
    userScrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { userScrolling = false; }, SCROLL_IDLE_MS);
  }

  function focus() {
    if (!enabled) return;
    if (typeof window !== 'undefined' && window.getSelection().toString()) return;
    input.focus();
  }

  function setEnabled(value) {
    enabled = value;
    input.disabled = !value;
  }

  function updateGhost() {
    ghostText = '';
    ghost.textContent = '';
    input.style.width = Math.max(1, input.value.length) + 'ch';
    if (shell !== 'fish') return;
    const val = input.value;
    if (!val) return;
    const session = getAutocompleteSession ? getAutocompleteSession() : null;
    if (!session) return;
    const match = [...session.history].reverse().find(h => h.startsWith(val) && h.length > val.length);
    if (match) {
      ghostText = match.slice(val.length);
      ghost.textContent = ghostText;
    }
  }

  function acceptGhost() {
    if (ghostText) {
      input.value += ghostText;
      updateGhost();
      return true;
    }
    return false;
  }

  function clearScrollback() {
    scrollback.innerHTML = '';
  }

  // Scroll detection: don't auto-scroll while user is looking up.
  scrollback.addEventListener('wheel', markUserScroll, { passive: true });
  scrollback.addEventListener('touchmove', markUserScroll, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) {
      markUserScroll();
    }
  }, { passive: true });

  // Tap/click в терминал = фокус ввода.
  function focusInput(e) {
    if (e && e.target.closest('button, a, input, textarea, select')) return;
    if (typeof window !== 'undefined' && window.getSelection().toString()) return;
    focus();
  }
  scrollback.addEventListener('click', focusInput);
  if (terminal) terminal.addEventListener('click', focusInput);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!enabled) return;
    const value = input.value;
    if (value.trim() !== '') {
      history.push(value);
      historyIndex = history.length;
    }
    input.value = '';
    updateGhost();
    if (onSubmit && value.trim() !== '') onSubmit(value);
  });

  input.addEventListener('input', updateGhost);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      // handled by submit
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        input.value = history[historyIndex];
        updateGhost();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        historyIndex++;
        input.value = history[historyIndex];
        updateGhost();
      } else {
        historyIndex = history.length;
        input.value = '';
        updateGhost();
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (shell === 'fish' && acceptGhost()) return;
      const session = getAutocompleteSession ? getAutocompleteSession() : null;
      if (!session) return;
      const Simulator = globalThis.TerminalSimulator;
      if (!Simulator || !Simulator.autocomplete) return;
      const res = Simulator.autocomplete(session, input.value);
      if (res.list.length === 1) {
        input.value = res.suggestion + ' ';
        updateGhost();
      } else if (res.list.length > 1) {
        appendLine(res.list.join('  '), 'comment');
      }
      return;
    }
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      clearScrollback();
      return;
    }
  });

  function appendComment(text) { appendLine(text, 'comment'); }
  function appendSuccess(text) { appendLine(text, 'success'); }
  function appendError(text) { appendLine(text, 'error'); }

  function appendRaw(node) {
    scrollback.appendChild(node);
    maybeScroll();
  }

  function appendAnchor() {
    const el = document.createElement('div');
    el.className = 'lesson-anchor';
    el.style.height = '0';
    scrollback.appendChild(el);
    return el;
  }

  function scrollToElement(el) {
    if (!el || !scrollback.contains(el)) return;
    scrollback.scrollTop = el.offsetTop - scrollback.offsetTop;
  }

  function getScrollTop() { return scrollback.scrollTop; }
  function setScrollTop(y) { scrollback.scrollTop = y; }
  function getScrollHeight() { return scrollback.scrollHeight; }
  function getClientHeight() { return scrollback.clientHeight; }

  function getTableMaxWidth() {
    if (!scrollback) return 100;
    const style = window.getComputedStyle(scrollback);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const width = scrollback.clientWidth - padLeft - padRight;
    const test = document.createElement('span');
    test.textContent = 'M';
    test.style.position = 'absolute';
    test.style.visibility = 'hidden';
    test.style.whiteSpace = 'pre';
    test.style.font = style.font;
    document.body.appendChild(test);
    const charWidth = test.getBoundingClientRect().width || 9;
    document.body.removeChild(test);
    return Math.max(40, Math.floor(width / charWidth));
  }

  function createTableBlock(rows) {
    const block = document.createElement('div');
    block.className = 'table-block';
    function redraw() {
      const lines = renderTableRows(rows, getTableMaxWidth());
      block.innerHTML = '';
      for (const l of lines) {
        const div = document.createElement('div');
        div.className = 'line ' + (l.className || 'output');
        if (l.html != null) {
          div.innerHTML = l.html;
        } else {
          div.textContent = l.text;
        }
        block.appendChild(div);
      }
    }
    redraw();
    block._redraw = redraw;
    tableBlocks.add(block);
    return block;
  }

  // ResizeObserver перерисовывает таблицы при изменении ширины терминала.
  if (typeof ResizeObserver !== 'undefined' && terminal) {
    const ro = new ResizeObserver(() => {
      tableBlocks.forEach(b => b._redraw && b._redraw());
    });
    ro.observe(terminal);
  }

  function onScroll(cb) {
    onScrollCallback = cb;
  }

  scrollback.addEventListener('scroll', () => {
    if (onScrollCallback) onScrollCallback(scrollback.scrollTop);
  }, { passive: true });

  return {
    setPrompt,
    appendLine,
    appendLines,
    appendCommandLine,
    appendComment,
    appendSuccess,
    appendError,
    appendRaw,
    appendAnchor,
    scrollToElement,
    getScrollTop,
    setScrollTop,
    getScrollHeight,
    getClientHeight,
    createTableBlock,
    getScrollback: () => scrollback,
    setAutoScroll,
    onScroll,
    clearScrollback,
    focus,
    setEnabled,
    shell: () => shell,
    cwd: () => cwd
  };
}
