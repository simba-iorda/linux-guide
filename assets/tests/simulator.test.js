/**
 * Smoke-тест логики симулятора v2.
 * Запуск: node assets/tests/simulator.test.js
 */
const assert = require('assert');
const sim = require('../js/simulator.js');

function check(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

// Базовые команды
const s0 = sim.createSession({});
check('pwd default home', sim.exec(s0, 'pwd').stdout.trim() === '/home/user');
check('uname contains Linux', /Linux/.test(sim.exec(s0, 'uname -a').stdout));
check('free contains total', /total/.test(sim.exec(s0, 'free -h').stdout));
check('man apt contains apt', /apt/.test(sim.exec(s0, 'man apt').stdout));

// Файловые операции
const s1 = sim.createSession({ setup: { cwd: '/home/user', tree: {} } });
sim.exec(s1, 'mkdir projects');
check('mkdir creates dir', sim.runChecks(s1, [{ type: 'path_is_dir', path: '/home/user/projects' }]).passed);
sim.exec(s1, 'touch projects/readme.txt');
check('touch creates file', sim.runChecks(s1, [{ type: 'path_is_file', path: '/home/user/projects/readme.txt' }]).passed);

// ps / kill
const s2 = sim.createSession({});
const psOut = sim.exec(s2, 'ps').stdout;
check('ps lists PIDs', /412/.test(psOut) && /780/.test(psOut) && /913/.test(psOut));
check('ps lists firefox', /firefox/.test(psOut));
const killOk = sim.exec(s2, 'kill 412');
check('kill valid PID exit 0', killOk.exit === 0);
const psAfter = sim.exec(s2, 'ps').stdout;
check('kill removed PID', !/412/.test(psAfter));
const killBad = sim.exec(s2, 'kill 99999');
check('kill invalid PID exit 1', killBad.exit === 1);
check('kill invalid PID message', /No such process/.test(killBad.stderr));

// ping
const ping = sim.exec(s0, 'ping example.com');
check('ping 4 packets', (ping.stdout.match(/icmp_seq=/g) || []).length === 4);
check('ping stats', /4 packets transmitted/.test(ping.stdout));

// curl
const curl = sim.exec(s0, 'curl http://example.com');
check('curl html', /<html>/.test(curl.stdout) && /example.com/.test(curl.stdout));

const bash = sim.createSession({ tree: { '.hidden': '', 'file with spaces': 'actual\n' } });
check('bash prompt', sim.getPrompt(bash) === 'user@linux:~$');
check('ls hides dotfiles', !sim.exec(bash, 'ls').stdout.includes('.hidden'));
check('ls -a shows dotfiles', sim.exec(bash, 'ls -a').stdout.includes('.hidden'));
check('single-quoted file name', sim.exec(bash, "cat 'file with spaces'").stdout.trim() === 'actual');
check('quoted operator', sim.exec(bash, 'echo ">"').stdout.trim() === '>');
check('attached redirection', sim.exec(bash, 'echo hi>out').exit === 0 && sim.exec(bash, 'cat out').stdout === 'hi\n');
const redirect = sim.exec(bash, 'ls missing > out 2> error');
check('redirection preserves failure', redirect.exit === 2);
check('stderr stays out of stdout', sim.exec(bash, 'cat out').stdout === '');
check('separate stderr', sim.exec(bash, 'cat error').stdout.includes('No such file'));
check('grep no matches is not success', sim.exec(bash, 'grep absent out').exit === 1);
check('failed move preserves source', sim.exec(bash, 'mv out missing/out').exit > 0 && !!sim.getNode(bash.fs, '/home/user/out'));
check('false output cannot pass', !sim.runChecks(bash, [{ type: 'output_contains', text: 'user', commands: ['whoami'] }]).passed);
sim.exec(bash, 'echo user');
check('echo cannot replace whoami', !sim.runChecks(bash, [{ type: 'output_contains', text: 'user', commands: ['whoami'] }]).passed);
sim.exec(bash, 'cd /');
check('bash prompt root', sim.getPrompt(bash) === 'user@linux:/$');
