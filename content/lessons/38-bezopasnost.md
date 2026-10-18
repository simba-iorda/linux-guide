---
id: 38-bezopasnost
title: Безопасность: базовая гигиена
module: 8
minutes: 30
level: advanced
outcome: "Ты знаешь базовый чек-лист безопасности и умеешь применить его к своей машине или серверу"
---

## Зачем это тебе

Как только машина смотрит в интернет — её начинают перебирать боты. Не потому, что ты интересен, а потому что сканируют всех подряд: в первые минуты после появления сервера в сети логи SSH распухают от попыток входа. Защита при этом не требует быть хакером: достаточно бытовой гигиены из десяти пунктов. Пропустишь их — получишь чужого гостя с твоими правами.

## Как это работает

### Не пароль, а ключ

Пароль подбирается перебором, ключ — нет. Поэтому на любом сервере: вход по ключу, `PasswordAuthentication no`, `PermitRootLogin no`. Настройки SSH живут в `/etc/ssh/sshd_config` (или в файлах `/etc/ssh/sshd_config.d/`). Проверить, что получилось: `sudo sshd -T`, применить: `sudo sshd -t && sudo systemctl reload ssh`.

> 🔴 Не закрывай текущую SSH-сессию, пока не проверишь вход **в новом окне**. Иначе легко остаться без доступа к серверу навсегда.

### Файрвол: сначала пропусти SSH, потом включай

Файрвол закрывает порты, которые не нужны снаружи. В Ubuntu это `ufw`, в RHEL/Fedora — `firewalld`.

```bash
sudo ufw allow OpenSSH     # СНАЧАЛА разреши SSH
sudo ufw enable            # потом включай файрвол
sudo ufw status verbose
```

> 🔴 На удалённом сервере `ufw enable` без разрешённого SSH отрежет тебя от сервера мгновенно. Сначала правило, потом включение.

### Меньше открытых дверей

Загляни, что вообще торчит наружу: `sudo ss -tulpn`. Оставь только то, чем пользуешься. Службе, которой нужен доступ только с этой машины, хватит `127.0.0.1` вместо `0.0.0.0`.

### Чек-лист базовой гигиены

| Что | Как |
| --- | --- |
| Обновления безопасности | Включить unattended-upgrades / dnf-automatic |
| Вход по ключу | `PasswordAuthentication no`, `PermitRootLogin no` |
| Файрвол | Разрешить только нужные порты, сначала SSH |
| Защита от перебора | fail2ban при парольном входе |
| Лишние сервисы | `ss -tulpn` и отключить ненужное |
| Не работать под root | Обычный пользователь + sudo |
| Секреты | Права `600` на ключи и `.env`, никогда не в git |
| Проверка логов | `journalctl _COMM=sshd | grep -i failed` |
| Бэкапы + проверка | Правило 3-2-1 из урока 37 |

### Про пароли и секреты

- Пароль в аргументах команды виден всем через `ps aux` и остаётся в `~/.bash_history`.
- Команда, начинающаяся с пробела, не попадёт в историю при `HISTCONTROL=ignorespace`.
- Приватные ключи и файлы `.env` — права `600` и никогда в git. Один закоммиченный ключ = скомпрометированный сервер.

> 💡 «Permission denied», хотя владелец и права правильные? Почти всегда виноват SELinux (Fedora/RHEL) или AppArmor (Ubuntu). Его не отключают — исправляют контекст (`sudo restorecon -Rv /path`).

## Попробуй

В симуляторе нет ни `sshd`, ни `ufw`, поэтому потренируемся на главном: прочитать конфиг SSH и увидеть в нём опасные строки.

```terminal
{
  "title": "Читаем конфиг SSH",
  "task": "Посмотри настройки SSH-сервера: cat sshd_config.txt. Найди строку PermitRootLogin.",
  "shell": "bash",
  "setup": { "cwd": "/home/user", "tree": { "sshd_config.txt": "# конфиг SSH-сервера\nPort 22\nPermitRootLogin yes\nPasswordAuthentication yes\nPubkeyAuthentication yes\nMaxAuthTries 6\n" } },
  "check": [
    { "type": "output_contains", "text": "PermitRootLogin", "message": "строка про root найдена" }
  ],
  "solution": ["cat sshd_config.txt"],
  "hint": "cat выводит файл целиком"
}
```

