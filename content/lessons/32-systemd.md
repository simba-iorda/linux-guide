---
id: 32-systemd
title: systemd: службы и их запуск
module: 7
minutes: 30
level: base
outcome: "Ты понимаешь, что такое служба в systemd, и умеешь управлять её запуском и автозапуском"
---

## Зачем это тебе

Почему nginx сам поднимается после перезагрузки сервера? Почему «сайт лёг», а сервер жив? Как сделать, чтобы твой скрипт работал круглосуточно и оживал после падения? Всё это — про **службы**. В современном Linux ими рулит `systemd`, и это тот инструмент, который отличает уверенного пользователя от новичка.

## Как это работает

### Что вообще такое служба

**Служба** (по-старому — демон) — программа, которая работает в фоне без твоего участия: веб-сервер, SSH, база данных, планировщик. В Windows их видно в «Службах»; в Linux ими управляет системный менеджер. Раньше это был init со скриптами, теперь — **systemd**, первый процесс системы (PID 1).

systemd запускает всё по расписанию зависимостей: сначала сеть, потом службы, которым сеть нужна. Описание каждой службы лежит в **unit-файле** — текстовом файле с тремя секциями:

```ini
[Unit]
Description=My App
After=network.target

[Service]
User=app
WorkingDirectory=/opt/myapp
ExecStart=/usr/bin/python3 app.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

- `[Unit]` — что это и от кого зависит (`After`, `Wants`).
- `[Service]` — что запускать (`ExecStart`), от какого пользователя, как перезапускать.
- `[Install]` — кому «доложить о себе», чтобы попасть в автозапуск.

### start и enable — не одно и то же

Самая частая путаница. `start` — «запусти сейчас». `enable` — «запускай при загрузке».

| Команда | Что делает |
| --- | --- |
| `systemctl status nginx` | Статус службы и последние строки лога |
| `sudo systemctl start nginx` | Запустить сейчас |
| `sudo systemctl stop nginx` | Остановить |
| `sudo systemctl restart nginx` | Перезапустить |
| `sudo systemctl reload nginx` | Перечитать конфиг без остановки |
| `sudo systemctl enable --now nginx` | Автозапуск + старт прямо сейчас |
| `sudo systemctl disable nginx` | Убрать из автозапуска |
| `systemctl --failed` | Что упало |

Отдельно стоит `systemctl list-units --type=service --state=running` — быстрый взгляд, что вообще работает.

### Где живут свои службы

Свои unit-файлы кладут в `/etc/systemd/system/`. Файлы из `/usr/lib/systemd/system/` принадлежат пакетам — их правка затрётся при обновлении. После любых изменений в `.service` нужен `sudo systemctl daemon-reload`, иначе systemd не увидит правок.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now myapp
```

Вместо правки чужого unit правильнее делать **override**: `sudo systemctl edit nginx` создаст отдельный файл-дополнение, который переживёт обновление пакета.

> 💡 «Служба не запускается?» Первым делом `systemctl status myapp` и `journalctl -u myapp` — об этом в следующем уроке.

## Попробуй

В первых заданиях прочитаем unit-файл. Потом попробуем запуск учебной службы через `systemctl`.

```terminal
{
  "id": "t0",
  "title": "Читаем unit-файл",
  "task": "Прочитай описание службы: cat myapp.service. Найди секцию [Service] и строку ExecStart.",
  "setup": { "cwd": "/home/user", "tree": { "myapp.service": "[Unit]\nDescription=My App\nAfter=network.target\n\n[Service]\nUser=app\nWorkingDirectory=/opt/myapp\nExecStart=/usr/bin/python3 app.py\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n" } },
  "check": [
    { "type": "output_contains", "commands": ["cat", "head", "tail"], "text": "[Service]", "message": "секция [Service] найдена" }
  ],
  "solution": ["cat myapp.service"],
  "hint": "cat выводит файл целиком"
}
```

```terminal
{
  "id": "t1",
  "title": "Что именно запускается",
  "task": "Вытащи только строку запуска: grep ExecStart myapp.service. Именно эту команду systemd выполнит при старте.",
  "setup": { "cwd": "/home/user", "tree": { "myapp.service": "[Unit]\nDescription=My App\n\n[Service]\nUser=app\nExecStart=/usr/bin/python3 app.py\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n" } },
  "check": [
    { "type": "output_contains", "commands": ["grep"], "text": "ExecStart", "message": "команда запуска найдена" }
  ],
  "solution": ["grep ExecStart myapp.service"],
  "hint": "grep печатает строки с указанным словом"
}
```

