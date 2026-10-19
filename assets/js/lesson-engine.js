/**
 * lesson-engine.js — парсинг урока и последовательное прохождение
 * задач и квизов в едином терминальном потоке.
 */
import { setLessonTotal, markQuiz, markTerminal, isQuizDone, isTerminalDone } from './progress.js';

const Simulator = globalThis.TerminalSimulator;
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

function stripFrontmatter(md) {
  return md.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
}

function textContent(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType === Node.ELEMENT_NODE) {
    return Array.from(node.childNodes).map(textContent).join('');
  }
  return '';
}

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

function renderTable(rows, maxWidth) {
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

  const minWidth = 3;
  const totalNatural = widths.reduce((a, b) => a + b, 0) + 3 * colCount + 1;
  if (totalNatural > maxWidth) {
    let excess = totalNatural - maxWidth;
    while (excess > 0) {
      const widest = widths
        .map((w, i) => ({ w, i }))
        .filter(x => x.w > minWidth)
        .sort((a, b) => b.w - a.w)[0];
      if (!widest) break;
      widths[widest.i]--;
      excess--;
    }
  }

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

function htmlToLines(html) {
  const out = [];
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;

  function walk(node, prefix = '') {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent.trim();
        if (t) out.push({ className: 'output', text: prefix + t });
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === 'h1' || tag === 'h2') {
        out.push({ className: 'comment', text: prefix + '# ' + textContent(child).trim() });
      } else if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
        out.push({ className: 'comment', text: prefix + '## ' + textContent(child).trim() });
      } else if (tag === 'p') {
        const t = textContent(child).trim();
        if (t) out.push({ className: 'output', text: prefix + t });
      } else if (tag === 'pre') {
        const code = child.querySelector('code');
        const raw = code ? code.textContent : child.textContent;
        const lines = raw.split('\n');
        const endsNl = raw.endsWith('\n');
        lines.forEach((l, i) => {
          if (i === lines.length - 1 && l === '' && endsNl) return;
          out.push({ className: 'code', text: prefix + l });
        });
      } else if (tag === 'ul' || tag === 'ol') {
        for (const li of child.children) {
          const t = textContent(li).trim();
          if (t) out.push({ className: 'output', text: prefix + '- ' + t });
        }
      } else if (tag === 'blockquote') {
        walk(child, prefix + '> ');
      } else if (tag === 'table') {
        const tableRows = [];
        for (const row of child.querySelectorAll('tr')) {
          const cells = Array.from(row.querySelectorAll('td, th')).map(c => textContent(c).trim());
          if (cells.length) tableRows.push(cells);
        }
        if (tableRows.length) out.push({ type: 'table', rows: tableRows });
      } else if (tag === 'hr') {
        out.push({ className: 'comment', text: prefix + '---' });
      } else if (tag === 'details') {
        const summary = child.querySelector('summary');
        const summaryText = summary ? textContent(summary).trim() : 'Подробнее';
        const childLines = [];
        for (const c of child.children) {
          if (c === summary) continue;
          const lenBefore = childLines.length;
          walkElement(c, childLines, '');
        }
        out.push({ type: 'details', summary: summaryText, lines: childLines });
      } else {
        walk(child, prefix);
      }
    }
  }

  function walkElement(el, collector, prefix) {
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent.trim();
        if (t) collector.push({ className: 'output', text: prefix + t });
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === 'h1' || tag === 'h2') {
        collector.push({ className: 'comment', text: prefix + '# ' + textContent(child).trim() });
      } else if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
        collector.push({ className: 'comment', text: prefix + '## ' + textContent(child).trim() });
      } else if (tag === 'p') {
        const t = textContent(child).trim();
        if (t) collector.push({ className: 'output', text: prefix + t });
      } else if (tag === 'pre') {
        const code = child.querySelector('code');
        const raw = code ? code.textContent : child.textContent;
        const lines = raw.split('\n');
        const endsNl = raw.endsWith('\n');
        lines.forEach((l, i) => {
          if (i === lines.length - 1 && l === '' && endsNl) return;
          collector.push({ className: 'code', text: prefix + l });
        });
      } else if (tag === 'ul' || tag === 'ol') {
        for (const li of child.children) {
          const t = textContent(li).trim();
          if (t) collector.push({ className: 'output', text: prefix + '- ' + t });
        }
      } else if (tag === 'blockquote') {
        walkElement(child, collector, prefix + '> ');
      } else if (tag === 'table') {
        const tableRows = [];
        for (const row of child.querySelectorAll('tr')) {
          const cells = Array.from(row.querySelectorAll('td, th')).map(c => textContent(c).trim());
          if (cells.length) tableRows.push(cells);
        }
        if (tableRows.length) collector.push({ type: 'table', rows: tableRows });
      } else if (tag === 'hr') {
        collector.push({ className: 'comment', text: prefix + '---' });
      } else {
        walkElement(child, collector, prefix);
      }
    }
  }

  walk(wrapper);
  return out;
}

