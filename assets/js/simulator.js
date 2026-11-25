/**
 * simulator.js — чистая логика терминала для учебника «Linux за 2 месяца».
 * Не зависит от DOM, может быть require()-нут из Node для smoke-тестов.
 */
(function () {
  'use strict';

  const ENV = { HOME: '/home/user', USER: 'user' };

  /* ---------- маленькие утилиты ---------- */
  const now = () => Date.now();

  function makeDir(children, mtime) {
    return { type: 'dir', children: Object.assign(Object.create(null), children), mode: 0o755, mtime: mtime || now() };
  }

  function makeFile(content, mtime) {
    const text = content == null ? '' : String(content);
    return { type: 'file', content: text, mode: 0o644, mtime: mtime || now(), size: text.length };
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function basename(absPath) {
    const parts = absPath.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '/';
  }

  function dirname(absPath) {
    const parts = absPath.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
  }

  function normalizePath(input, cwd) {
    if (!input) return cwd || ENV.HOME;
    let p = input;
    if (p === '~' || p.startsWith('~/')) p = ENV.HOME + p.slice(1);
    if (!p.startsWith('/')) p = (cwd || ENV.HOME) + '/' + p;
    const parts = p.split('/').filter(Boolean);
    const stack = [];
    for (const part of parts) {
      if (part === '..') stack.pop();
      else if (part !== '.') stack.push(part);
    }
    return '/' + stack.join('/');
  }

  function getPrompt(session) {
    const cwd = session.cwd;
    const path = cwd === ENV.HOME || cwd.startsWith(ENV.HOME + '/') ? '~' + cwd.slice(ENV.HOME.length) : cwd;
    return `user@linux:${path}$`;
  }

  /* ---------- файловая модель ---------- */
  function buildBaseFS() {
    return makeDir({ home: makeDir({ user: makeDir() }) });
  }

  function mergeTree(dirNode, tree) {
    for (const [name, val] of Object.entries(tree)) {
      if (val && typeof val === 'object') {
        dirNode.children[name] = makeDir();
        mergeTree(dirNode.children[name], val);
      } else {
        dirNode.children[name] = makeFile(val);
      }
    }
  }

  function buildFS(tree) {
    const root = buildBaseFS();
    const userDir = root.children.home.children.user;
    mergeTree(userDir, tree || {});
    return root;
  }

  function getNode(root, absPath) {
    if (absPath === '/') return root;
    const parts = absPath.split('/').filter(Boolean);
    let node = root;
    for (const part of parts) {
      if (node.type !== 'dir') return undefined;
      node = Object.hasOwn(node.children, part) ? node.children[part] : undefined;
      if (!node) return undefined;
    }
    return node;
  }

  function getParent(root, absPath) {
    const parts = absPath.split('/').filter(Boolean);
    const name = parts.pop();
    let node = root;
    for (const part of parts) {
      if (node.type !== 'dir') return { parent: null, name };
      node = Object.hasOwn(node.children, part) ? node.children[part] : undefined;
      if (!node) return { parent: null, name };
    }
    return { parent: node.type === 'dir' ? node : null, name };
  }

  function pathExists(root, absPath) {
    return !!getNode(root, absPath);
  }

  function ensureDir(root, absPath) {
    const parts = absPath.split('/').filter(Boolean);
    let node = root;
    for (const part of parts) {
      if (node.type !== 'dir') return false;
      if (!Object.hasOwn(node.children, part)) {
        Object.defineProperty(node.children, part, { value: makeDir(), writable: true, enumerable: true, configurable: true });
      }
      node = Object.hasOwn(node.children, part) ? node.children[part] : undefined;
    }
    return true;
  }

  function setNode(root, absPath, node) {
    const { parent, name } = getParent(root, absPath);
    if (!parent) return false;
    Object.defineProperty(parent.children, name, { value: node, writable: true, enumerable: true, configurable: true });
    return true;
  }

  function removeNode(root, absPath) {
    const { parent, name } = getParent(root, absPath);
    if (!parent || !Object.hasOwn(parent.children, name)) return false;
    delete parent.children[name];
    return true;
  }

  function copyNode(node) {
    if (node.type === 'file') return { ...node };
    const copy = makeDir({}, node.mtime);
    copy.mode = node.mode;
    for (const [k, v] of Object.entries(node.children)) copy.children[k] = copyNode(v);
    return copy;
  }

  /* ---------- процессы по умолчанию ---------- */
  function defaultProcesses() {
    return [
      { pid: 1, cmd: 'systemd', user: 'root', cpu: 0.0, mem: 0.1, vsz: 168, rss: 4, time: '00' },
      { pid: 412, cmd: 'sleep', user: 'user', cpu: 0.0, mem: 0.0, vsz: 4, rss: 1, time: '02' },
      { pid: 780, cmd: 'bash', user: 'user', cpu: 0.0, mem: 0.1, vsz: 16, rss: 4, time: '00' },
      { pid: 913, cmd: 'firefox', user: 'user', cpu: 5.2, mem: 8.5, vsz: 1200, rss: 850, time: '15' },
      { pid: 1024, cmd: 'node', user: 'user', cpu: 2.1, mem: 3.2, vsz: 600, rss: 300, time: '01' },
      { pid: 2042, cmd: 'python3', user: 'user', cpu: 0.8, mem: 1.5, vsz: 300, rss: 150, time: '00' }
    ];
  }

  /* ---------- парсер командной строки ---------- */
  function parseLine(line, env) {
    const tokens = [];
    let word = '';
    let started = false;
    let quote = '';
    const flush = () => {
      if (started) tokens.push({ word });
      word = '';
      started = false;
    };

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];
      if (char === quote) { quote = ''; continue; }
      if (!quote && (char === '"' || char === "'")) { quote = char; started = true; continue; }
      if (char === '\\' && (!quote || (quote === '"' && ['"', '$', '\\'].includes(next)))) {
        if (next === undefined) throw new Error('незавершённое экранирование');
        word += next;
        started = true;
        i++;
        continue;
      }
      if (!quote && /\s/.test(char)) { flush(); continue; }
      if (!quote && ['|', '>', '<', ';', '&'].includes(char)) {
        const errorRedirect = char === '>' && word === '2' && started && /(?:^|[\s|;&])2$/.test(line.slice(0, i));
        if (errorRedirect) { word = ''; started = false; }
        flush();
        const paired = next === char && ['>', '|', '&'].includes(char);
        tokens.push({ op: (errorRedirect ? '2' : '') + char + (paired ? char : '') });
        if (paired) i++;
        continue;
      }
      if (char === '$' && quote !== "'") {
        if (next === '(') throw new Error('подстановка команд пока недоступна');
        const variable = line.slice(i + 1).match(/^(?:[A-Za-z_][A-Za-z_0-9]*|\?)/);
        if (variable) {
          word += env[variable[0]] ?? '';
          started = true;
          i += variable[0].length;
          continue;
        }
      }
      if (!quote && char === '#' && !started) break;
      word += char;
      started = true;
    }
    if (quote) throw new Error('закрой кавычки');
    flush();
    return tokens;
  }

  function parsePipeline(tokens) {
    const stages = [];
    let stage = { argv: [], redirects: [] };
    let connector = ';';
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token.op) { stage.argv.push(token.word); continue; }
      if (['>', '>>', '2>', '2>>', '<'].includes(token.op)) {
        const target = tokens[++i];
        if (!target || target.op) throw new Error('укажи файл для перенаправления');
        stage.redirects.push({ op: token.op, path: target.word });
      } else {
        if (!stage.argv.length && !stage.redirects.length) throw new Error('ожидалась команда');
        if (token.op === '&') throw new Error('фоновые команды пока недоступны');
        stages.push({ ...stage, connector });
        stage = { argv: [], redirects: [] };
        connector = token.op;
      }
    }
    if (stage.argv.length || stage.redirects.length) stages.push({ ...stage, connector });
    else if (stages.length && connector !== ';') throw new Error('ожидалась команда после оператора');
    return stages;
  }

  /* ---------- форматирование ---------- */
  function fmtDate(mtime) {
    const d = new Date(mtime);
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    const day = String(d.getDate()).padStart(2, '0');
    const hr = String(d.getHours()).padStart(2, '0');
    const mn = String(d.getMinutes()).padStart(2, '0');
    return `${mo} ${day} ${hr}:${mn}`;
  }

  function fmtTime(mtime) {
    const d = new Date(mtime);
    const hr = String(d.getHours()).padStart(2, '0');
    const mn = String(d.getMinutes()).padStart(2, '0');
    return `${hr}:${mn}`;
  }

  function humanSize(bytes) {
    if (bytes < 1024) return String(bytes);
    const units = ['K', 'M', 'G', 'T'];
    let val = bytes / 1024;
    let i = 0;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return val.toFixed(1) + units[i];
  }

  function permissions(node) {
    const mode = node.mode ?? (node.type === 'dir' ? 0o755 : 0o644);
    const bits = Array.from('rwxrwxrwx', (letter, index) => (mode & (1 << (8 - index))) ? letter : '-').join('');
    return (node.type === 'dir' ? 'd' : '-') + bits;
  }

  function longLine(node, name, human) {
    const size = node.type === 'dir' ? 4096 : (node.size || 0);
    const sizeStr = human ? humanSize(size) : String(size);
    return `${permissions(node)} 1 ${ENV.USER} ${ENV.USER} ${sizeStr.padStart(5)} ${fmtDate(node.mtime)} ${name}`;
  }

  function ok() { return { stdout: '', exit: 0 }; }
  function err(msg, exit = 1) { return { stdout: '', stderr: msg + '\n', exit }; }

  /* ---------- команды ---------- */
  const COMMANDS = Object.create(null);

  COMMANDS.pwd = (argv, stdin, session) => ({ stdout: session.cwd + '\n', exit: 0 });

  COMMANDS.whoami = () => ({ stdout: ENV.USER + '\n', exit: 0 });

  COMMANDS.date = () => ({ stdout: new Date().toString() + '\n', exit: 0 });

  COMMANDS.clear = () => ({ stdout: '', exit: 0, clear: true });

  COMMANDS.help = (argv, stdin, session) => ({
    stdout:
      'Оболочка: Bash\n' +
      'Доступные команды:\n' +
      '  pwd, ls, cd, cat, head, tail, touch, mkdir, cp, mv, rm\n' +
      '  echo, grep, wc, tree, whoami, date, clear, history, help, man\n' +
      '  uname, df, free, ps, kill, ping, curl\n' +
      '  chmod, diff, find, sort, uniq, systemctl, journalctl\n',
    exit: 0
  });

  COMMANDS.history = (argv, stdin, session) => {
    return { stdout: session.history.map((c, i) => `${i + 1}  ${c}`).join('\n') + '\n', exit: 0 };
  };

  COMMANDS.uname = (argv) => {
    if (argv.includes('-a')) {
      return { stdout: `Linux linux 5.15.0-generic #1 SMP ${fmtDate(now())} x86_64 GNU/Linux\n`, exit: 0 };
    }
    return { stdout: 'Linux\n', exit: 0 };
  };

  COMMANDS.df = (argv) => {
    return {
      stdout: 'Filesystem      Size  Used Avail Use% Mounted on\n' +
        '/dev/sda1        50G   12G   36G  26% /\n' +
        '/dev/sdb1       200G   45G  155G  23% /home\n',
      exit: 0
    };
  };

  COMMANDS.free = (argv) => {
    return {
      stdout: '              total        used        free      shared  buff/cache   available\n' +
        'Mem:           15Gi       4.2Gi       6.1Gi       512Mi       4.7Gi       9.8Gi\n' +
        'Swap:         8.0Gi          0B       8.0Gi\n',
      exit: 0
    };
  };

  COMMANDS.ps = (argv, stdin, session) => {
    const mode = argv[0] || '';
    const procs = session.processes || [];
    if (mode === 'aux') {
      const header = 'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND';
      const rows = procs.map(p => {
        const user = String(p.user || 'user').padEnd(10);
        const pid = String(p.pid).padStart(5);
        const cpu = String(p.cpu.toFixed(1)).padStart(4);
        const mem = String(p.mem.toFixed(1)).padStart(4);
        const vsz = String(p.vsz).padStart(5);
        const rss = String(p.rss).padStart(5);
        const time = `0:${p.time}`;
        return `${user} ${pid} ${cpu} ${mem} ${vsz} ${rss} pts/0    S+   ${fmtTime(now())} ${time.padStart(5)} ${p.cmd}`;
      });
      return { stdout: [header].concat(rows).join('\n') + '\n', exit: 0 };
    }
    const header = '  PID TTY          TIME CMD';
    const rows = procs.map(p => {
      const pid = String(p.pid).padStart(5);
      const time = `00:00:${p.time}`;
      return `  ${pid} pts/0    ${time} ${p.cmd}`;
    });
    return { stdout: [header].concat(rows).join('\n') + '\n', exit: 0 };
  };

  COMMANDS.kill = (argv, stdin, session) => {
    if (!argv.length) {
      return err('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]');
    }
    const errors = [];
    for (const arg of argv) {
      const pid = parseInt(arg, 10);
      if (isNaN(pid)) {
        errors.push(`bash: kill: ${arg}: arguments must be process or job IDs`);
        continue;
      }
      const idx = (session.processes || []).findIndex(p => p.pid === pid);
      if (idx === -1) {
        errors.push(`bash: kill: (${pid}) - No such process`);
        continue;
      }
      session.processes.splice(idx, 1);
    }
    if (errors.length) return err(errors.join('\n'));
    return ok();
  };

  COMMANDS.ping = (argv, stdin, session) => {
    const host = argv.at(-1) || 'localhost';
    const route = session.network?.[host];
    if (route && !route.dns) return err(`ping: ${host}: Name or service not known`);
    const ip = route?.ip || (host === 'localhost' ? '127.0.0.1' : '93.184.216.34');
    const lines = [`PING ${host} (${ip}) 56(84) bytes of data.`];
    for (let i = 1; i <= 4; i++) {
      lines.push(`64 bytes from ${ip}: icmp_seq=${i} ttl=64 time=${(38 + i * 3) / 1000} ms`);
    }
    lines.push('');
    lines.push(`--- ${host} ping statistics ---`);
    lines.push(`4 packets transmitted, 4 received, 0% packet loss, time 3064ms`);
    lines.push(`rtt min/avg/max/mdev = 0.038/0.041/0.045/0.007 ms`);
    return { stdout: lines.join('\n') + '\n', exit: 0 };
  };

  COMMANDS.curl = (argv, stdin, session) => {
    const url = argv.at(-1) || '';
    if (!url) return err("curl: try 'curl <URL>'");
    let host;
    try { host = new URL(url).hostname; }
    catch { return err('curl: укажи полный URL с протоколом'); }
    const route = session.network?.[host];
    if (route && !route.dns) return err(`curl: Could not resolve host: ${host}`, 6);
    if (route && !route.http) return err(`curl: Failed to connect to ${host}: Connection refused`, 7);
    if (route) return { stdout: route.http, exit: 0 };
    const html = `<!DOCTYPE html>
<html>
<head><title>${url}</title></head>
<body>
<h1>It works!</h1>
<p>You fetched ${url}</p>
</body>
</html>`;
    return { stdout: html + '\n', exit: 0 };
  };

  COMMANDS.man = (argv) => {
    if (!argv[0]) return err('man: what manual page do you want?');
    const pages = {
      pwd: 'pwd — print name of current/working directory',
      ls: 'ls [OPTION]... [FILE]... — list directory contents\n  -a all, -l long, -h human, -t sort by time',
      cd: 'cd [DIR] — change the working directory',
      cat: 'cat [FILE]... — concatenate files and print',
      head: 'head [OPTION]... [FILE]... — output first part of files\n  -n N  first N lines',
      tail: 'tail [OPTION]... [FILE]... — output last part of files\n  -n N  last N lines',
      touch: 'touch [FILE]... — create empty file or update timestamp',
      mkdir: 'mkdir [OPTION]... DIRECTORY... — create directories\n  -p  create parents',
      cp: 'cp [OPTION]... SOURCE DEST — copy files\n  -r  copy directories recursively',
      mv: 'mv SOURCE DEST — move/rename files',
      rm: 'rm [OPTION]... [FILE]... — remove files\n  -r  remove directories recursively',
      echo: 'echo [STRING]... — display a line of text\n  supports > and >> redirection',
      grep: 'grep [OPTION]... PATTERN [FILE]... — print lines matching pattern\n  -i ignore case, -n line numbers, -v invert, -c count',
      wc: 'wc [OPTION]... [FILE]... — print newline/word/byte counts\n  -l lines, -w words, -c bytes',
      tree: 'tree [DIRECTORY] — list directory tree',
      whoami: 'whoami — print effective user name',
      date: 'date — print system date and time',
      history: 'history — show command history',
      clear: 'clear — clear the terminal screen',
      help: 'help — show available commands',
      uname: 'uname — print system information\n  -a  all information',
      df: 'df — report file system disk space usage\n  -h  human readable',
      free: 'free — display amount of free/used memory\n  -h  human readable',
      apt: 'apt — package manager for Debian-based systems\n  apt update, apt install, apt remove, apt search, apt list',
      sudo: 'sudo — execute a command as another user\n  sudo -i  start a root shell',
      ps: 'ps — report a snapshot of current processes\n  ps aux  all processes',
      kill: 'kill — send a signal to a process\n  kill PID',
      ping: 'ping — send ICMP echo requests\n  ping HOST',
      curl: 'curl — transfer data from or to a server\n  curl URL',
      rmdir: 'rmdir — remove empty directories'
    };
    const page = pages[argv[0]];
    if (!page) return err(`man: no manual entry for '${argv[0]}'`);
    return { stdout: page + '\n', exit: 0 };
  };

  function parseLsFlags(argv) {
    let a = false, l = false, h = false, t = false;
    let pathArg = null;
    for (const token of argv) {
      if (token.startsWith('-') && token.length > 1) {
        for (const ch of token.slice(1)) {
          if (ch === 'a') a = true;
          else if (ch === 'l') l = true;
          else if (ch === 'h') h = true;
          else if (ch === 't') t = true;
          else return { error: `ls: invalid option -- '${ch}'\nTry 'ls --help' for more information.` };
        }
      } else {
        pathArg = token;
      }
    }
    return { a, l, h, t, pathArg };
  }

  COMMANDS.ls = (argv, stdin, session) => {
    const flags = parseLsFlags(argv);
    if (flags.error) return err(flags.error);
    const target = normalizePath(flags.pathArg || '.', session.cwd);
    const node = getNode(session.fs, target);
    if (!node) return err(`ls: cannot access '${flags.pathArg || ''}': No such file or directory`, 2);
    if (node.type === 'file') {
      return flags.l ? { stdout: longLine(node, basename(target), flags.h) + '\n', exit: 0 } : { stdout: basename(target) + '\n', exit: 0 };
    }
    let entries = Object.keys(node.children).filter(name => flags.a || !name.startsWith('.')).sort();
    if (flags.a) entries = ['.', '..'].concat(entries);
    if (flags.t) {
      const parentPath = target;
      entries.sort((x, y) => {
        const nx = x === '.' ? node : (x === '..' ? getNode(session.fs, dirname(parentPath)) : node.children[x]);
        const ny = y === '.' ? node : (y === '..' ? getNode(session.fs, dirname(parentPath)) : node.children[y]);
        return (ny ? ny.mtime : 0) - (nx ? nx.mtime : 0);
      });
    }
    if (flags.l) {
      const lines = entries.map(name => {
        const child = name === '.' ? node : (name === '..' ? getNode(session.fs, dirname(target)) : node.children[name]);
        return longLine(child || makeDir(), name, flags.h);
      });
      return { stdout: lines.join('\n') + '\n', exit: 0 };
    }
    return { stdout: entries.join('  ') + '\n', exit: 0 };
  };

  COMMANDS.tree = (argv, stdin, session) => {
    const target = normalizePath(argv[0] || '.', session.cwd);
    const node = getNode(session.fs, target);
    if (!node) return err(`tree: '${argv[0] || ''}': No such file or directory`);
    if (node.type === 'file') return err(`tree: '${argv[0] || ''}': Not a directory`);
    const lines = [basename(target) || '/'];
    function walk(n, prefix) {
      const keys = Object.keys(n.children).sort();
      keys.forEach((key, idx) => {
        const isLast = idx === keys.length - 1;
        const child = n.children[key];
        lines.push(prefix + (isLast ? '└── ' : '├── ') + key + (child.type === 'dir' ? '/' : ''));
        if (child.type === 'dir') {
          walk(child, prefix + (isLast ? '    ' : '│   '));
        }
      });
    }
    walk(node, '');
    return { stdout: lines.join('\n') + '\n', exit: 0 };
  };

  COMMANDS.find = (argv, stdin, session) => {
    const args = [...argv];
    const root = args[0]?.startsWith('-') || !args.length ? '.' : args.shift();
    let pattern = null;
    let type = null;
    while (args.length) {
      const [option, value] = args.splice(0, 2);
      if (option === '-name' && value) {
        const regex = value.replace(/[.+^$${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
        pattern = new RegExp('^' + regex + '$');
      } else if (option === '-type' && ['d', 'f'].includes(value)) type = value;
      else return err('find: supported predicates: -name PATTERN, -type f|d');
    }
    const node = getNode(session.fs, normalizePath(root, session.cwd));
    if (!node) return err(`find: ${root}: No such file or directory`);
    const lines = [];
    function walk(entry, path) {
      if ((!pattern || pattern.test(basename(path))) && (!type || entry.type[0] === type)) lines.push(path);
      if (entry.type === 'dir') {
        for (const [name, child] of Object.entries(entry.children)) walk(child, path.replace(/\/$/, '') + '/' + name);
      }
    }
    walk(node, root);
    return { stdout: lines.length ? lines.join('\n') + '\n' : '', exit: 0 };
  };

  COMMANDS.cd = (argv, stdin, session) => {
    const target = argv[0] ? normalizePath(argv[0], session.cwd) : ENV.HOME;
    const node = getNode(session.fs, target);
    if (!node) return err(`bash: cd: ${argv[0] || ''}: No such file or directory`);
    if (node.type !== 'dir') return err(`bash: cd: ${argv[0]}: Not a directory`);
    session.cwd = target;
    return ok();
  };

  COMMANDS.cat = (argv, stdin, session) => {
    if (!argv.length) {
      if (stdin != null) return { stdout: stdin, exit: 0 };
      return err('cat: missing file operand');
    }
    const out = [];
    const errors = [];
    for (const arg of argv) {
      const node = getNode(session.fs, normalizePath(arg, session.cwd));
      if (!node) { errors.push(`cat: ${arg}: No such file or directory`); continue; }
      if (node.type === 'dir') { errors.push(`cat: ${arg}: Is a directory`); continue; }
      if ((node.mode & 0o400) === 0) { errors.push(`cat: ${arg}: Permission denied`); continue; }
      out.push(node.content);
    }
    return { stdout: out.join(''), stderr: errors.length ? errors.join('\n') + '\n' : '', exit: Number(errors.length > 0) };
  };

  function headTail(argv, stdin, session, tail) {
    let n = 10;
    let files = [];
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '-n' && i + 1 < argv.length) { n = parseInt(argv[++i], 10); continue; }
      if (/^-\d+$/.test(argv[i])) { n = parseInt(argv[i].slice(1), 10); continue; }
      files.push(argv[i]);
    }
    if (!files.length && stdin != null) files = ['-'];
    const out = [];
    for (const file of files) {
      let content = '';
      if (file === '-') content = stdin || '';
      else {
        const p = normalizePath(file, session.cwd);
        const node = getNode(session.fs, p);
        if (!node) { out.push(`${tail ? 'tail' : 'head'}: ${file}: No such file or directory`); continue; }
        if (node.type === 'dir') { out.push(`${tail ? 'tail' : 'head'}: ${file}: Is a directory`); continue; }
        content = node.content;
      }
      const lines = content.split('\n');
      if (content.endsWith('\n')) lines.pop();
      const selected = tail ? lines.slice(-n) : lines.slice(0, n);
      if (files.length > 1) out.push(`==> ${file} <==`);
      out.push(...selected);
    }
    return { stdout: out.join('\n') + (out.length ? '\n' : ''), exit: 0 };
  }

  COMMANDS.head = (argv, stdin, session) => headTail(argv, stdin, session, false);
  COMMANDS.tail = (argv, stdin, session) => headTail(argv, stdin, session, true);

  COMMANDS.touch = (argv, stdin, session) => {
    if (!argv.length) return err('touch: missing file operand');
    for (const arg of argv) {
      const p = normalizePath(arg, session.cwd);
      const node = getNode(session.fs, p);
      if (node) { node.mtime = now(); continue; }
      const { parent, name } = getParent(session.fs, p);
      if (!parent) return err(`touch: cannot touch '${arg}': No such file or directory`);
      setNode(session.fs, p, makeFile(''));
    }
    return ok();
  };

  COMMANDS.mkdir = (argv, stdin, session) => {
    let p = false;
    const dirs = [];
    for (const arg of argv) {
      if (arg === '-p') { p = true; continue; }
      dirs.push(arg);
    }
    if (!dirs.length) return err('mkdir: missing operand');
    for (const arg of dirs) {
      const target = normalizePath(arg, session.cwd);
      const node = getNode(session.fs, target);
      if (node) {
        if (node.type === 'dir') { if (p) continue; return err(`mkdir: cannot create directory '${arg}': File exists`); }
        return err(`mkdir: cannot create directory '${arg}': File exists`);
      }
      if (p) {
        if (!ensureDir(session.fs, target)) return err(`mkdir: cannot create directory '${arg}': Not a directory`);
      } else {
        const { parent } = getParent(session.fs, target);
        if (!parent) return err(`mkdir: cannot create directory '${arg}': No such file or directory`);
        setNode(session.fs, target, makeDir());
      }
    }
    return ok();
  };

  COMMANDS.cp = (argv, stdin, session) => {
    let r = false;
    const args = argv.filter(a => { if (a === '-r') { r = true; return false; } return true; });
    if (args.length < 2) return err('cp: missing file operand');
    const destRaw = args[args.length - 1];
    const sources = args.slice(0, -1);
    for (const srcRaw of sources) {
      const srcPath = normalizePath(srcRaw, session.cwd);
      const srcNode = getNode(session.fs, srcPath);
      if (!srcNode) return err(`cp: cannot stat '${srcRaw}': No such file or directory`);
      if (srcNode.type === 'dir' && !r) return err(`cp: -r not specified; omitting directory '${srcRaw}'`);
      const destPath = normalizePath(destRaw, session.cwd);
      let destNode = getNode(session.fs, destPath);
      let targetPath = destPath;
      if (destNode && destNode.type === 'dir') {
        targetPath = destPath + '/' + basename(srcPath);
        destNode = getNode(session.fs, targetPath);
      }
      if (srcPath === targetPath || targetPath.startsWith(srcPath + '/')) return err('cp: источник и цель совпадают или вложены');
      const { parent } = getParent(session.fs, targetPath);
      if (!parent) return err(`cp: cannot create regular file '${targetPath}': No such file or directory`);
      if (destNode && destNode.type === 'dir' && srcNode.type === 'file') {
        targetPath = targetPath + '/' + basename(srcPath);
      }
      setNode(session.fs, targetPath, copyNode(srcNode));
    }
    return ok();
  };

  COMMANDS.mv = (argv, stdin, session) => {
    if (argv.length < 2) return err('mv: missing file operand');
    const srcRaw = argv[0];
    const destRaw = argv[1];
    const srcPath = normalizePath(srcRaw, session.cwd);
    const srcNode = getNode(session.fs, srcPath);
    if (!srcNode) return err(`mv: cannot stat '${srcRaw}': No such file or directory`);
    let destPath = normalizePath(destRaw, session.cwd);
    const destNode = getNode(session.fs, destPath);
    if (destNode && destNode.type === 'dir') destPath = destPath + '/' + basename(srcPath);
    if (destPath === srcPath || destPath.startsWith(srcPath + '/')) return err('mv: источник и цель совпадают или вложены');
    if (!getParent(session.fs, destPath).parent) return err(`mv: cannot move '${srcRaw}' to '${destRaw}': No such file or directory`);
    const destNode2 = getNode(session.fs, destPath);
    if (destNode2) {
      if (srcNode.type === 'dir' && destNode2.type === 'file') {
        return err(`mv: cannot overwrite non-directory '${basename(destPath)}' with directory '${basename(srcPath)}'`);
      }
      removeNode(session.fs, destPath);
    }
    setNode(session.fs, destPath, srcNode);
    removeNode(session.fs, srcPath);
    return ok();
  };

  COMMANDS.rm = (argv, stdin, session) => {
    let recursive = false;
    let force = false;
    let options = true;
    const files = [];
    for (const arg of argv) {
      if (options && arg === '--') { options = false; continue; }
      if (options && /^-[rfR]+$/.test(arg)) {
        recursive ||= /[rR]/.test(arg);
        force ||= arg.includes('f');
      } else if (options && arg.startsWith('-')) {
        return err(`rm: invalid option: ${arg}`);
      } else files.push(arg);
    }
    if (!files.length) return force ? ok() : err('rm: missing operand');
    for (const arg of files) {
      const path = normalizePath(arg, session.cwd);
      if (path === '/' || /(?:^|\/)\.\.?\/?$/.test(arg)) return err('rm: refusing to remove root, . or ..');
      const node = getNode(session.fs, path);
      if (!node && force) continue;
      if (!node) return err(`rm: cannot remove '${arg}': No such file or directory`);
      if (node.type === 'dir' && !recursive) return err(`rm: cannot remove '${arg}': Is a directory`);
      removeNode(session.fs, path);
    }
    return ok();
  };

  COMMANDS.echo = (argv) => {
    const newline = argv[0] !== '-n';
    return { stdout: (newline ? argv : argv.slice(1)).join(' ') + (newline ? '\n' : ''), exit: 0 };
  };

  COMMANDS.grep = (argv, stdin, session) => {
    let i = false, n = false, v = false, c = false;
    const rest = [];
    for (const a of argv) {
      if (a.startsWith('-') && a.length > 1) {
        for (const ch of a.slice(1)) {
          if (ch === 'i') i = true;
          else if (ch === 'n') n = true;
          else if (ch === 'v') v = true;
          else if (ch === 'c') c = true;
          else return err(`grep: invalid option -- '${ch}'`);
        }
      } else rest.push(a);
    }
    if (!rest.length) return err('grep: missing pattern');
    const patternRaw = rest[0];
    const files = rest.slice(1);
    let regex;
    try {
      regex = new RegExp(patternRaw, i ? 'i' : '');
    } catch (e) {
      return err(`grep: invalid pattern`);
    }
    const matches = (line) => regex.test(line) !== v;
    const out = [];
    const sources = [];
    const errors = [];
    let found = false;
    if (!files.length) {
      if (stdin == null) return err('grep: missing file operand');
      sources.push({ name: '-', content: stdin });
    } else {
      for (const f of files) {
        const p = normalizePath(f, session.cwd);
        const node = getNode(session.fs, p);
        if (!node) { errors.push(`grep: ${f}: No such file or directory`); continue; }
        if (node.type === 'dir') { errors.push(`grep: ${f}: Is a directory`); continue; }
        sources.push({ name: f, content: node.content });
      }
    }
    for (const src of sources) {
      const lines = src.content ? src.content.split('\n') : [];
      if (src.content.endsWith('\n')) lines.pop();
      const matched = [];
      lines.forEach((line, idx) => {
        if (matches(line)) matched.push({ n: idx + 1, line });
      });
      found ||= matched.length > 0;
      if (c) {
        const prefix = sources.length > 1 ? `${src.name}:` : '';
        out.push(prefix + matched.length);
      } else {
        for (const m of matched) {
          const prefix = (sources.length > 1 ? `${src.name}:` : '') + (n ? `${m.n}:` : '');
          out.push(prefix + m.line);
        }
      }
    }
    return { stdout: out.join('\n') + (out.length ? '\n' : ''), stderr: errors.length ? errors.join('\n') + '\n' : '', exit: errors.length ? 2 : Number(!found) };
  };

  COMMANDS.wc = (argv, stdin, session) => {
    let l = false, w = false, c = false;
    const files = [];
    for (const a of argv) {
      if (a === '-l') l = true;
      else if (a === '-w') w = true;
      else if (a === '-c') c = true;
      else files.push(a);
    }
    if (!l && !w && !c) { l = true; w = true; c = true; }
    const sources = [];
    if (!files.length) {
      if (stdin == null) return err('wc: missing file operand');
      sources.push({ name: null, content: stdin });
    } else {
      for (const f of files) {
        const p = normalizePath(f, session.cwd);
        const node = getNode(session.fs, p);
        if (!node) { return err(`wc: ${f}: No such file or directory`); }
        if (node.type === 'dir') { return err(`wc: ${f}: Is a directory`); }
        sources.push({ name: f, content: node.content });
      }
    }
    const out = [];
    let totalLines = 0, totalWords = 0, totalBytes = 0;
    for (const src of sources) {
      const lines = src.content.split('\n');
      if (src.content.endsWith('\n')) lines.pop();
      const lineCount = lines.length;
      const wordCount = src.content.trim() ? src.content.trim().split(/\s+/).length : 0;
      const byteCount = src.content.length;
      totalLines += lineCount; totalWords += wordCount; totalBytes += byteCount;
      const parts = [];
      if (l) parts.push(String(lineCount).padStart(7));
      if (w) parts.push(String(wordCount).padStart(7));
      if (c) parts.push(String(byteCount).padStart(7));
      if (src.name) parts.push(src.name);
      out.push(parts.join(' '));
    }
    if (sources.length > 1) {
      const parts = [];
      if (l) parts.push(String(totalLines).padStart(7));
      if (w) parts.push(String(totalWords).padStart(7));
      if (c) parts.push(String(totalBytes).padStart(7));
      parts.push('total');
      out.push(parts.join(' '));
    }
    return { stdout: out.join('\n') + '\n', exit: 0 };
  };

  COMMANDS.chmod = (argv, stdin, session) => {
    const [mode, ...paths] = argv;
    if (!mode || !paths.length) return err('chmod: usage: chmod MODE FILE');
    const numeric = /^[0-7]{3,4}$/.test(mode);
    const symbolic = /^([ugoa]*)([+=-])([rwx]+)$/.exec(mode);
    if (!numeric && !symbolic) return err(`chmod: unsupported mode: ${mode}`);
    for (const path of paths) {
      const node = getNode(session.fs, normalizePath(path, session.cwd));
      if (!node) return err(`chmod: cannot access '${path}': No such file or directory`);
      if (numeric) { node.mode = parseInt(mode, 8); continue; }
      const [, who, operator, bits] = symbolic;
      const value = (bits.includes('r') ? 4 : 0) | (bits.includes('w') ? 2 : 0) | (bits.includes('x') ? 1 : 0);
      for (const [group, shift] of [['u', 6], ['g', 3], ['o', 0]]) {
        if (who && !who.includes('a') && !who.includes(group)) continue;
        if (operator === '=') node.mode = (node.mode & ~(7 << shift)) | (value << shift);
        if (operator === '+') node.mode |= value << shift;
        if (operator === '-') node.mode &= ~(value << shift);
      }
    }
    return ok();
  };

  COMMANDS.diff = (argv, stdin, session) => {
    if (argv.length !== 2) return err('diff: usage: diff FILE FILE', 2);
    const nodes = argv.map(path => getNode(session.fs, normalizePath(path, session.cwd)));
    if (nodes.some(node => node?.type !== 'file')) return err('diff: expected two existing files', 2);
    return nodes[0].content === nodes[1].content ? ok() : { stdout: `Files ${argv.join(' and ')} differ\n`, exit: 1 };
  };

  function linesFromInput(argv, stdin, session, name) {
    const source = argv.length ? COMMANDS.cat(argv, stdin, session) : { stdout: stdin || '', exit: 0 };
    if (source.exit) return { result: err(`${name}: ${source.stderr.trim()}`) };
    return { lines: source.stdout ? source.stdout.replace(/\n$/, '').split('\n') : [] };
  }

  COMMANDS.sort = (argv, stdin, session) => {
    const { lines, result } = linesFromInput(argv, stdin, session, 'sort');
    return result || { stdout: lines.length ? lines.sort().join('\n') + '\n' : '', exit: 0 };
  };

  COMMANDS.uniq = (argv, stdin, session) => {
    const { lines, result } = linesFromInput(argv, stdin, session, 'uniq');
    return result || { stdout: lines.length ? lines.filter((line, i) => !i || line !== lines[i - 1]).join('\n') + '\n' : '', exit: 0 };
  };

  COMMANDS.systemctl = (argv, stdin, session) => {
    const [action, name] = argv;
    const service = session.services?.[name?.replace(/\.service$/, '')];
    if (!service) return err(`systemctl: Unit ${name || '…'} not found`);
    if (action === 'status' || action === 'is-active') {
      return { stdout: (action === 'status' ? `${name} — ` : '') + service.state + '\n', exit: service.state === 'active' ? 0 : 3 };
    }
    if (action === 'stop') { service.state = 'inactive'; return ok(); }
    if (action !== 'start' && action !== 'restart') return err('systemctl: supported actions: status, start, stop, restart, is-active');
    const file = getNode(session.fs, normalizePath(service.requires, ENV.HOME));
    if (file?.type !== 'file' || file.content.trim() !== service.expected) {
      service.state = 'failed';
      service.log.push(`ERROR: expected ${service.expected} in ${service.requires}`);
      return err(`Job for ${name}.service failed. See journalctl -u ${name}.`);
    }
    service.state = 'active';
    service.log.push('INFO: service started');
    return ok();
  };

  COMMANDS.journalctl = (argv, stdin, session) => {
    const service = argv[0] === '-u' && session.services?.[argv[1]?.replace(/\.service$/, '')];
    if (!service) return err('journalctl: usage: journalctl -u UNIT');
    return { stdout: service.log.join('\n') + '\n', exit: 0 };
  };

  function runStage(session, stage, stdin) {
    let outPath;
    let errorPath;
    for (const { op, path } of stage.redirects) {
      const target = normalizePath(path, session.cwd);
      const existing = getNode(session.fs, target);
      if (op === '<') {
        if (existing?.type !== 'file') return err(`bash: ${path}: cannot read file`);
        stdin = existing.content;
        continue;
      }
      if (existing?.type === 'dir') return err(`bash: ${path}: Is a directory`);
      if ((existing && !(existing.mode & 0o200)) || !getParent(session.fs, target).parent) {
        return err(`bash: ${path}: cannot write file`);
      }
      if (!existing || !op.endsWith('>>')) {
        const file = makeFile('');
        if (existing) file.mode = existing.mode;
        setNode(session.fs, target, file);
      }
      if (op.startsWith('2')) errorPath = target;
      else outPath = target;
    }
    const [cmd, ...args] = stage.argv;
    const result = !cmd ? ok() : COMMANDS[cmd]?.(args, stdin, session) || err(`${cmd}: command not found`, 127);
    for (const [path, value] of [[outPath, result.stdout], [errorPath, result.stderr]]) {
      if (!path || !value) continue;
      const file = getNode(session.fs, path);
      if (file?.type === 'file') {
        file.content += value;
        file.size = file.content.length;
        file.mtime = now();
        file.generatedBy = { command: cmd, args };
      }
    }
    return { ...result, stdout: outPath ? '' : result.stdout, stderr: errorPath ? '' : result.stderr || '' };
  }

  function execLine(session, line) {
    const trimmed = line.trim();
    if (!trimmed) return { stdout: '', stderr: '', exit: 0 };
    session.history.push(trimmed);
    if (session.history.length > 150) session.history.shift();
    session.lastCommand = '';
    let stages;
    try {
      stages = parsePipeline(parseLine(trimmed, { ...session.env, '?': session.lastExit ?? 0 }));
    } catch (error) {
      session.lastOutput = '';
      session.lastExit = 2;
      return err(`bash: ${error.message}`, 2);
    }
    let stdout = '';
    let stderr = '';
    let pipeInput = null;
    let clear = false;
    let exit = 0;
    let skip = false;
    for (let index = 0; index < stages.length; index++) {
      const stage = stages[index];
      if (stage.connector !== '|') {
        skip = (stage.connector === '&&' && exit !== 0) || (stage.connector === '||' && exit === 0);
      }
      if (skip) continue;
      const result = runStage(session, stage, stage.connector === '|' ? pipeInput : null);
      session.lastCommand = stage.argv[0] || '';
      clear ||= !!result.clear;
      exit = result.exit;
      stderr += result.stderr || '';
      pipeInput = result.stdout;
      if (stages[index + 1]?.connector !== '|') stdout += result.stdout;
    }
    session.lastExit = exit;
    session.lastOutput = stdout;
    return { stdout, stderr, exit, clear };
  }

  /* ---------- проверки ---------- */
  function runChecks(session, checks) {
    const failures = [];
    if (!Array.isArray(checks) || !checks.length) return { passed: false, failures };
    for (const check of checks) {
      const type = check.type;
      let okFlag = false;
      switch (type) {
        case 'path_exists': okFlag = pathExists(session.fs, normalizePath(check.path, session.cwd)); break;
        case 'path_not_exists': okFlag = !pathExists(session.fs, normalizePath(check.path, session.cwd)); break;
        case 'path_is_dir': { const n = getNode(session.fs, normalizePath(check.path, session.cwd)); okFlag = n && n.type === 'dir'; } break;
        case 'path_is_file': { const n = getNode(session.fs, normalizePath(check.path, session.cwd)); okFlag = n && n.type === 'file'; } break;
        case 'file_contains': {
          const n = getNode(session.fs, normalizePath(check.path, session.cwd));
          okFlag = n && n.type === 'file' && n.content.includes(check.text);
          break;
        }
        case 'file_equals': {
          const node = getNode(session.fs, normalizePath(check.path, session.cwd));
          okFlag = node?.type === 'file' && node.content.replace(/\n$/, '') === check.text.replace(/\n$/, '');
          break;
        }
        case 'file_generated': {
          const node = getNode(session.fs, normalizePath(check.path, session.cwd));
          const origin = node?.generatedBy;
          okFlag = origin?.command === check.command && (!check.arg || origin.args.includes(check.arg));
          break;
        }
        case 'mode_equals': {
          const node = getNode(session.fs, normalizePath(check.path, session.cwd));
          okFlag = node?.mode === Number.parseInt(check.mode, 8);
          break;
        }
        case 'process_absent': okFlag = !session.processes.some(p => p.pid === check.pid); break;
        case 'process_present': okFlag = session.processes.some(p => p.pid === check.pid); break;
        case 'service_state': okFlag = session.services?.[check.name]?.state === check.state; break;
        case 'cwd_equals': okFlag = session.cwd === normalizePath(check.path, session.cwd); break;
        case 'output_contains': okFlag = session.lastExit === 0 && (session.lastOutput || '').includes(check.text) && (!check.commands || check.commands.includes(session.lastCommand)); break;
        default: okFlag = false;
      }
      if (!okFlag) failures.push(check.message || `check ${type} failed`);
    }
    return { passed: failures.length === 0, failures };
  }

  /* ---------- автодополнение ---------- */
  function autocomplete(session, input) {
    const trimmed = input;
    const lastSpace = trimmed.lastIndexOf(' ');
    const prefix = lastSpace === -1 ? trimmed : trimmed.slice(lastSpace + 1);
    const before = lastSpace === -1 ? '' : trimmed.slice(0, lastSpace + 1);
    let parentRaw = '';

    if (lastSpace === -1) {
      const cmds = Object.keys(COMMANDS).filter(c => c.startsWith(prefix));
      if (cmds.length === 1) return { suggestion: cmds[0], list: cmds };
      return { suggestion: prefix, list: cmds };
    }

    let dirPath = session.cwd;
    let namePrefix = prefix;
    if (prefix.includes('/')) {
      parentRaw = prefix.slice(0, prefix.lastIndexOf('/') + 1);
      namePrefix = prefix.slice(prefix.lastIndexOf('/') + 1);
      dirPath = normalizePath(parentRaw, session.cwd);
    }
    const dir = getNode(session.fs, dirPath);
    if (!dir || dir.type !== 'dir') return { suggestion: prefix, list: [] };
    const matches = Object.keys(dir.children).filter(n => n.startsWith(namePrefix) && (namePrefix.startsWith('.') || !n.startsWith('.'))).sort();
    if (matches.length === 1) {
      const directory = dir.children[matches[0]].type === 'dir';
      const escaped = matches[0].replace(/[\s'"\\$]/g, char => '\\' + char);
      const full = before + parentRaw + escaped + (directory ? '/' : '');
      return { suggestion: full, list: matches, directory };
    }
    return { suggestion: prefix, list: matches };
  }

  /* ---------- публичный API ---------- */
  const api = {
    createSession: function (setup) {
      setup = setup || {};
      return {
        fs: buildFS(setup.tree),
        cwd: normalizePath(setup.cwd || ENV.HOME, ENV.HOME),
        history: [],
        lastOutput: '',
        env: Object.assign({}, ENV),
        lastExit: 0,
        lastCommand: '',
        processes: setup.processes ? deepClone(setup.processes) : defaultProcesses(),
        network: deepClone(setup.network || {}),
        services: deepClone(setup.services || {})
      };
    },
    exec: function (session, line) {
      return execLine(session, line);
    },
    runChecks: function (session, checks) {
      return runChecks(session, checks);
    },
    autocomplete: function (session, input) {
      return autocomplete(session, input);
    },
    getPrompt: function (session) {
      return getPrompt(session);
    },
    normalizePath: normalizePath,
    getNode: getNode
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.TerminalSimulator = api;
  }
})();