```terminal
{
  "title": "Найди самую опасную строку",
  "task": "Вытащи строку про вход по паролю: grep PasswordAuthentication sshd_config.txt. Если там yes — пароли перебираемы.",
  "shell": "bash",
  "setup": { "cwd": "/home/user", "tree": { "sshd_config.txt": "# конфиг SSH-сервера\nPort 22\nPermitRootLogin yes\nPasswordAuthentication yes\nPubkeyAuthentication yes\nMaxAuthTries 6\n" } },
  "check": [
    { "type": "output_contains", "text": "PasswordAuthentication", "message": "строка найдена — видно, что вход по паролю включён" }
  ],
  "solution": ["grep PasswordAuthentication sshd_config.txt"],
  "hint": "grep печатает только строки с указанным словом"
}
```

## Проверь себя

```quiz
{
  "question": "Ты включил ufw на удалённом сервере, не разрешив SSH. Что произойдёт?",
  "options": ["Ты потеряешь доступ к серверу", "Ничего, ufw сам пропустит порт 22", "Сервер выключится"],
  "answer": 0,
  "explanation": "Сначала sudo ufw allow OpenSSH, только потом sudo ufw enable. Это правило №1 при работе с файрволом."
}
```

```quiz
{
  "question": "Почему вход по ключу надёжнее пароля?",
  "options": ["Ключ ed25519 практически невозможно подобрать перебором", "Ключ короче пароля", "С ключом соединение быстрее"],
  "answer": 0,
  "explanation": "Пароли подбирают автоматически, ключ длиной в сотни бит перебором взломать нереально."
}
```

```quiz
{
  "question": "Как сделать, чтобы пароль не попал в историю команд?",
  "options": ["Начать команду с пробела при HISTCONTROL=ignorespace", "Запустить команду дважды", "Добавить в конец слово hide"],
  "answer": 0,
  "explanation": "При ignorespace команда с ведущим пробелом не сохраняется в ~/.bash_history. Лучше вообще не передавать пароли в аргументах."
}
```

```quiz
{
  "question": "Права верные, владелец верный, а доступ всё равно «Permission denied». Что проверить?",
  "options": ["SELinux или AppArmor: ls -Z, ausearch -m avc", "Файловую систему на ошибки", "Свободное место на диске"],
  "answer": 0,
  "explanation": "Это классический признак мандатного доступа. Не отключай SELinux — исправь контекст (restorecon)."
}
```

## Итог дня

- Сейчас ты знаешь базовый чек-лист: обновления, ключи, файрвол, минимум сервисов, бэкапы.
- Ты умеешь читать настройки SSH и находить в них опасные строки.
- Ты понимаешь порядок «разреши SSH, потом включай файрвол» и почему он критичен.
- Ты знаешь правила обращения с секретами: права `600`, не в git, не в аргументах команды.

## Домашка

Пройди чек-лист по своей машине:

1. `sudo ss -tulpn` — что слушает порты наружу. Всё ли это тебе нужно?
2. Обнови систему: `apt update && apt upgrade` (или `dnf upgrade`, `pacman -Syu`).
3. `sudo ufw status` или `sudo firewall-cmd --list-all` — чем защищена твоя машина? Если ничего — включи файрвол, разрешив SSH/локальные службы.
4. `awk -F: '$3 == 0 {print $1}' /etc/passwd` — у кого UID 0. Должен быть только `root`.
5. `sudo lastb | head` и `sudo journalctl _COMM=sshd | grep -i failed | tail` — были ли попытки подбора.
6. Проверь права на свои секреты: `ls -l ~/.ssh ~/.ssh/id_*`. Каталог — `700`, приватный ключ — `600`.

## <details><summary>🤓 Для любопытных</summary>

- **fail2ban** банит IP после нескольких неудачных входов: `maxretry = 5`, `findtime = 10m`, `bantime = 1h`. Полезен там, где пароли ещё включены.
- Быстрый аудит: `sudo find / -xdev -perm -4000 -type f 2>/dev/null` (SUID-файлы), `sudo lynis audit system` (комплексный отчёт с рекомендациями).
- **Автообновления**: `unattended-upgrades` (Debian/Ubuntu) и `dnf-automatic` (RHEL/Fedora). Дополнительно: `ls /var/run/reboot-required` — нужна ли перезагрузка.
- **auditd** отвечает на вопрос «кто и когда менял файл»: `sudo auditctl -w /etc/passwd -p wa -k passwd_changes`, затем `sudo ausearch -k passwd_changes -i`.
- Шифрование и подписи: `gpg -c secret.txt`, `gpg -d secret.txt.gpg`, `sha256sum -c SHA256SUMS`, `gpg --verify file.sig file`.
- Не запускай чужое от имени sudo: `curl URL | sudo bash` — то, чем заражают новичков на форумах.
</details>