function parseSegments(md) {
  const segments = [];
  const regex = /^```(quiz|terminal)\s*\n([\s\S]*?)\n```$/gm;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(md)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'md', text: md.slice(lastIndex, match.index) });
    }
    segments.push({ type: match[1], body: match[2] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < md.length) {
    segments.push({ type: 'md', text: md.slice(lastIndex) });
  }
  return segments;
}

export function parseLesson(md) {
  md = stripFrontmatter(md);
  const segments = parseSegments(md);
  const steps = [];
  let terminalIndex = 0;
  let quizIndex = 0;

  for (const seg of segments) {
    if (seg.type === 'md') {
      const lines = htmlToLines(globalThis.marked.parse(seg.text));
      if (lines.length) steps.push({ type: 'text', lines });
    } else if (seg.type === 'terminal') {
      let data;
      try {
        data = JSON.parse(seg.body.trim());
      } catch (e) {
        steps.push({ type: 'text', lines: [{ className: 'error', text: '# ошибка в блоке terminal: ' + e.message }] });
        continue;
      }
      const id = `t${terminalIndex}`;
      terminalIndex++;
      steps.push({ type: 'terminal', id, data });
    } else if (seg.type === 'quiz') {
      let data;
      try {
        data = JSON.parse(seg.body.trim());
      } catch (e) {
        steps.push({ type: 'text', lines: [{ className: 'error', text: '# ошибка в блоке quiz: ' + e.message }] });
        continue;
      }
      const id = `q${quizIndex}`;
      quizIndex++;
      steps.push({ type: 'quiz', id, data });
    }
  }

  return { steps, quizCount: quizIndex, terminalCount: terminalIndex };
}

function appendLineTo(container, text, className) {
  const el = document.createElement('div');
  el.className = 'line ' + (className || 'output');
  el.textContent = text;
  container.appendChild(el);
}

function renderTextLines(lines, container, ui) {
  for (const line of lines) {
    if (line && line.type === 'table') {
      const tableLines = renderTable(line.rows, ui.getTableMaxWidth());
      tableLines.forEach(tl => appendLineTo(container, tl.text, tl.className));
    } else if (line && line.type === 'details') {
      const wrap = document.createElement('div');
      wrap.className = 'details-block';
      const summary = document.createElement('div');
      summary.className = 'line comment details-summary';
      summary.textContent = '▼ ' + line.summary;
      summary.tabIndex = 0;
      const body = document.createElement('div');
      body.className = 'details-body';
      body.hidden = true;
      renderTextLines(line.lines, body, ui);
      const toggle = () => {
        body.hidden = !body.hidden;
        summary.textContent = (body.hidden ? '▼ ' : '▲ ') + line.summary;
      };
      summary.addEventListener('click', toggle);
      summary.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
      wrap.appendChild(summary);
      wrap.appendChild(body);
      container.appendChild(wrap);
    } else {
      appendLineTo(container, line.text, line.className);
    }
  }
}

