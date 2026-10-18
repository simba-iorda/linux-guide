const fs = require('fs');
const path = require('path');
const sim = require('/home/sevastyan/linux-tutorial/assets/js/simulator.js');

const dir = '/home/sevastyan/linux-tutorial/content/lessons';
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

// manifest <-> files
let problems = [];
const ids = manifest.map(e => e.id);
for (const id of ids) {
  if (!fs.existsSync(path.join(dir, id + '.md'))) problems.push(`manifest: нет файла ${id}.md`);
}
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
for (const f of files) {
  if (!ids.includes(f.replace(/\.md$/, ''))) problems.push(`файл ${f} отсутствует в manifest`);
}

let total = 0, quizCount = 0, failed = 0;
for (const entry of manifest) {
  const md = fs.readFileSync(path.join(dir, entry.id + '.md'), 'utf8');
  // quiz blocks: JSON must parse
  const qre = /```quiz\s*\n([\s\S]*?)```/g;
  let qm;
  while ((qm = qre.exec(md)) !== null) {
    quizCount++;
    try { JSON.parse(qm[1]); } catch (e) { problems.push(`${entry.id}: quiz JSON: ${e.message}`); }
  }
  // terminal blocks: full solution run + checks
  const tre = /```terminal\s*\n([\s\S]*?)```/g;
  let tm, idx = 0;
  while ((tm = tre.exec(md)) !== null) {
    idx++; total++;
    let block;
    try { block = JSON.parse(tm[1]); }
    catch (e) { failed++; console.log(`FAIL ${entry.id}#${idx}: JSON: ${e.message}`); continue; }
    const session = sim.createSession(block.setup);
    let execErr = null;
    for (const cmd of block.solution || []) {
      const r = sim.exec(session, cmd);
      if (r && r.exit != null && r.exit !== 0) {
        execErr = `"${cmd}" -> exit ${r.exit}: ${String(r.stdout || '').trim().slice(0, 90)}`;
        break;
      }
    }
    if (execErr) { failed++; console.log(`FAIL ${entry.id}#${idx}: ${execErr}`); continue; }
    const res = sim.runChecks(session, block.check);
    if (res.passed) console.log(`PASS ${entry.id}#${idx}`);
    else { failed++; console.log(`FAIL ${entry.id}#${idx}: ${JSON.stringify(res.failures)}`); }
  }
}

// canned outputs contract (lesson 10 reliance)
const s = sim.createSession({});
const uname = sim.exec(s, 'uname -a');
if (!/Linux/.test(uname.stdout || '')) problems.push('uname -a не содержит "Linux"');
const free = sim.exec(s, 'free -h');
if (!/total/.test(free.stdout || '')) problems.push('free -h не содержит "total"');
const man = sim.exec(s, 'man apt');
if (!/apt/.test(man.stdout || '')) problems.push('man apt не содержит "apt"');

console.log(`\nterminal tasks: ${total - failed}/${total} passed, quiz blocks: ${quizCount}`);
if (problems.length) { console.log('PROBLEMS:'); problems.forEach(p => console.log(' - ' + p)); process.exit(1); }
if (failed) process.exit(1);
console.log('OK: e2e полностью зелёный');
