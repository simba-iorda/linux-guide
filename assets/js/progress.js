const KEY = 'linux-tutorial-progress';
const LAST_KEY = 'linux-tutorial-last-lesson';

function emptyProgress() {
  return { quizzes: {}, terminals: {}, lessons: {}, attempts: {}, challenges: {} };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved === 'object') return { ...emptyProgress(), ...saved };
  } catch {
    // Storage may be unavailable in private or embedded browsers.
  }
  return emptyProgress();
}

let data = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {
    // The session can still continue in memory.
  }
}

export function setLessonTotal(lessonId, quizIds, taskIds) {
  data.lessons[lessonId] = { quizIds, taskIds };
  save();
}

export function isLessonDone(lessonId) {
  const lesson = data.lessons[lessonId];
  if (!lesson) return false;
  if (!lesson.quizIds || !lesson.taskIds) return lesson.done === true;
  return lesson.quizIds.every(id => isQuizDone(id)) && lesson.taskIds.every(id => isTerminalDone(id));
}

export function isQuizDone(id) {
  return data.quizzes[id] === true;
}

export function isTerminalDone(id) {
  return data.terminals[id] === true;
}

export function markQuiz(id) {
  data.quizzes[id] = true;
  save();
}

export function markTerminal(id) {
  data.terminals[id] = true;
  delete data.attempts[id];
  save();
}

export function getAttempt(id) {
  return data.attempts[id] ? structuredClone(data.attempts[id]) : null;
}

export function setAttempt(id, attempt) {
  if (attempt === null) delete data.attempts[id];
  else data.attempts[id] = structuredClone(attempt);
  save();
}

export function getChallengeProgress(id) {
  return data.challenges[id] || { passed: false, attempts: 0 };
}

export function setChallengeProgress(id, progress) {
  data.challenges[id] = progress;
  save();
}

export function getLocation() {
  if (data.location) return data.location;
  if (typeof data.currentLesson === 'number') return { legacyIndex: data.currentLesson };
  try {
    const idx = localStorage.getItem(LAST_KEY);
    if (idx !== null && Number.isInteger(Number(idx))) return { legacyIndex: Number(idx) };
  } catch {
    // Optional legacy storage.
  }
  return null;
}

export function setLocation(location) {
  data.location = location;
  save();
}

export function resetProgress() {
  data = emptyProgress();
  save();
  try { localStorage.removeItem(LAST_KEY); } catch {
    // Optional legacy storage.
  }
}

export function getLegacyModule() {
  return data.legacyModule || 1;
}

export function setLegacyModule(module) {
  data.legacyModule = module;
  save();
}
