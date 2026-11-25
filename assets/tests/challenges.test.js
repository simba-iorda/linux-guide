const assert = require('node:assert/strict');
const test = require('node:test');
const sim = require('../js/simulator.js');
const manifest = require('../../content/lessons/manifest.json');

const routes = [
  ['ls -a station', 'cd station/north/archive', 'cat index.txt > ~/station/checked.txt'],
  ['mkdir -p out/archive', 'mv "inbox/release note.txt" out', 'grep ERROR inbox/app.log > out/errors.txt', 'cp inbox/app.log out/archive', 'rm inbox/dead.tmp'],
  ['cp vault/token.txt token.backup', 'chmod 600 vault/token.txt token.backup', 'chmod u+x deploy.sh', 'chmod 700 vault'],
  ['free -h > memory.txt', 'ps aux | grep worker', 'kill 275', 'grep ERROR ops.log > incident.txt'],
  ['mkdir handoff', 'grep ERROR jobs.log | sort > handoff/errors.txt', 'grep -c ERROR jobs.log > handoff/count.txt', "echo 'export PAGER=less' >> .bashrc"],
  ['ping -c 4 app.training > ping.txt', 'curl http://app.training 2>http-error.txt', 'curl http://status.training >status.txt'],
  ['journalctl -u archive | grep ERROR > analysis.txt', 'cp crontab.txt schedule.backup', 'echo enabled=yes > archive.conf', 'systemctl restart archive'],
  ['mkdir handoff', 'cp portal.conf handoff/portal.conf.original', 'chmod 600 handoff/portal.conf.original', 'kill 412', 'grep ERROR incident.log > handoff/errors.txt', 'echo ready=yes > portal.conf', 'systemctl start portal', 'df -h > handoff/disk.txt', 'systemctl status portal > handoff/service.txt']
];

test('every module has a solvable challenge with persistent state', async t => {
  const { challenges } = await import('../../content/challenges/index.js');
  assert.equal(challenges.length, manifest.modules.length);
  assert.equal(new Set(challenges.map(challenge => challenge.id)).size, challenges.length);
  for (const [index, challenge] of challenges.entries()) {
    await t.test(challenge.title, () => {
      let session = sim.createSession(challenge.setup);
      assert.ok(sim.runChecks(session, challenge.critical).passed);
      assert.ok(challenge.goals.every(goal => !sim.runChecks(session, goal.checks).passed));
      for (const line of routes[index]) {
        const result = sim.exec(session, line);
        const expectedExit = line.startsWith('curl http://app.training ') ? 7 : 0;
        assert.equal(result.exit, expectedExit, line + '\n' + result.stderr);
        assert.ok(sim.runChecks(session, challenge.critical).passed, line);
        session = JSON.parse(JSON.stringify(session));
      }
      for (const goal of challenge.goals) assert.ok(sim.runChecks(session, goal.checks).passed, goal.text);
    });
  }
});

test('losing a source or stopping a protected process invalidates the attempt', async () => {
  const { challenges } = await import('../../content/challenges/index.js');
  const cases = [[0, 'rm -rf station'], [1, 'echo changed > inbox/app.log'], [3, 'kill 984'], [7, 'kill 913']];
  for (const [index, line] of cases) {
    const challenge = challenges[index];
    const session = sim.createSession(challenge.setup);
    assert.equal(sim.exec(session, line).exit, 0);
    assert.ok(!sim.runChecks(session, challenge.critical).passed, line);
    assert.ok(sim.runChecks(sim.createSession(challenge.setup), challenge.critical).passed);
  }
});

test('a file with copied output text does not prove the network check', async () => {
  const { challenges } = await import('../../content/challenges/index.js');
  const challenge = challenges[5];
  const session = sim.createSession(challenge.setup);
  sim.exec(session, 'echo "Connection refused" > http-error.txt');
  assert.ok(!sim.runChecks(session, challenge.goals[1].checks).passed);
});
