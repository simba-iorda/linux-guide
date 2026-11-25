import { getAttempt, setAttempt, getChallengeProgress, setChallengeProgress } from './progress.js';

const Simulator = globalThis.TerminalSimulator;

export function createChallengeEngine({ ui, onChange, onPass }) {
  let challenge = null;
  let attempt = null;

  function saveAttempt() {
    setAttempt(challenge.id, attempt);
    onChange();
  }

  function start(definition) {
    challenge = definition;
    attempt = getAttempt(challenge.id);
    if (!attempt) newAttempt();
    else describe();
    ui.setPrompt(attempt.session.cwd);
    onChange();
  }

  function newAttempt() {
    const progress = getChallengeProgress(challenge.id);
    setChallengeProgress(challenge.id, { ...progress, attempts: progress.attempts + 1 });
    attempt = {
      session: Simulator.createSession(challenge.setup),
      number: progress.attempts + 1,
      hintsUsed: 0,
      phase: 'playing',
      restartPending: false
    };
    ui.clearScrollback();
    ui.setPrompt(attempt.session.cwd);
    describe();
    saveAttempt();
  }

  function describe() {
    ui.appendLine(challenge.title, 'challenge-title');
    ui.appendLine(challenge.brief);
    const list = document.createElement('ol');
    list.className = 'challenge-goals';
    for (const goal of challenge.goals) {
      const item = document.createElement('li');
      item.textContent = goal.text;
      list.append(item);
    }
    ui.appendRaw(list);
    ui.appendComment('Порядок и команды выбираешь сам. Утрата исходных данных или остановка нужного процесса завершает попытку.');
    ui.appendComment('проверить · подсказка · заново');
    if (attempt.phase === 'failed') ui.appendError('Попытка завершена. Введи «заново», чтобы восстановить исходное состояние.');
    if (attempt.phase === 'passed') ui.appendSuccess('Испытание пройдено. Введи «дальше».');
  }

  function checkGoals() {
    const solved = challenge.goals.map(goal => Simulator.runChecks(attempt.session, goal.checks).passed);
    if (solved.every(Boolean)) {
      attempt.phase = 'passed';
      const progress = getChallengeProgress(challenge.id);
      setChallengeProgress(challenge.id, { ...progress, passed: true });
      saveAttempt();
      ui.appendSuccess(`Все цели выполнены. Испытание пройдено за попытку №${attempt.number}.`);
      onPass();
      return;
    }
    const missing = solved.flatMap((done, index) => done ? [] : [index + 1]);
    ui.appendLine(`Выполнено ${solved.length - missing.length}/${solved.length}. Проверь цели № ${missing.join(', ')}.`, 'warn');
  }

  function handleInput(line) {
    const command = line.toLowerCase();
    if (command === 'задание' || command === 'статус') { describe(); return; }
    if (command === 'заново' || command === 'restart') {
      if (attempt.phase !== 'playing') newAttempt();
      else {
        attempt.restartPending = true;
        saveAttempt();
        ui.appendLine('Начать с чистого состояния? Введи «заново подтвердить».', 'warn');
      }
      return;
    }
    if (command === 'заново подтвердить' && attempt.restartPending) { newAttempt(); return; }
    if (attempt.phase !== 'playing') {
      ui.appendComment(attempt.phase === 'passed' ? 'Введи «дальше» или «заново».' : 'Введи «заново» для новой попытки.');
      return;
    }
    if (attempt.restartPending) {
      attempt.restartPending = false;
      saveAttempt();
    }
    if (command === 'подсказка' || command === 'hint') {
      const hint = challenge.hints[attempt.hintsUsed];
      if (!hint) { ui.appendComment('Подсказки на эту попытку закончились.'); return; }
      attempt.hintsUsed++;
      saveAttempt();
      ui.appendLine(hint, 'hint');
      return;
    }
    if (command === 'проверить' || command === 'check') { checkGoals(); return; }
    if (command === 'решение') { ui.appendComment('Есть короткие подсказки. Введи «подсказка».'); return; }
    ui.appendCommandLine(line);
    const result = Simulator.exec(attempt.session, line);
    if (result.stdout) ui.appendLines(result.stdout);
    if (result.stderr) ui.appendLines(result.stderr, 'error');
    ui.setPrompt(attempt.session.cwd);

    if (!Simulator.runChecks(attempt.session, challenge.critical).passed) {
      attempt.phase = 'failed';
      ui.appendError('Потеряны исходные данные или остановлен нужный процесс. Испытание завершено. Введи «заново».');
    }
    saveAttempt();
  }

  return {
    start,
    describe,
    handleInput,
    stop() { challenge = null; attempt = null; },
    session: () => attempt?.session,
    state: () => attempt && { phase: attempt.phase, number: attempt.number, hintsLeft: challenge.hints.length - attempt.hintsUsed }
  };
}
