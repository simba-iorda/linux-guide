# Linux с нуля

Локальный интерактивный учебник по основам Linux. Работает офлайн, без сборки, на чистом HTML/CSS/JS.

Контент основан на шпаргалке [Linux-](https://github.com/justxor/Linux-) (MIT).

## Как запустить

Сайт работает только через HTTP (fetch не умеет `file://`). Самый простой способ:

```bash
./start.sh
```

Или вручную:

```bash
python3 -m http.server 8000 -d ~/linux-tutorial
```

После запуска открой в браузере:

```
http://localhost:8000
```

## Структура

- `index.html` — главная страница.
- `assets/style.css` — стили.
- `assets/js/*.js` — логика: приложение, рендер, квизы, терминал, прогресс.
- `assets/vendor/marked.min.js` — локальный парсер Markdown.
- `content/lessons/*.md` — уроки (отдельная дорожка).
- `content/lessons/manifest.json` — порядок уроков.
- `content/cheatsheet.md` — полный справочник.
- `start.sh` — скрипт запуска локального сервера.
- `SPEC.md` — техническое задание.
