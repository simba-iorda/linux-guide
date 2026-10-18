/**
 * progress.js — учёт прогресса в localStorage.
 */
const KEY = 'linux-tutorial-progress';

let data = load();
let changeCallback = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore
  }
  return { quizzes: {}, terminals: {}, lessons: {} };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    // ignore
  }
  if (changeCallback) changeCallback();
}

export function setLessonTotal(lessonId, quizCount, terminalCount) {
  if (!data.lessons[lessonId]) {
    data.lessons[lessonId] = { quizCount: 0, terminalCount: 0, done: false };
  }
  data.lessons[lessonId].quizCount = quizCount;
  data.lessons[lessonId].terminalCount = terminalCount;
  updateLesson(lessonId);
}

function countDone(prefix) {
  return Object.keys(data[prefix]).filter(k => data[prefix][k]).length;
}

function countDoneByLesson(prefix, lessonId) {
  const prefixStr = lessonId + '-';
  return Object.keys(data[prefix]).filter(k => k.startsWith(prefixStr) && data[prefix][k]).length;
}

function isLessonDone(lessonId) {
  const l = data.lessons[lessonId];
  if (!l) return false;
  const qDone = countDoneByLesson('quizzes', lessonId);
  const tDone = countDoneByLesson('terminals', lessonId);
  return qDone >= l.quizCount && tDone >= l.terminalCount;
}

function updateLesson(lessonId) {
  const l = data.lessons[lessonId];
  if (!l) return;
  const wasDone = l.done;
  l.done = isLessonDone(lessonId);
  if (l.done !== wasDone) save();
}

export function markQuiz(lessonId, quizId) {
  if (data.quizzes[quizId]) return;
  data.quizzes[quizId] = true;
  save();
  updateLesson(lessonId);
}

export function markTerminal(lessonId, taskId) {
  if (data.terminals[taskId]) return;
  data.terminals[taskId] = true;
  save();
  updateLesson(lessonId);
}

export function isQuizDone(id) {
  return !!data.quizzes[id];
}

export function isTerminalDone(id) {
  return !!data.terminals[id];
}

export function isLessonDoneExported(id) {
  return isLessonDone(id);
}

export function completedLessons(lessonIds) {
  return lessonIds.filter(id => isLessonDone(id));
}

export function resetProgress() {
  data = { quizzes: {}, terminals: {}, lessons: {} };
  save();
}

export function onChange(cb) {
  changeCallback = cb;
}
