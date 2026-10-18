---
id: 33-logi
title: Логи и journalctl: что случилось и когда
module: 7
minutes: 30
level: base
outcome: "Ты умеешь находить в логах причину сбоя и фильтровать записи по времени, службе и уровню"
---

## Зачем это тебе

«Сайт лежит», «служба не стартует», «ночью что-то было» — на все эти вопросы есть один ответ: посмотреть **логи**. Логи — это бортовой журнал системы: кто запустился, что упало, когда и с какой ошибкой. Умение читать их отличает того, кто чинит проблемы, от того, кто их только создаёт.

## Как это работает

### Что такое лог

**Лог** — файл или журнал, куда программы пишут, что с ними происходит. В современном Linux большинство пишет в системный журнал **journald**, который собирает всё в одно место. Смотреть его — командой `journalctl`.

Базовые приёмы:

```bash
journalctl -u nginx                  # логи конкретной службы
journalctl -u nginx -f               # следить в реальном времени (Ctrl+C — выход)
journalctl -u nginx --since "1 hour ago"   # только за последний час
journalctl --since today             # за сегодня
journalctl -b                        # с момента последней загрузки
journalctl -b -1                     # предыдущая загрузка (после сбоя!)
journalctl -p err                    # только ошибки и выше
journalctl -n 100 --no-pager         # последние 100 строк без пагинации
```

`-b -1` — приём, который спасает после падения сервера: если система перезагрузилась, текущий журнал чист, а причина осталась в предыдущей загрузке.

### Классические логи в /var/log

Рядом с journald живут привычные текстовые файлы. Что где искать:

| Файл | Что внутри |
| --- | --- |
| `syslog` / `messages` | Общий системный лог (Debian / RHEL) |
| `auth.log` / `secure` | Входы, `sudo`, SSH |
| `kern.log` | Сообщения ядра |
| `dpkg.log` | Установка пакетов |
| `nginx/`, `apache2/` | Логи веб-сервера |

Не знаешь, куда смотреть? Сначала ищи по журналу: `journalctl -u <служба>`, а уже потом лезь в `/var/log`.

### Как читать лог

Строка журнала обычно выглядит так: `дата и время`, имя службы, сообщение. Читай сверху вниз и ищи **первую** ошибку — последующие, как правило, её следствие. Частые подсказки в тексте:

- `Address already in use` — порт занят другой программой.
- `Permission denied` — прав не хватает (или SELinux/AppArmor).
- `Connection refused` — приложение не поднялось на нужном порту.
- `Out of memory` — процессу не хватило памяти.

> 💡 Журнал может разрастаться. Проверь размер (`journalctl --disk-usage`) и при необходимости урежь: `sudo journalctl --vacuum-size=500M`. Ротацией текстовых логов занимается logrotate.

## Попробуй

```terminal
{
  "title": "Прочитай лог",
  "task": "Посмотри последние строки лога приложения: tail -n 3 app.log.",
  "shell": "bash",
  "setup": { "cwd": "/home/user", "tree": { "logs": { "app.log": "2026-10-18 09:00:01 INFO start\n2026-10-18 09:00:05 ERROR cannot connect to db\n2026-10-18 09:00:06 ERROR retry\n2026-10-18 09:01:00 INFO recovered\n" } } },
  "check": [
    { "type": "output_contains", "text": "recovered", "message": "видно последние строки журнала" }
  ],
  "solution": ["tail -n 3 logs/app.log"],
  "hint": "tail показывает конец файла, -n 3 — последние три строки"
}
```

```terminal
{
  "title": "Только ошибки",
  "task": "Отфильтруй в логе строки с ошибками: grep ERROR logs/app.log.",
  "shell": "bash",
  "setup": { "cwd": "/home/user", "tree": { "logs": { "app.log": "2026-10-18 09:00:01 INFO start\n2026-10-18 09:00:05 ERROR cannot connect to db\n2026-10-18 09:00:06 ERROR retry\n2026-10-18 09:01:00 INFO recovered\n" } } },
  "check": [
    { "type": "output_contains", "text": "cannot connect to db", "message": "нашёл конкретную ошибку, а не весь лог" }
  ],
  "solution": ["grep ERROR logs/app.log"],
  "hint": "grep печатает только строки с заданным словом"
}
```

