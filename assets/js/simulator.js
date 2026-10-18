/**
 * simulator.js — чистая логика терминала для учебника «Linux за 2 месяца».
 * Не зависит от DOM, может быть require()-нут из Node для smoke-тестов.
 * v2: режимы оболочки (bash/fish/zsh), ps/kill/ping/curl, темы через CSS.
 */
(function () {
  'use strict';

  const ENV = { HOME: '/home/user', USER: 'user' };

  /* ---------- маленькие утилиты ---------- */
  const now = () => Date.now();

  function makeDir(children, mtime) {
    return { type: 'dir', children: children || {}, mtime: mtime || now() };
  }

  function makeFile(content, mtime) {
    const text = content == null ? '' : String(content);
    return { type: 'file', content: text, mtime: mtime || now(), size: text.length };
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

  function expandVars(text) {
    return String(text).replace(/\$(HOME|USER)\b/g, (_, name) => ENV[name]);
  }

  function abbreviateCwd(cwd) {
    if (cwd === ENV.HOME) return '~';
    if (cwd.startsWith(ENV.HOME + '/')) return '~' + cwd.slice(ENV.HOME.length);
    return cwd;
  }

  /* ---------- промпты оболочек ---------- */
  function getPrompt(session) {
    const d = abbreviateCwd(session.cwd);
    switch (session.shell) {
      case 'fish':
        return `user@linux ${d}>`;
      case 'zsh':
        return `${d} ❯`;
      case 'bash':
      default:
        return `user@linux:${d}$`;
    }
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
      node = node.children[part];
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
      node = node.children[part];
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
      if (!node.children[part]) node.children[part] = makeDir();
      node = node.children[part];
    }
    return true;
  }

  function setNode(root, absPath, node) {
    const { parent, name } = getParent(root, absPath);
    if (!parent) return false;
    parent.children[name] = node;
    return true;
  }

  function removeNode(root, absPath) {
    const { parent, name } = getParent(root, absPath);
    if (!parent || !(name in parent.children)) return false;
    delete parent.children[name];
    return true;
  }

  function copyNode(node) {
    if (node.type === 'file') return makeFile(node.content, node.mtime);
    const copy = makeDir({}, node.mtime);
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
  function tokenizeSegment(segment) {
    const tokens = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < segment.length; i++) {
      const ch = segment[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ' ' && !inQuotes) {
        if (cur !== '') tokens.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur !== '') tokens.push(cur);
    return tokens.map(expandVars);
  }

  function splitPipes(line) {
    const parts = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; cur += ch; continue; }
      if (ch === '|' && !inQuotes) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    return parts.map(s => s.trim());
  }

  function parseSegment(segment) {
    const raw = tokenizeSegment(segment);
    const argv = [];
    let redirectFile = null;
    let append = false;
    for (let i = 0; i < raw.length; i++) {
      const t = raw[i];
      if (t === '>' || t === '>>') {
        append = t === '>>';
        if (i + 1 < raw.length) redirectFile = raw[++i];
        continue;
      }
      argv.push(t);
    }
    return { argv, redirectFile, append };
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
    if (node.type === 'dir') return 'drwxr-xr-x';
    return '-rw-r--r--';
  }

  function longLine(node, name, human) {
    const size = node.type === 'dir' ? 4096 : (node.size || 0);
    const sizeStr = human ? humanSize(size) : String(size);
    return `${permissions(node)} 1 ${ENV.USER} ${ENV.USER} ${sizeStr.padStart(5)} ${fmtDate(node.mtime)} ${name}`;
  }

  function ok() { return { stdout: '', exit: 0 }; }
  function err(msg) { return { stdout: msg + '\n', exit: 1 }; }

  /* ---------- команды ---------- */
  const COMMANDS = {};

  COMMANDS.pwd = (argv, stdin, session) => ({ stdout: session.cwd + '\n', exit: 0 });

  COMMANDS.whoami = () => ({ stdout: ENV.USER + '\n', exit: 0 });

  COMMANDS.date = () => ({ stdout: new Date().toString() + '\n', exit: 0 });

  COMMANDS.clear = () => ({ stdout: '', exit: 0, clear: true });

  COMMANDS.help = (argv, stdin, session) => ({
    stdout:
      `Режим оболочки: ${session.shell || 'bash'}\n` +
      'Доступные команды:\n' +
      '  pwd, ls, cd, cat, head, tail, touch, mkdir, cp, mv, rm\n' +
      '  echo, grep, wc, tree, whoami, date, clear, history, help, man\n' +
      '  uname, df, free, ps, kill, ping, curl\n',
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

  COMMANDS.ping = (argv) => {
    const host = argv[0] || 'localhost';
    const ip = host === 'localhost' ? '127.0.0.1' : '93.184.216.34';
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

  COMMANDS.curl = (argv) => {
    const url = argv[0] || '';
    if (!url) return err("curl: try 'curl <URL>'");
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
    if (!node) return err(`ls: cannot access '${flags.pathArg || ''}': No such file or directory`);
    if (node.type === 'file') {
      return flags.l ? { stdout: longLine(node, basename(target), flags.h) + '\n', exit: 0 } : { stdout: basename(target) + '\n', exit: 0 };
    }
    let entries = Object.keys(node.children);
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
    for (const arg of argv) {
      const p = normalizePath(arg, session.cwd);
      const node = getNode(session.fs, p);
      if (!node) { out.push(`cat: ${arg}: No such file or directory`); continue; }
      if (node.type === 'dir') { out.push(`cat: ${arg}: Is a directory`); continue; }
      out.push(node.content);
    }
    return { stdout: out.join('') + (out.length ? '' : ''), exit: 0 };
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
      parent.children[name] = makeFile('');
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
        ensureDir(session.fs, target);
      } else {
        const { parent } = getParent(session.fs, target);
        if (!parent) return err(`mkdir: cannot create directory '${arg}': No such file or directory`);
        const base = basename(target);
        parent.children[base] = makeDir();
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
      const { parent, name } = getParent(session.fs, targetPath);
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
    let r = false;
    const files = [];
    for (const a of argv) { if (a === '-r') r = true; else files.push(a); }
    if (!files.length) return err('rm: missing operand');
    for (const arg of files) {
      const p = normalizePath(arg, session.cwd);
      const node = getNode(session.fs, p);
      if (!node) return err(`rm: cannot remove '${arg}': No such file or directory`);
      if (node.type === 'dir' && !r) return err(`rm: cannot remove '${arg}': Is a directory`);
      removeNode(session.fs, p);
    }
    return ok();
  };

  COMMANDS.echo = (argv, stdin, session, redirect) => {
    const text = argv.join(' ') + '\n';
    if (redirect && redirect.file) {
      const p = normalizePath(redirect.file, session.cwd);
      const { parent, name } = getParent(session.fs, p);
      if (!parent) return err(`bash: ${redirect.append ? '>>' : '>'}: ${redirect.file}: No such file or directory`);
      const existing = parent.children[name];
      if (existing && existing.type === 'dir') return err(`bash: ${redirect.append ? '>>' : '>'}: ${redirect.file}: Is a directory`);
      if (existing && redirect.append) existing.content += text;
      else parent.children[name] = makeFile(text);
      return ok();
    }
    return { stdout: text, exit: 0 };
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
    if (!files.length) {
      if (stdin == null) return err('grep: missing file operand');
      sources.push({ name: '-', content: stdin });
    } else {
      for (const f of files) {
        const p = normalizePath(f, session.cwd);
        const node = getNode(session.fs, p);
        if (!node) { out.push(`grep: ${f}: No such file or directory`); continue; }
        if (node.type === 'dir') { out.push(`grep: ${f}: Is a directory`); continue; }
        sources.push({ name: f, content: node.content });
      }
    }
    for (const src of sources) {
      const lines = src.content.split('\n');
      if (src.content.endsWith('\n')) lines.pop();
      const matched = [];
      lines.forEach((line, idx) => {
        if (matches(line)) matched.push({ n: idx + 1, line });
      });
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
    return { stdout: out.join('\n') + (out.length ? '\n' : ''), exit: 0 };
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

  /* ---------- исполнение ---------- */
  function runOne(session, argv, stdin, redirect) {
    if (!argv.length) return ok();
    const cmd = argv[0];
    const args = argv.slice(1);
    if (cmd === 'echo') {
      return COMMANDS.echo(args, stdin, session, redirect ? { file: redirect.file, append: redirect.append } : null);
    }
    if (redirect && redirect.file) {
      const fake = runOne(session, argv, stdin, null);
      const p = normalizePath(redirect.file, session.cwd);
      const { parent, name } = getParent(session.fs, p);
      if (!parent) return err(`bash: ${redirect.append ? '>>' : '>'}: ${redirect.file}: No such file or directory`);
      const existing = parent.children[name];
      if (existing && existing.type === 'dir') return err(`bash: ${redirect.append ? '>>' : '>'}: ${redirect.file}: Is a directory`);
      if (existing && redirect.append) existing.content += fake.stdout;
      else parent.children[name] = makeFile(fake.stdout);
      return ok();
    }
    const fn = COMMANDS[cmd];
    if (!fn) return err(`${cmd}: command not found`);
    return fn(args, stdin, session);
  }

  function execLine(session, line) {
    const trimmed = line.trim();
    if (!trimmed) return { stdout: '', exit: 0 };
    session.history.push(trimmed);
    const segments = splitPipes(trimmed);
    let stdin = '';
    let output = '';
    let clear = false;
    let exitCode = 0;
    for (let i = 0; i < segments.length; i++) {
      const { argv, redirectFile, append } = parseSegment(segments[i]);
      const redirect = redirectFile ? { file: redirectFile, append } : null;
      const result = runOne(session, argv, stdin, redirect);
      if (result.clear) clear = true;
      output = result.stdout;
      exitCode = result.exit;
      if (result.exit !== 0) {
        stdin = '';
        break;
      }
      stdin = result.stdout;
    }
    session.lastOutput = output;
    return { stdout: output, exit: exitCode, clear };
  }

  /* ---------- проверки ---------- */
  function runChecks(session, checks) {
    const failures = [];
    if (!Array.isArray(checks)) return { passed: true, failures };
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
        case 'cwd_equals': okFlag = session.cwd === normalizePath(check.path, session.cwd); break;
        case 'output_contains': okFlag = (session.lastOutput || '').includes(check.text); break;
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
    const matches = Object.keys(dir.children).filter(n => n.startsWith(namePrefix));
    if (matches.length === 1) {
      const full = before + parentRaw + matches[0];
      return { suggestion: full, list: matches };
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
        shell: setup.shell || 'bash',
        processes: defaultProcesses()
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