```terminal
{
  "id": "t2",
  "title": "Кому доверено",
  "task": "Проверь, от какого пользователя запустится служба: grep User myapp.service.",
  "setup": { "cwd": "/home/user", "tree": { "myapp.service": "[Unit]\nDescription=My App\n\n[Service]\nUser=app\nWorkingDirectory=/opt/myapp\nExecStart=/usr/bin/python3 app.py\n\n[Install]\nWantedBy=multi-user.target\n" } },
  "check": [
    { "type": "output_contains", "commands": ["grep"], "text": "app", "message": "пользователь службы найден" }
  ],
  "solution": ["grep User myapp.service"],
  "hint": "grep напечатает строки, где встречается слово User"
}
```

```terminal
{
  "id": "start-study-service",
  "task": "Учебная служба study остановлена. Конфигурация уже готова. Запусти службу.",
  "setup": {
    "tree": {
      "study.conf": "enabled=yes\n"
    },
    "services": {
      "study": {
        "state": "inactive",
        "requires": "study.conf",
        "expected": "enabled=yes",
        "log": []
      }
    }
  },
  "check": [
    {
      "type": "service_state",
      "name": "study",
      "state": "active"
    }
  ],
  "solution": [
    "systemctl start study"
  ],
  "hint": "Для запуска используется действие start."
}
```

## Проверь себя

```quiz
{
  "id": "q0",
  "question": "Чем enable отличается от start?",
  "options": ["enable добавляет в автозапуск, start запускает сейчас", "Это одно и то же", "enable перезапускает службу"],
  "answer": 0,
  "explanation": "«Работает сейчас» и «запустится при загрузке» — разные вещи. enable --now делает сразу оба."
}
```

```quiz
{
  "id": "q1",
  "question": "Ты поправил myapp.service, но служба работает по-старому. Что забыл?",
  "options": ["sudo systemctl daemon-reload", "sudo reboot", "chmod 777 myapp.service"],
  "answer": 0,
  "explanation": "Без daemon-reload systemd не перечитает изменённые unit-файлы."
}
```

```quiz
{
  "id": "q2",
  "question": "Куда кладут свои unit-файлы?",
  "options": ["/etc/systemd/system/", "/usr/lib/systemd/system/", "/var/log/systemd/"],
  "answer": 0,
  "explanation": "/usr/lib принадлежит пакетам: обновление перезапишет твои правки. Своё место — /etc."
}
```

```quiz
{
  "id": "q3",
  "question": "Что покажет systemctl --failed?",
  "options": ["Службы, которые не смогли запуститься", "Список удалённых пакетов", "Свободное место на диске"],
  "answer": 0,
  "explanation": "Быстрый способ увидеть, что система «болит». Дальше — status и логи конкретной службы."
}
```

## Итог дня

- Сейчас ты понимаешь, что служба — это фоновая программа, а systemd ею управляет.
- Ты знаешь устройство unit-файла: секции `[Unit]`, `[Service]`, `[Install]`.
- Ты различаешь `start` и `enable`, знаешь про `daemon-reload` и место своих юнитов.
- Ты умеешь читать чужой unit и находить в нём команду запуска и пользователя.

## Домашка

На своей машине:

1. `systemctl --failed` — есть ли упавшие службы.
2. `systemctl status ssh` (или `sshd`) — прочитай статус, обрати внимание на строку `Loaded:` и `Active:`.
3. `systemctl list-units --type=service --state=running` — сколько служб крутится у тебя прямо сейчас.
4. Напиши свою user-службу (без root): создай `~/.config/systemd/user/hello.service` с `ExecStart=/bin/sleep 3600`, затем `systemctl --user daemon-reload && systemctl --user start hello` и `systemctl --user status hello`.
5. Посмотри `systemctl cat ssh` — как выглядит настоящий unit из пакета.

## <details><summary>🤓 Для любопытных</summary>

- **Таймеры вместо cron** (cron — планировщик задач по расписанию, подробно в уроке 34): пара `backup.service` + `backup.timer` даёт расписание с логами, зависимостями и лимитами. `systemctl list-timers` — расписание, `systemd-analyze calendar "Mon..Fri *-*-* 09:00"` — проверить выражение.
- Полезные опции боевой службы: `Restart=on-failure`, `RestartSec=5`, `MemoryMax=512M`, `CPUQuota=50%`, `LimitNOFILE=65536` — systemd умеет ограничивать ресурсы через cgroups.
- `StartLimitIntervalSec`/`StartLimitBurst` защищают от бесконечного цикла падений и перезапусков.
- **Изоляция**: `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, `NoNewPrivileges=yes`. Оценить: `systemd-analyze security myapp` (0 — отлично, 10 — плохо).
- `systemd-analyze blame` покажет, какая служба тормозит загрузку; `critical-chain` — цепочку самой долгой ветки.
</details>
