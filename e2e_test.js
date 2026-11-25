const fs = require('fs');
const path = require('path');
const sim = require('./assets/js/simulator.js');

const dir = path.join(__dirname, 'content', 'lessons');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const lessons = manifest.lessons, modules = manifest.modules;
const problems = [];

// manifest <-> modules
const modNums = new Set(modules.map(m => m.num));
for (const l of lessons) if (!modNums.has(l.module)) problems.push(`урок ${l.id}: module ${l.module} не описан в manifest.modules`);

// manifest <-> files
for (const l of lessons) if (!fs.existsSync(path.join(dir, l.id + '.md'))) problems.push(`manifest: нет файла ${l.id}.md`);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
for (const f of files) if (!lessons.some(l => l.id === f.replace(/\.md$/, ''))) problems.push(`лишний файл ${f} (нет в manifest)`);

let total = 0, quizCount = 0, failed = 0;
for (const l of lessons) {
  const md = fs.readFileSync(path.join(dir, l.id + '.md'), 'utf8');
  // front-matter
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) problems.push(`${l.id}: нет front-matter`);
  else {
    for (const key of ['id', 'title', 'module', 'minutes', 'level', 'outcome'])
      if (!new RegExp(`^${key}:`, 'm').test(fm[1])) problems.push(`${l.id}: нет ${key} во front-matter`);
    if (!fm[1].match(/^id:\s*(.+)$/m) || fm[1].match(/^id:\s*(.+)$/m)[1].trim() !== l.id) problems.push(`${l.id}: front-matter id != имя файла`);
  }
  // ped sections order
  const order = ['Зачем это тебе', 'Как это работает', 'Попробуй', 'Проверь себя', 'Итог дня'];
  let pos = -1;
  for (const s of order) {
    const i = md.indexOf(`## ${s}`);
    if (i < 0) { problems.push(`${l.id}: нет секции «${s}»`); continue; }
    if (i < pos) problems.push(`${l.id}: секция «${s}» нарушает порядок`);
    pos = i;
  }
  if (!md.includes('Для любопытных')) problems.push(`${l.id}: нет блока «Для любопытных»`);
  // IDs are explicit so editing the lesson does not move someone’s progress.
  const ids = new Set();
  const addId = block => {
    if (typeof block.id !== 'string' || !block.id || ids.has(block.id)) problems.push(`${l.id}: отсутствует или повторяется ID ${block.id || 'блока'}`);
    ids.add(block.id);
  };
  // quiz blocks
  const qre = /```quiz\s*\n([\s\S]*?)```/g;
  let qm;
  while ((qm = qre.exec(md)) !== null) {
    quizCount++;
    try {
      const q = JSON.parse(qm[1]);
      addId(q);
      if (!Array.isArray(q.options) || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) problems.push(`${l.id}: битый quiz`);
    } catch (e) { problems.push(`${l.id}: quiz JSON: ${e.message}`); }
  }
  // terminal blocks: full run
  const tre = /```terminal\s*\n([\s\S]*?)```/g;
  let tm, idx = 0;
  while ((tm = tre.exec(md)) !== null) {
    idx++; total++;
    let b;
    try { b = JSON.parse(tm[1]); }
    catch (e) { failed++; console.log(`FAIL ${l.id}#${idx}: JSON: ${e.message}`); continue; }
    addId(b);
    const session = sim.createSession(b.setup);
    let execErr = null;
    for (const [step, cmd] of (b.solution || []).entries()) {
      const result = sim.exec(session, cmd);
      if (result.exit !== (b.expectedExit?.[step] ?? 0)) {
        execErr = `"${cmd}" -> exit ${result.exit}: ${(result.stderr || result.stdout).trim().slice(0, 90)}`;
        break;
      }
    }
    if (execErr) { failed++; console.log(`FAIL ${l.id}#${idx}: ${execErr}`); continue; }
    const res = sim.runChecks(session, b.check);
    if (res.passed) console.log(`PASS ${l.id}#${idx}`);
    else { failed++; console.log(`FAIL ${l.id}#${idx}: ${JSON.stringify(res.failures)}`); }
  }
}

// canned contracts
const s = sim.createSession({});
if (!/Linux/.test(sim.exec(s, 'uname -a').stdout || '')) problems.push('uname -a без "Linux"');
if (!/total/.test(sim.exec(s, 'free -h').stdout || '')) problems.push('free -h без "total"');
if (!/apt/.test(sim.exec(s, 'man apt').stdout || '')) problems.push('man apt без "apt"');
const ps = sim.exec(s, 'ps');
const pid = (String(ps.stdout || '').match(/\s+(\d+)\s+/) || [])[1];
if (!pid) problems.push('ps без PID');
else if (sim.exec(sim.createSession({}), `kill ${pid}`).exit !== 0) problems.push(`kill ${pid} не работает`);

console.log(`\nterminal: ${total - failed}/${total}, quiz: ${quizCount}, уроков: ${lessons.length}`);
if (problems.length) { console.log('ПРОБЛЕМЫ:'); problems.forEach(p => console.log(' - ' + p)); }
process.exit(failed || problems.length ? 1 : 0);
