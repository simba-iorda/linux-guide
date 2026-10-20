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

/* ---------- таблицы: честный ASCII/box-drawing рендер ---------- */
const graphemeSegmenter = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter('ru', { granularity: 'grapheme' })
  : null;

function graphemeClusters(str) {
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(str), s => s.segment);
  }
  // Fallback для старых сред: по кодпоинтам.
  return Array.from(str);
}

function isWideCodepoint(cp) {
  if (cp >= 0x4E00 && cp <= 0x9FFF) return true; // CJK Unified Ideographs
  if (cp >= 0x3400 && cp <= 0x4DBF) return true; // CJK Extension A
  if (cp >= 0x3040 && cp <= 0x309F) return true; // Hiragana
  if (cp >= 0x30A0 && cp <= 0x30FF) return true; // Katakana
  if (cp >= 0xAC00 && cp <= 0xD7AF) return true; // Hangul Syllables
  if (cp >= 0xFF01 && cp <= 0xFF60) return true; // Fullwidth ASCII
  if (cp >= 0xFFE0 && cp <= 0xFFE6) return true; // Fullwidth symbol variants
  return false;
}

function clusterWidth(cluster) {
  // Полностью невидимые (маркеры, ZWJ, VS16 и др.) — 0.
  const codepoints = Array.from(cluster);
  if (codepoints.every(ch => /\p{M}|\p{Cf}/u.test(ch))) return 0;
  // Эмодзи и пиктограммы — 2.
  if (/\p{Extended_Pictographic}/u.test(cluster)) return 2;
  // CJK / Fullwidth.
  if (codepoints.some(ch => isWideCodepoint(ch.codePointAt(0) || 0))) return 2;
  return 1;
}

function displayWidth(str) {
  return graphemeClusters(str).reduce((sum, c) => sum + clusterWidth(c), 0);
}

function padEndDisplay(str, width) {
  const w = displayWidth(str);
  if (w >= width) return str;
  return str + ' '.repeat(width - w);
}

function wrapTextDisplay(text, width) {
  if (width <= 0) return [String(text)];
  const tokens = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  let curW = 0;
  for (const tok of tokens) {
    const tokW = displayWidth(tok);
    if (tokW > width) {
      if (cur) { lines.push(cur); cur = ''; curW = 0; }
      let part = '';
      let partW = 0;
      for (const cluster of graphemeClusters(tok)) {
        const cw = clusterWidth(cluster);
        if (partW + cw > width) {
          if (part) lines.push(part);
          part = '';
          partW = 0;
        }
        part += cluster;
        partW += cw;
      }
      if (part) { cur = part; curW = partW; }
      continue;
    }
    const sepW = cur ? 1 : 0;
    if (curW + sepW + tokW <= width) {
      cur = cur ? cur + ' ' + tok : tok;
      curW += sepW + tokW;
    } else {
      lines.push(cur);
      cur = tok;
      curW = tokW;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// Оборачиваем широкие/эмодзи символы в inline-block фиксированной ширины,
// чтобы fallback-шрифт не сдвигал колонки.
function renderCellHtml(text) {
  const clusters = graphemeClusters(text);
  if (!clusters.length) return '';
  return clusters.map(c => {
    const w = clusterWidth(c);
    const esc = escapeHtml(c);
    if (w === 2) {
      return `<span class="wide-char" style="display:inline-block;width:2ch">${esc}</span>`;
    }
    return esc;
  }).join('');
}

function tableNaturalChars(rows) {
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  if (!colCount) return 0;
  const widths = Array(colCount).fill(0);
  rows.forEach(r => {
    for (let i = 0; i < colCount; i++) {
      const cell = r[i] || '';
      const maxLine = String(cell).split('\n').reduce((m, l) => Math.max(m, displayWidth(l)), 0);
      widths[i] = Math.max(widths[i], maxLine);
    }
  });
  return widths.reduce((a, b) => a + b, 0) + 3 * colCount + 1;
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
      const maxLine = String(cell).split('\n').reduce((m, l) => Math.max(m, displayWidth(l)), 0);
      widths[i] = Math.max(widths[i], maxLine);
    });
  });

  const totalNatural = widths.reduce((a, b) => a + b, 0) + 3 * colCount + 1;

  // Широкий экран — классическая таблица с рамкой.
  if (totalNatural <= maxWidth) {
    const wrappedRows = paddedRows.map(r => r.map((cell, i) => wrapTextDisplay(String(cell), widths[i])));
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
        const parts = cellLines.map((lines, i) => renderCellHtml(padEndDisplay(lines[l] || '', widths[i])));
        const lineHtml = '│ ' + parts.join(' │ ') + ' │';
        out.push({ className: isHeader ? 'table-header' : 'table', html: lineHtml });
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
  paddedRows.slice(1).forEach((r, idx) => {
    for (let colIdx = 0; colIdx < colCount; colIdx++) {
      const header = headers[colIdx] || '';
      const value = r[colIdx] || '';
      const html = `<span class="table-header">${escapeHtml(header)}:</span> ${renderCellHtml(value)}`;
      out.push({ className: 'table', html });
    }
    if (idx < paddedRows.length - 2) {
      out.push({ className: 'comment', text: '──' });
    }
  });
  return out;
}

