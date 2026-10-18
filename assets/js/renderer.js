/**
 * renderer.js — рендер урока: Markdown + квизы + терминалы.
 */
import { createQuiz } from './quiz.js';
import { createTerminal } from './terminal.js';
import { setLessonTotal } from './progress.js';

const marked = globalThis.marked;

function stripFrontmatter(md) {
  return md.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export function renderLesson(md, lessonId) {
  md = stripFrontmatter(md);
  const blocks = [];
  let blockIndex = 0;

  const html = md.replace(/^```(quiz|terminal)\s*\n([\s\S]*?)\n```$/gm, (match, type, body) => {
    let data;
    try {
      data = JSON.parse(body.trim());
    } catch (e) {
      return `<pre class="block-error">Ошибка в блоке ${type}: ${e.message}</pre>`;
    }
    const id = `${lessonId}-${type}-${blockIndex++}`;
    blocks.push({ id, type, data });
    return `<div class="${type}-placeholder" data-block-id="${id}"></div>`;
  });

  const root = document.createElement('article');
  root.className = 'lesson';
  root.innerHTML = marked.parse(html);

  // Разворачиваем плейсхолдеры, если marked обернул их в абзац
  root.querySelectorAll('.quiz-placeholder, .terminal-placeholder').forEach(ph => {
    if (ph.parentElement && ph.parentElement.tagName === 'P') {
      const p = ph.parentElement;
      while (p.firstChild) p.parentNode.insertBefore(p.firstChild, p);
      p.remove();
    }
  });

  const quizCount = blocks.filter(b => b.type === 'quiz').length;
  const terminalCount = blocks.filter(b => b.type === 'terminal').length;
  setLessonTotal(lessonId, quizCount, terminalCount);

  blocks.forEach(block => {
    const ph = root.querySelector(`[data-block-id="${block.id}"]`);
    if (!ph) return;
    const node = block.type === 'quiz'
      ? createQuiz(block.data, lessonId, block.id)
      : createTerminal(block.data, lessonId, block.id);
    ph.replaceWith(node);
  });

  return { root, quizCount, terminalCount };
}

export function renderCheatSheet(md) {
  const root = document.createElement('article');
  root.className = 'cheatsheet';
  root.innerHTML = marked.parse(stripFrontmatter(md));
  return root;
}
