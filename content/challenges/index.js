const home = '/home/user/';
const check = (type, path, extra = {}) => ({ type, path: home + path, ...extra });
const hasFile = path => check('path_is_file', path);
const hasDir = path => check('path_is_dir', path);
const missing = path => check('path_not_exists', path);
const contents = (path, text) => check('file_equals', path, { text });
const mode = (path, value) => check('mode_equals', path, { mode: value });
const processAlive = pid => ({ type: 'process_present', pid });
const processGone = pid => ({ type: 'process_absent', pid });
const service = (name, state) => ({ type: 'service_state', name, state });
const indexText = 'ключ: NORTH-7\n';
const intakeLog = 'INFO загрузка\nERROR диск занят\nWARN повтор\nERROR нет места\n';
const logErrors = 'ERROR диск занят\nERROR нет места\n';
const opsLog = 'INFO служба работала\nERROR worker завис\nINFO диагностика\n';
const jobsLog = 'INFO tick\nERROR backup skipped\nINFO tick\nERROR upload skipped\n';

export const challenges = [
  {
    id: 'module-1-navigation',
    title: 'Ночной обход',
    brief: 'Тебе оставили журнал в незнакомой домашней папке. Найди маршрут и оставь отметку о проверке.',
    setup: { tree: { station: { '.route': 'Пункт назначения — station/north/archive.\n', north: { archive: { 'index.txt': indexText } } } } },
    goals: [
      { text: 'Найди скрытый указатель в station и доберись до архива.', checks: [check('cwd_equals', 'station/north/archive')] },
      { text: 'Прочитай index.txt. В файле ~/station/checked.txt должна остаться только строка с ключом, ровно как в журнале.', checks: [contents('station/checked.txt', indexText)] }
    ],
    critical: [contents('station/north/archive/index.txt', indexText), hasFile('station/.route')],
    hints: ['Ищи среди скрытых файлов.', 'Вывод можно направить в файл.']
  },
  {
    id: 'module-2-files',
    title: 'Разгреби приёмку',
    brief: 'На диске бардак. Забери полезное из входящих, сохрани оригинал и убери только временное.',
    setup: { tree: { inbox: { 'app.log': intakeLog, 'dead.tmp': 'мусор', 'release note.txt': 'Версия 2.7\n' } } },
    goals: [
      { text: 'Создай out/archive и положи туда неизменённую копию app.log.', checks: [hasDir('out/archive'), contents('out/archive/app.log', intakeLog)] },
      { text: 'В out/errors.txt оставь все строки ERROR из app.log в исходном порядке, по одной на строку.', checks: [contents('out/errors.txt', logErrors)] },
      { text: 'Перенеси «release note.txt» из inbox прямо в out. Удали inbox/dead.tmp.', checks: [contents('out/release note.txt', 'Версия 2.7'), missing('inbox/release note.txt'), missing('inbox/dead.tmp')] }
    ],
    critical: [contents('inbox/app.log', intakeLog)],
    hints: ['Имя с пробелом — один аргумент.', 'Отбор строк и запись вывода можно совместить.']
  },
  {
    id: 'module-3-access',
    title: 'Закрой хранилище',
    brief: 'В архиве лежит учебный секрет, а запускной файл нельзя выполнить. Приведи права и резервную копию в порядок.',
    setup: { tree: { vault: { 'token.txt': 'training-token\n' }, 'deploy.sh': 'echo deployment\n' } },
    goals: [
      { text: 'У каталога vault права 700, у vault/token.txt — 600.', checks: [mode('vault', '700'), mode('vault/token.txt', '600')] },
      { text: 'Сделай deploy.sh исполняемым для владельца. Итоговые права — 744.', checks: [mode('deploy.sh', '744')] },
      { text: 'Сохрани содержимое token.txt в ~/token.backup с правами 600.', checks: [contents('token.backup', 'training-token'), mode('token.backup', '600')] }
    ],
    critical: [contents('vault/token.txt', 'training-token'), contents('deploy.sh', 'echo deployment')],
    hints: ['У каталога x нужен для прохода внутрь.', 'Проверь режим копии отдельно.']
  },
  {
    id: 'module-4-processes',
    title: 'Зависший воркер',
    brief: 'В логе упомянут зависший worker. Найди его по имени, сохрани сведения о системе и останови только виновника.',
    setup: {
      tree: { 'ops.log': opsLog },
      processes: [
        { pid: 1, cmd: 'systemd', user: 'root', cpu: 0, mem: 1, vsz: 100, rss: 30, time: '00' },
        { pid: 275, cmd: 'worker', user: 'user', cpu: 92, mem: 5, vsz: 600, rss: 250, time: '30' },
        { pid: 984, cmd: 'postgres', user: 'user', cpu: 1, mem: 4, vsz: 400, rss: 70, time: '03' },
        { pid: 840, cmd: 'bash', user: 'user', cpu: 0, mem: 1, vsz: 100, rss: 20, time: '00' }
      ]
    },
    goals: [
      { text: 'Останови worker, сохранив systemd, postgres и bash.', checks: [processGone(275)] },
      { text: 'В memory.txt сохрани вывод о памяти, включая строки Mem: и Swap:.', checks: ['Mem:', 'Swap:'].map(text => check('file_contains', 'memory.txt', { text })).concat(check('file_generated', 'memory.txt', { command: 'free' })) },
      { text: 'Создай incident.txt с одной оригинальной строкой ERROR из ops.log.', checks: [contents('incident.txt', 'ERROR worker завис')] }
    ],
    critical: [processAlive(1), processAlive(984), processAlive(840), contents('ops.log', opsLog)],
    hints: ['Сначала посмотри PID и имя вместе.', 'Снимок памяти — это вывод команды в файл.']
  },
  {
    id: 'module-5-bash',
    title: 'Передача смены',
    brief: 'Собери сводку из журналов через Bash и оставь файл, который другой человек сможет проверить.',
    setup: { tree: { 'jobs.log': jobsLog, '.bashrc': 'export EDITOR=nano\n' } },
    goals: [
      { text: 'Сохрани в handoff/errors.txt строки ERROR из jobs.log, отсортированные по алфавиту.', checks: [contents('handoff/errors.txt', 'ERROR backup skipped\nERROR upload skipped')] },
      { text: 'Сохрани число строк с ошибками в handoff/count.txt. В файле должно быть только число.', checks: [contents('handoff/count.txt', '2')] },
      { text: 'Допиши в конец .bashrc строку export PAGER=less, сохранив предыдущую строку.', checks: [contents('.bashrc', 'export EDITOR=nano\nexport PAGER=less')] }
    ],
    critical: [contents('jobs.log', jobsLog)],
    hints: ['У пайпа выход одного шага становится входом другого.', 'Перезапись и дописывание — разные операции.']
  },
  {
    id: 'module-6-network',
    title: 'Сайт не отвечает',
    brief: 'На учебном стенде клиенты жалуются на сбой. Сверь сетевую доступность и HTTP, затем сохрани доказательства.',
    setup: {
      tree: { 'hosts.txt': 'app.training — 192.0.2.20\nstatus.training — 192.0.2.30\n' },
      network: {
        'app.training': { ip: '192.0.2.20', dns: true, http: null },
        'status.training': { ip: '192.0.2.30', dns: true, http: 'STATUS OK\n' }
      }
    },
    goals: [
      { text: 'В ping.txt оставь вывод проверки доступности app.training по имени.', checks: [check('file_generated', 'ping.txt', { command: 'ping', arg: 'app.training' }), check('file_contains', 'ping.txt', { text: '0% packet loss' })] },
      { text: 'В http-error.txt сохрани ошибку HTTP-подключения к app.training.', checks: [check('file_generated', 'http-error.txt', { command: 'curl', arg: 'http://app.training' }), check('file_contains', 'http-error.txt', { text: 'Connection refused' })] },
      { text: 'В status.txt сохрани ответ http://status.training, в котором видно, что стенд жив.', checks: [contents('status.txt', 'STATUS OK'), check('file_generated', 'status.txt', { command: 'curl', arg: 'http://status.training' })] }
    ],
    critical: [hasFile('hosts.txt')],
    hints: ['Доступность хоста и HTTP — разные проверки.', 'Ошибки идут по отдельному потоку.']
  },
  {
    id: 'module-7-services',
    title: 'Дежурство у сервиса',
    brief: 'Учебная служба archive упала. Диагноз в её журнале. Верни службу в рабочее состояние и зафиксируй результат.',
    setup: {
      tree: { 'archive.conf': 'enabled=no\n', 'crontab.txt': '0 3 * * * /opt/backup\n', 'archive.service': '[Service]\nExecStart=/opt/archive\n' },
      services: { archive: { state: 'failed', requires: 'archive.conf', expected: 'enabled=yes', log: ['ERROR: expected enabled=yes in archive.conf'] } }
    },
    goals: [
      { text: 'Исправь archive.conf и доведи службу archive до состояния active.', checks: [contents('archive.conf', 'enabled=yes'), service('archive', 'active')] },
      { text: 'В analysis.txt сохрани строки ERROR из журнала archive.', checks: [contents('analysis.txt', 'ERROR: expected enabled=yes in archive.conf')] },
      { text: 'Скопируй расписание в schedule.backup без изменений.', checks: [contents('schedule.backup', '0 3 * * * /opt/backup')] }
    ],
    critical: [hasFile('archive.service'), hasFile('crontab.txt')],
    hints: ['Журнал можно отфильтровать по имени службы.', 'Изменение файла само по себе службу не запускает.']
  },
  {
    id: 'module-8-final',
    title: 'Аварийная смена',
    brief: 'Служба portal не стартует, а рядом висит зависший процесс. Восстанови работу и собери каталог для передачи смены.',
    setup: {
      tree: { 'portal.conf': 'ready=no\n', 'portal.service': '[Service]\nExecStart=/opt/portal\n', 'incident.log': 'INFO boot\nERROR portal failed\nERROR sleep hung\n' },
      services: { portal: { state: 'failed', requires: 'portal.conf', expected: 'ready=yes', log: ['ERROR: expected ready=yes in portal.conf'] } }
    },
    goals: [
      { text: 'Создай handoff/portal.conf.original с исходным состоянием конфигурации ready=no. Ограничь права на копию до 600.', checks: [contents('handoff/portal.conf.original', 'ready=no'), mode('handoff/portal.conf.original', '600')] },
      { text: 'Исправь конфигурацию и подними портал до active.', checks: [contents('portal.conf', 'ready=yes'), service('portal', 'active')] },
      { text: 'Найди и останови sleep, сохранив все остальные процессы.', checks: [processGone(412)] },
      { text: 'Сохрани в handoff/errors.txt только строки ERROR из incident.log, в исходном порядке.', checks: [contents('handoff/errors.txt', 'ERROR portal failed\nERROR sleep hung')] },
      { text: 'Сохрани в handoff/disk.txt вывод о месте на дисках и в handoff/service.txt актуальный статус portal.', checks: [check('file_generated', 'handoff/disk.txt', { command: 'df' }), check('file_generated', 'handoff/service.txt', { command: 'systemctl' }), check('file_contains', 'handoff/service.txt', { text: 'active' })] }
    ],
    critical: [1, 780, 913, 1024, 2042].map(processAlive).concat(hasFile('portal.service'), hasFile('incident.log')),
    hints: ['Оригинал понадобится после исправления. Сделай копию заранее.', 'Статус службы и запись в журнале отвечают на разные вопросы.']
  }
];
