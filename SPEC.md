# Спека: интерактивный учебник Linux (локальный сайт, без сборки)

## Цель

Интерактивный русскоязычный курс «Linux с нуля» на основе шпаргалки
`/tmp/opencode/linux-cheatsheet-src/README.md` (MIT). Локальный статический сайт:
ванильный HTML/CSS/JS, **без сборки, без CDN, работает офлайн**. Запуск:
`python3 -m http.server 8000 -d ~/linux-tutorial`.

## Владельцы файлов (не пересекаться!)

| Дорожка | Пишет | Не трогает |
| --- | --- | --- |
| **Контент (fixer)** | `content/lessons/*.md`, `content/lessons/manifest.json`, `content/cheatsheet.md` | всё остальное |
| **Фронтенд (designer)** | `index.html`, `assets/style.css`, `assets/js/*.js`, `start.sh`, `README.md` | `content/**`, `SPEC.md` |

`assets/vendor/marked.min.js` уже скачан — использовать его для рендера Markdown.

## Уроки (фиксированный список id, порядок обязателен)

| id | title | минут |
| --- | --- | --- |
| 01-chto-takoe-linux | Что такое Linux и терминал | 8 |
| 02-pervye-shagi | Первые шаги и справка | 8 |
| 03-navigaciya | Навигация по файлам | 10 |
| 04-fajly-i-papki | Файлы и папки | 12 |
| 05-prosmotr-fajlov | Как читать файлы | 10 |
| 06-poisk | Поиск: find и grep | 12 |
| 07-prava | Права доступа | 12 |
| 08-sudo | Пользователи и sudo | 8 |
| 09-processy | Процессы | 10 |
| 10-sistema | Информация о системе | 8 |
| 11-pakety | Как ставить программы | 10 |
| 12-chto-dalshe | Что дальше | 5 |

## Формат урока (`content/lessons/<id>.md`)

````
---
id: 03-navigaciya
title: Навигация по файлам
minutes: 10
level: base
---

Текст урока (Markdown)...

```quiz
{
  "question": "Что выведет команда pwd?",
  "options": ["Текущую папку", "Имя пользователя", "Список файлов"],
  "answer": 0,
  "explanation": "pwd = print working directory — печатает текущую директорию."
}
```

```terminal
{
  "title": "Первые команды",
  "task": "Создай папку projects и перейди в неё",
  "setup": { "cwd": "/home/user", "tree": { "README.txt": "Привет!\n" } },
  "check": [
    { "type": "path_exists", "path": "/home/user/projects", "message": "папка projects существует" },
    { "type": "cwd_equals", "path": "/home/user/projects", "message": "ты внутри projects" }
  ],
  "solution": ["mkdir projects", "cd projects"],
  "hint": "mkdir создаёт папку, cd — переходит в неё"
}
```
````

Правила контента:
- Русский язык, тон на «ты», короткие абзацы, аналогии уместны.
- Максимум ~15 команд-таблиц на урок, только базовые флаги.
- Опасное (`rm -rf /`, `mkfs`, продвинутые 🟡/🔴 разделы исходника) — не включать.
- `setup.tree`: строка = файл (её содержимое), объект = папка. Корень дерева = `/home/user`.
- Каждый урок: 1–3 блока `quiz`, 1–4 блока `terminal` (с урока 01 включительно).
- Задачи `terminal` обязаны решаться командами симулятора (список ниже). JSON внутри
  блоков обязан парситься — проверять `python3 -m json.tool` / `json.loads`.

### manifest.json

`content/lessons/manifest.json`:
```json
[{ "id": "01-chto-takoe-linux", "title": "Что такое Linux и терминал", "minutes": 8 }]
```
в том же порядке, что и таблица выше.

### Полный справочник

`content/cheatsheet.md` — копия исходного README как есть. На сайте — отдельный
пункт меню «Полный справочник», рендерится как обычный Markdown.

## Симулятор терминала (`assets/js/simulator.js`)

Скриптованный, в памяти. Домашняя папка `/home/user`. Строка приглашения вида
`user@linux:~$` (сокращать `/home/user` до `~`). Поддержка путей: абсолютные,
относительные, `~`, `..`, `.`.

Команды v1 (флаги — минимально, как в bash):

- `pwd`, `whoami` (→ `user`), `date`, `clear`, `help`, `history`
- `ls [-a -l -h -t]` (включая `-la`, `-lh`), `tree`
- `cd`, `cat`, `head [-n N]`, `tail [-n N]`
- `touch`, `mkdir [-p]`, `cp [-r]`, `mv`, `rm [-r]` (без `-r` на папку — ошибка как в bash)
- `echo` (с `>` и `>>` для файлов, раскрытие `$HOME`, `$USER`)
- `grep [-i -n -v -c]` (файл или stdin после пайпа), `wc [-l -w -c]`, пайп `|`
- `man <cmd>` — короткие справки для поддерживаемых команд
- `uname -a` (canned), `df -h`, `free -h` (canned реалистичные выводы — для урока 10)

Ошибки — в стиле bash по-английски: `mkdir: cannot create directory 'x': File exists`,
`cat: x: No such file or directory`, `rm: cannot remove 'dir': Is a directory`.

Типы проверок `check` (все элементы массива должны выполниться):
`path_exists`, `path_not_exists`, `path_is_dir`, `path_is_file`,
`file_contains {path, text}`, `cwd_equals {path}`, `output_contains {text}` (вывод последней команды).

UX: ввод со стрелками (история), `Ctrl+L` — очистка, `Tab`-автодополнение — nice-to-have.
После прохождения всех `check` — блок «задача выполнена» (галочка), шпаргалка-кнопка
«Показать решение» и «Подсказка». Каждый блок `terminal` — свой изолированный инстанс
(свой `setup.tree`), не делит состояние с другими блоками.

Требование к тестируемости: чистая логика (парсинг команды, файловая модель, проверки)
— отдельные чистые функции; `simulator.js` должен делать
`if (typeof module !== 'undefined') module.exports = {...}` — для smoke-теста в node.

## Квизы (`assets/js/quiz.js`)

Радио-варианты, ответ мгновенный: верно — зелёный + `explanation`, неверно — красный
у выбранного, можно переголосовать. Квиз «пройден», когда дан верный ответ.

## Прогресс

`localStorage` (`linux-tutorial-progress`): пройденные квизы, выполненные terminal-задачи,
завершённые уроки. Урок считается завершённым, когда все его квизы и terminal-задачи
пройдены. В сайдбаре — прогресс (например, «3/12»). Кнопка сброса прогресса в шапке/меню.

## Фронтенд, общее

- ES-модули, без фреймворков, без сборки. Шрифты системные.
- Тёмная «терминальная» эстетика, аккуратная русская типографика, адаптив (мобильные).
- Навигация: сайдбар с уроками (по manifest) + «Полный справочник».
- Внизу урока — «Следующий урок →».
- Уроки загружаются `fetch('content/lessons/<id>.md')` (сайт работает только по http).
- `README.md` — как запустить локально (python3 -m http.server), что это и откуда контент.
- `start.sh` — `#!/usr/bin/env bash; cd "$(dirname "$0")"; exec python3 -m http.server 8000 "$@"`

## Валидация

- fixer: JSON всех блоков парсится; manifest совпадает с файлами.
- designer: симулятор проходит node smoke-тест (экспорт модуля); сайт отдаётся http.server.
- финальная сборка — оркестратор.
