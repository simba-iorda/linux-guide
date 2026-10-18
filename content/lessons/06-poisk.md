---
id: 06-poisk
title: Поиск: find и grep
minutes: 12
level: base
---

Две команды решают две разные задачи поиска: **найти файл** по имени и **найти текст** внутри файлов.

## Поиск файлов: find

`find` идёт по дереву каталогов и проверяет каждый файл по условию:

```bash
find . -name "*.log"          # все файлы, оканчивающиеся на .log
find . -type d -name docs     # только папки с именем docs
find . -iname "readme*"       # то же, но без учёта регистра
```

`find` — медленный, но точный: он реально обходит диск, а не заглядывает в заранее собранный список.

## Поиск текста: grep

`grep` ищет строки, в которых встречается кусок текста:

```bash
grep "error" app.log       # строки со словом error
grep -i "error" app.log    # без учёта регистра
grep -n "error" app.log    # с номерами строк
grep -v "debug" app.log    # наоборот: все строки БЕЗ слова debug
grep -c "error" app.log    # сколько строк нашлось
```

`-i` — ignore case, регистр не важен. `-n` — номера строк, удобно прыгать к месту. `-v` — инверсия, «покажи всё, кроме этого». `-c` — count, только число.

## grep и пайпы

grep умеет читать не только файл, но и вывод другой команды — для этого используется вертикальная черта `|`:

```bash
cat app.log | grep "error"
```

Пайп `|` направляет вывод левой команды на вход правой. Так из маленьких команд собираются цепочки: сначала получить текст, потом отфильтровать.

> 💡 Не бойся ошибок вроде «No such file or directory» — grep просто честно говорит, что такого файла нет. Проверь имя командой `ls`.

```quiz
{
  "question": "Какая команда найдёт все файлы с расширением .log в текущей папке и глубже?",
  "options": ["grep \"*.log\" .", "find . -name \"*.log\"", "ls *.log"],
  "answer": 1,
  "explanation": "find обходит дерево и ищет по имени. ls *.log видит только верхний уровень."
}
```

```quiz
{
  "question": "Что делает grep -v \"debug\" app.log?",
  "options": ["Показывает строки, в которых нет слова debug", "Удаляет строки с debug из файла", "Добавляет debug в файл"],
  "answer": 0,
  "explanation": "-v инвертирует результат: показывает всё, что не совпало. Файл при этом не меняется."
}
```

```quiz
{
  "question": "Зачем нужен символ | в команде cat app.log | grep error?",
  "options": ["Он направляет вывод cat на вход grep", "Он записывает результат в файл", "Он запускает команды параллельно"],
  "answer": 0,
  "explanation": "Это пайп. Вывод первой команды становится входом второй — так строятся конвейеры."
}
```

## Попробуй сам

```terminal
{
  "title": "Ищем ошибки в логе",
  "task": "В файле app.log найди все строки со словом error.",
  "setup": {
    "cwd": "/home/user",
    "tree": {
      "app.log": "start ok\nerror: disk full\ninfo: retry\nerror: timeout\ninfo: done\n"
    }
  },
  "check": [
    { "type": "output_contains", "text": "disk full", "message": "ты нашёл строку с ошибкой" }
  ],
  "solution": ["grep \"error\" app.log"],
  "hint": "grep \"error\" app.log покажет все строки со словом error"
}
```

```terminal
{
  "title": "Считаем совпадения",
  "task": "Посчитай, сколько строк со словом error в файле app.log (используй grep -c).",
  "setup": {
    "cwd": "/home/user",
    "tree": {
      "app.log": "start ok\nerror: disk full\ninfo: retry\nerror: timeout\ninfo: done\n"
    }
  },
  "check": [
    { "type": "output_contains", "text": "2", "message": "выведено число найденных строк" }
  ],
  "solution": ["grep -c \"error\" app.log"],
  "hint": "grep -c печатает только количество совпавших строк"
}
```

```terminal
{
  "title": "Фильтруем список путей",
  "task": "В файле paths.txt лежит список путей. Найди среди них строки, относящиеся к docs.",
  "setup": {
    "cwd": "/home/user",
    "tree": {
      "paths.txt": "/home/user/project/docs/readme.md\n/home/user/project/src/main.txt\n/home/user/archive/docs/old.md\n"
    }
  },
  "check": [
    { "type": "output_contains", "text": "archive/docs/old.md", "message": "найдены пути к docs" }
  ],
  "solution": ["grep \"docs\" paths.txt"],
  "hint": "grep найдёт все строки, где встречается слово в шаблоне"
}
```

```terminal
{
  "title": "Фильтруем через пайп",
  "task": "Выведи только строки без слова debug из файла app.log, используя cat и пайп с grep.",
  "setup": {
    "cwd": "/home/user",
    "tree": {
      "app.log": "start\ndebug: step 1\ninfo: ready\ndebug: step 2\nfinish\n"
    }
  },
  "check": [
    { "type": "output_contains", "text": "ready", "message": "строка info: ready видна" }
  ],
  "solution": ["cat app.log | grep -v debug"],
  "hint": "Флаг -v показывает всё, кроме совпадений"
}
```