/* ---------- блоки задач и квизов ---------- */
function createTaskBlock({ task, hint, solution }) {
  const root = document.createElement('div');
  root.className = 'task-block';

  const taskLine = document.createElement('div');
  taskLine.className = 'line comment';
  taskLine.textContent = `задача: ${task}`;
  root.appendChild(taskLine);

  const output = document.createElement('div');
  output.className = 'task-output';
  root.appendChild(output);

  const hintEl = document.createElement('div');
  hintEl.className = 'line hint hidden';
  hintEl.textContent = hint || 'Попробуй выполнить команду из условия.';
  root.appendChild(hintEl);

  const solutionEl = document.createElement('div');
  solutionEl.className = 'line solution hidden';
  const sol = Array.isArray(solution) ? solution.join('\n') : (solution || '');
  solutionEl.textContent = sol || 'Решение не задано.';
  root.appendChild(solutionEl);

  const successEl = document.createElement('div');
  successEl.className = 'line success hidden';
  successEl.textContent = 'Задача выполнена ✓';
  root.appendChild(successEl);

  function appendLineToOutput(text, className = 'output') {
    const div = document.createElement('div');
    div.className = 'line ' + className;
    div.textContent = text;
    output.appendChild(div);
  }

  return {
    element: root,
    appendCommand(promptText, cmdText) {
      appendLineToOutput(promptText + cmdText, 'prompt-line');
    },
    appendOutput(text, className = 'output') {
      const lines = String(text).split('\n');
      const endsNewline = text.endsWith('\n');
      lines.forEach((l, i) => {
        if (i === lines.length - 1 && l === '' && endsNewline) return;
        appendLineToOutput(l, className);
      });
    },
    showHint() { hintEl.classList.remove('hidden'); },
    showSolution() { solutionEl.classList.remove('hidden'); },
    markDone() { successEl.classList.remove('hidden'); }
  };
}

function createDoneTaskBlock({ task }) {
  const root = document.createElement('div');
  root.className = 'task-block done';
  const taskLine = document.createElement('div');
  taskLine.className = 'line comment';
  taskLine.textContent = `задача: ${task}`;
  root.appendChild(taskLine);
  const success = document.createElement('div');
  success.className = 'line success';
  success.textContent = 'Задача выполнена ✓';
  root.appendChild(success);
  return { element: root };
}

function createQuizBlock(data) {
  const root = document.createElement('div');
  root.className = 'quiz-block';

  const q = document.createElement('div');
  q.className = 'line quiz-question';
  q.textContent = `[?] ${data.question}`;
  root.appendChild(q);

  const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];
  data.options.forEach((opt, i) => {
    const line = document.createElement('div');
    line.className = 'line quiz-option';
    line.textContent = `${LETTERS[i]}) ${opt}`;
    root.appendChild(line);
  });

  const feedback = document.createElement('div');
  feedback.className = 'line quiz-feedback hidden';
  root.appendChild(feedback);

  return {
    element: root,
    showInvalid(msg) {
      feedback.className = 'line quiz-feedback error';
      feedback.textContent = msg;
    },
    showCorrect(explanation) {
      feedback.className = 'line quiz-feedback success';
      feedback.textContent = explanation ? `Верно — ${explanation}` : 'Верно';
    }
  };
}

function createDoneQuizBlock(data) {
  const root = document.createElement('div');
  root.className = 'quiz-block done';
  const q = document.createElement('div');
  q.className = 'line quiz-question';
  q.textContent = `[?] ${data.question}`;
  root.appendChild(q);
  const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];
  data.options.forEach((opt, i) => {
    const line = document.createElement('div');
    line.className = 'line quiz-option';
    line.textContent = `${LETTERS[i]}) ${opt}`;
    root.appendChild(line);
  });
  const ok = document.createElement('div');
  ok.className = 'line success';
  ok.textContent = 'Верно';
  root.appendChild(ok);
  if (data.explanation) {
    const exp = document.createElement('div');
    exp.className = 'line comment';
    exp.textContent = data.explanation;
    root.appendChild(exp);
  }
  return { element: root };
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
    const endsNewline = text.endsWith('\n');
    lines.forEach((l, i) => {
      if (i === lines.length - 1 && l === '' && endsNewline) return;
      appendLine(l, className);
    });
  }

  function appendCommandLine(cmdText) {
    appendLine(prompt.textContent + cmdText, 'prompt-line');
  }

  function appendRaw(node) {
    scrollback.appendChild(node);
    maybeScroll();
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

  // Перерендер после загрузки шрифтов — метрика может измениться.
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      tableBlocks.forEach(b => b._redraw && b._redraw());
    });
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
    createTaskBlock,
    createDoneTaskBlock,
    createQuizBlock,
    createDoneQuizBlock,
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