```terminal
{
  "title": "Сколько было ошибок",
  "task": "Посчитай количество ошибок: grep -c ERROR logs/app.log.",
  "shell": "bash",
  "setup": { "cwd": "/home/user", "tree": { "logs": { "app.log": "2026-10-18 09:00:01 INFO start\n2026-10-18 09:00:05 ERROR cannot connect to db\n2026-10-18 09:00:06 ERROR retry\n2026-10-18 09:01:00 INFO recovered\n" } } },
  "check": [
    { "type": "output_contains", "text": "2", "message": "видно число строк с ERROR" }
  ],
  "solution": ["grep -c ERROR logs/app.log"],
  "hint": "Ключ -c (count) печатает число подходящих строк"
}
```

## Проверь себя

```quiz
{
  "question": "Сервер упал и перезагрузился. Где искать причину?",
  "options": ["journalctl -b -1 — журнал предыдущей загрузки", "journalctl -b — текущей загрузки", "В корзине"],
  "answer": 0,
  "explanation": "После перезагрузки причина осталась в прошлой загрузке: -b -1."
}
```

```quiz
{
  "question": "Что делает journalctl -u nginx -f?",
  "options": ["Показывает логи nginx и продолжает следить в реальном времени", "Ищет файлы nginx", "Ищет ошибки во всех журналах"],
  "answer": 0,
  "explanation": "-u ограничивает службой, -f — follow, как tail -f."
}
```

```quiz
{
  "question": "В логе написано Address already in use. Что это означает?",
  "options": ["Нужный порт уже занят другой программой", "На диске кончилось место", "Не хватает прав"],
  "answer": 0,
  "explanation": "Служба не смогла занять порт: его слушает кто-то ещё. Смотри ss -tulpn."
}
```

```quiz
{
  "question": "Что делать, если журнал journald растёт слишком быстро?",
  "options": ["Посмотреть journalctl --disk-usage и урезать vacuum-size", "Удалить каталог /var/log", "Отключить логи совсем"],
  "answer": 0,
  "explanation": "--disk-usage покажет объём, --vacuum-size=500M оставит только последние 500 МБ."
}
```

## Итог дня

- Ты понимаешь, зачем нужны логи и где они лежат (`journald` и `/var/log`).
- Ты умеешь фильтровать журнал по службе (`-u`), времени (`--since`) и уровню (`-p err`).
- Ты знаешь приём `-b -1` — разбор причины после перезагрузки.
- Ты умеешь искать и считать ошибки в текстовом логе через `grep` и `grep -c`.

## Домашка

На своей машине:

1. `journalctl -p err -b --no-pager | tail -30` — только ошибки текущей загрузки.
2. `journalctl -u ssh --since "-24 hours"` (или `-u sshd`) — кто подключался к твоей машине.
3. `sudo tail -n 30 /var/log/auth.log` (Ubuntu) или `/var/log/secure` (Fedora) — попытки входа и sudo.
4. `journalctl --disk-usage` — сколько места занимает журнал.
5. Открой второй терминал с `journalctl -f`, а в первом сделай любую команду с `sudo`. Посмотри, как запись появляется в журнале в реальном времени.

## <details><summary>🤓 Для любопытных</summary>

- Точные фильтры: `journalctl _PID=1234` (по процессу), `journalctl _COMM=sshd` (по программе), `journalctl -u nginx --grep timeout -p warning`.
- `journalctl -k -b` — только сообщения ядра текущей загрузки. Туда же смотрит `dmesg -T`.
- Journald по умолчанию хранит журнал в памяти и теряет при перезагрузке; чтобы хранить постоянно: `sudo mkdir -p /var/log/journal && sudo systemctl restart systemd-journald`.
- `-o json-pretty -n 1` покажет все поля одной записи — видно поля, по которым можно фильтровать.
- logrotate (`/etc/logrotate.d/`) сжимает и удаляет старые текстовые логи по расписанию; проверить конфиг — `logrotate -d /etc/logrotate.conf`.
</details>