export function createLessonEngine({ ui, onDone, getUserShell, onSetUserShell }) {
  let lessonId = null;
  let steps = [];
  let stepIndex = 0;
  let state = 'idle'; // idle, terminal, quiz
  let currentTask = null;
  let currentTaskId = null;
  let currentTaskSession = null;
  let currentQuiz = null;
  let currentQuizId = null;
  let taskPassed = false;

  function reset() {
    lessonId = null;
    steps = [];
    stepIndex = 0;
    state = 'idle';
    currentTask = null;
    currentTaskId = null;
    currentTaskSession = null;
    currentQuiz = null;
    currentQuizId = null;
    taskPassed = false;
  }

  function isActive() {
    return lessonId !== null;
  }

  function currentState() {
    return state;
  }

  function start(newLessonId, md) {
    reset();
    lessonId = newLessonId;
    const parsed = parseLesson(md);
    steps = parsed.steps;
    setLessonTotal(lessonId, parsed.quizCount, parsed.terminalCount);
    advance();
  }

  function advance() {
    while (stepIndex < steps.length) {
      const step = steps[stepIndex];
      if (step.type === 'text') {
        renderTextLines(step.lines, ui.getScrollback ? ui.getScrollback() : document.getElementById('scrollback'), ui);
        stepIndex++;
      } else if (step.type === 'terminal') {
        if (isTerminalDone(`${lessonId}-${step.id}`)) {
          ui.appendComment(`задача: ${step.data.task}`);
          ui.appendSuccess('Задача выполнена ✓');
          stepIndex++;
          continue;
        }
        currentTask = step.data;
        currentTaskId = step.id;
        taskPassed = false;
        const shell = step.data.shell || getUserShell();
        currentTaskSession = Simulator.createSession(Object.assign({}, step.data.setup || {}, { shell }));
        ui.setPrompt(shell, currentTaskSession.cwd);
        ui.appendComment(`задача: ${step.data.task}`);
        state = 'terminal';
        stepIndex++;
        return;
      } else if (step.type === 'quiz') {
        if (isQuizDone(`${lessonId}-${step.id}`)) {
          renderQuiz(step.data, true);
          stepIndex++;
          continue;
        }
        currentQuiz = step.data;
        currentQuizId = step.id;
        renderQuiz(step.data, false);
        state = 'quiz';
        stepIndex++;
        return;
      }
    }
    finishLesson();
  }

  function renderQuiz(data, done) {
    ui.appendLine(`[?] ${data.question}`, 'quiz-question');
    data.options.forEach((opt, i) => {
      ui.appendLine(`${LETTERS[i]}) ${opt}`, 'quiz-option');
    });
    if (done) {
      ui.appendSuccess('Верно');
      if (data.explanation) ui.appendComment(data.explanation);
    }
  }

  function finishLesson() {
    state = 'idle';
    currentTask = null;
    currentTaskSession = null;
    currentQuiz = null;
    ui.setPrompt(getUserShell(), '/home/user');
    ui.appendComment('урок завершён. Набери дальше, чтобы перейти к следующему.');
    if (onDone) onDone(lessonId);
  }

  function isUnknownCommandError(stdout) {
    return /command not found/.test(String(stdout || ''));
  }

  function runTaskCommand(raw) {
    const line = raw.trim();
    if (!line) return;

    if (line === 'подсказка') {
      ui.appendLine(currentTask.hint || 'Попробуй выполнить команду из условия.', 'hint');
      return;
    }
    if (line === 'решение') {
      const sol = Array.isArray(currentTask.solution) ? currentTask.solution.join('\n') : '';
      ui.appendLine(sol || 'Решение не задано.', 'solution');
      return;
    }

    ui.appendCommandLine(line);
    const result = Simulator.exec(currentTaskSession, line);
    if (result.clear) {
      ui.clearScrollback();
    } else if (result.stdout) {
      if (result.exit !== 0 && isUnknownCommandError(result.stdout)) {
        ui.appendError(`bash: ${line.split(/\s+/)[0]}: команда не найдена`);
        ui.appendLine('набери помощь', 'comment');
      } else {
        ui.appendLines(result.stdout, 'output');
      }
    }
    ui.setPrompt(currentTaskSession.shell, currentTaskSession.cwd);

    if (!taskPassed) {
      const check = Simulator.runChecks(currentTaskSession, currentTask.check || []);
      if (check.passed) {
        taskPassed = true;
        ui.appendSuccess('Задача выполнена ✓');
        markTerminal(lessonId, `${lessonId}-${currentTaskId}`);
        state = 'idle';
        currentTask = null;
        currentTaskSession = null;
        advance();
      }
    }
  }

  function runQuizAnswer(raw) {
    const answer = raw.trim().toLowerCase();
    const idx = LETTERS.indexOf(answer);
    if (idx < 0 || idx >= currentQuiz.options.length) {
      ui.appendError('ответь буквой: a, b или c');
      return;
    }
    if (idx === currentQuiz.answer) {
      ui.appendSuccess('Верно');
      if (currentQuiz.explanation) ui.appendComment(currentQuiz.explanation);
      markQuiz(lessonId, `${lessonId}-${currentQuizId}`);
      state = 'idle';
      currentQuiz = null;
      advance();
    } else {
      ui.appendError('неверно');
    }
  }

  function handleInput(raw) {
    if (state === 'terminal') {
      runTaskCommand(raw);
      return;
    }
    if (state === 'quiz') {
      runQuizAnswer(raw);
      return;
    }
  }

  function getCurrentSession() {
    if (state === 'terminal' && currentTaskSession) return currentTaskSession;
    return null;
  }

  function setTaskShell(shell) {
    if (state === 'terminal' && currentTaskSession) {
      currentTaskSession.shell = shell;
      ui.setPrompt(shell, currentTaskSession.cwd);
    }
  }

  return {
    start,
    reset,
    isActive,
    currentState,
    handleInput,
    getCurrentSession,
    setTaskShell,
    lessonId: () => lessonId
  };
}
