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

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isInlineTag(tag) {
  return ['code', 'strong', 'em', 'b', 'i', 'u', 's', 'a', 'span', 'small', 'sub', 'sup', 'mark', 'br', 'kbd'].includes(tag);
}

function buildInlineHtml(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent;
    // Collapse internal whitespace to a single space, but keep leading/trailing?
    return escapeHtml(t.replace(/\s+/g, ' '));
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return '<br>';
  const inner = Array.from(node.childNodes).map(buildInlineHtml).join('');
  if (tag === 'code' || tag === 'kbd') return `<code>${inner}</code>`;
  if (tag === 'strong' || tag === 'b') return `<strong>${inner}</strong>`;
  if (tag === 'em' || tag === 'i') return `<em>${inner}</em>`;
  if (tag === 'a') {
    const href = escapeHtml(node.getAttribute('href') || '');
    return `<a href="${href}" class="link">${inner}</a>`;
  }
  return inner;
}

function endsWithSpace(s) {
  return /\s$/.test(String(s));
}

function flushInlineBuffer(buffer, prefix, out, className = 'output') {
  if (!buffer.length) return;
  const html = buffer.join('').trim();
  if (!html) return;
  out.push({ className, html: escapeHtml(prefix) + html });
}

function InlineBuffer(prefix, out, className = 'output') {
  this.buffer = [];
  this.pendingSpace = false;
  this.flush = function () {
    flushInlineBuffer(this.buffer, prefix, out, className);
    this.buffer = [];
    this.pendingSpace = false;
  };
  this.addText = function (text) {
    const trimmed = text.trim();
    if (trimmed) {
      const startsWithSpace = /^\s/.test(text);
      if ((this.pendingSpace || startsWithSpace) && this.buffer.length && !endsWithSpace(this.buffer[this.buffer.length - 1])) {
        this.buffer.push(' ');
      }
      this.buffer.push(escapeHtml(trimmed));
      this.pendingSpace = /\s$/.test(text);
    } else {
      if (this.buffer.length && !endsWithSpace(this.buffer[this.buffer.length - 1])) {
        this.pendingSpace = true;
      }
    }
  };
  this.addInline = function (html) {
    if (this.pendingSpace && this.buffer.length && !endsWithSpace(this.buffer[this.buffer.length - 1])) {
      this.buffer.push(' ');
    }
    this.buffer.push(html);
    this.pendingSpace = false;
  };
}

function processList(listEl, prefix, out) {
  for (const li of listEl.children) {
    if (li.tagName.toLowerCase() !== 'li') continue;
    const liPrefix = prefix + '- ';
    const buf = new InlineBuffer(liPrefix, out, 'output list-item');
    const nestedLists = [];
    for (const child of li.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        buf.addText(child.textContent);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (isInlineTag(tag)) {
          buf.addInline(buildInlineHtml(child));
        } else if (tag === 'p') {
          for (const c of child.childNodes) {
            if (c.nodeType === Node.TEXT_NODE) buf.addText(c.textContent);
            else if (c.nodeType === Node.ELEMENT_NODE && isInlineTag(c.tagName.toLowerCase())) buf.addInline(buildInlineHtml(c));
          }
        } else if (tag === 'ul' || tag === 'ol') {
          nestedLists.push(child);
        }
      }
    }
    buf.flush();
    nestedLists.forEach(nl => processList(nl, prefix + '  ', out));
  }
}

function processNode(node, prefix, out) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const selfTag = node.tagName.toLowerCase();

    if (selfTag === 'table') {
      const rows = [];
      for (const row of node.querySelectorAll('tr')) {
        const cells = Array.from(row.querySelectorAll('td, th')).map(c => textContent(c).trim());
        if (cells.length) rows.push(cells);
      }
      if (rows.length) out.push({ type: 'table', rows });
      return;
    }

    if (selfTag === 'ul' || selfTag === 'ol') {
      processList(node, prefix, out);
      return;
    }

    if (selfTag === 'pre') {
      const code = node.querySelector('code');
      const raw = code ? code.textContent : node.textContent;
      const lines = raw.split('\n');
      const endsNl = raw.endsWith('\n');
      lines.forEach((l, i) => {
        if (i === lines.length - 1 && l === '' && endsNl) return;
        out.push({ className: 'code', text: prefix + l });
      });
      return;
    }

    if (selfTag === 'details') {
      const summary = node.querySelector('summary');
      const summaryText = summary ? textContent(summary).trim() : 'Подробнее';
      const childLines = [];
      for (const c of node.children) {
        if (c === summary) continue;
        processNode(c, '', childLines);
      }
      out.push({ type: 'details', summary: summaryText, lines: childLines });
      return;
    }

    if (selfTag === 'hr') {
      out.push({ className: 'comment', text: prefix + '---' });
      return;
    }

    if (selfTag === 'h1' || selfTag === 'h2') {
      out.push({ className: 'comment', text: prefix + '# ' + textContent(node).trim() });
      return;
    }

    if (selfTag === 'h3' || selfTag === 'h4' || selfTag === 'h5' || selfTag === 'h6') {
      out.push({ className: 'comment', text: prefix + '## ' + textContent(node).trim() });
      return;
    }
  }

  // Обычный контейнер (p, div, blockquote, td, li и т.п.): собираем инлайн
  // и рекурсивно обходим блочных детей.
  const buf = new InlineBuffer(prefix, out);
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      buf.addText(child.textContent);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName.toLowerCase();

    if (isInlineTag(tag)) {
      buf.addInline(buildInlineHtml(child));
      continue;
    }

    buf.flush();
    processNode(child, prefix, out);
  }
  buf.flush();
}

function htmlToLines(html) {
  const out = [];
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  processNode(wrapper, '', out);
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
      if (ui && ui.createTableBlock) {
        const block = ui.createTableBlock(line.rows);
        container.appendChild(block);
      } else {
        // fallback: простой список строк
        line.rows.forEach(r => appendLineTo(container, r.join(' | '), 'output'));
      }
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
      const el = document.createElement('div');
      el.className = 'line ' + (line.className || 'output');
      if (line.html != null) {
        el.innerHTML = line.html;
      } else {
        el.textContent = line.text;
      }
      container.appendChild(el);
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
        renderTextLines(step.lines, ui.getScrollback(), ui);
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

    const low = line.toLowerCase();
    if (low === 'подсказка' || low === 'hint') {
      ui.appendLine(currentTask.hint || 'Попробуй выполнить команду из условия.', 'hint');
      return;
    }
    if (low === 'решение' || low === 'solution') {
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
        ui.appendLine('это задача — вводи команды из условия, или набери подсказка', 'comment');
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
