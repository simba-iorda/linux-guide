---
id: 04-fajly-i-papki
title: Файлы и папки
minutes: 12
level: base
---

Четыре глагола закрывают почти всю повседневную работу с файлами: создать, скопировать, переместить, удалить.

## Создать

```bash
touch notes.txt          # создать пустой файл
mkdir backup             # создать папку
mkdir -p a/b/c           # создать вложенные папки сразу
```

`touch` на существующем файле ничего не портит — просто обновляет дату изменения.

## Скопировать

```bash
cp notes.txt notes_copy.txt   # копия файла
cp -r docs backup/            # копировать папку целиком (-r = рекурсивно)
```

## Переместить и переименовать

В Linux переименование и перемещение — одна и та же операция `mv`:

```bash
mv old.txt new.txt       # переименовать
mv notes.txt /tmp/       # перенести в другую папку
```

## Удалить

```bash
rm notes.txt             # удалить файл
rm -r backup             # удалить папку со всем содержимым
rmdir empty_dir          # удалить пустую папку
```

Тут нужно быть внимательным: **корзины в терминале нет**. `rm` удаляет сразу и окончательно.

> 💡 Правило выживания: перед `rm` с маской или `-r` мысленно прочитай команду и ответь, *какие именно* файлы попадут под неё. Особенно если рядом стоит `*`.

## Как быстро проверить результат

```bash
ls -l        # что получилось
ls -a        # не забыл ли скрытый файл
```

Скрытые файлы (начинаются с точки, например `.bashrc`) обычный `ls` не показывает — это не секретность, а просто соглашение.

```quiz
{
  "question": "Какая команда создаст вложенные папки a/b/c одной строкой?",
  "options": ["mkdir a/b/c", "mkdir -p a/b/c", "touch -r a/b/c"],
  "answer": 1,
  "explanation": "Без -p mkdir ругается, если родительской папки ещё нет. С -p он создаёт всю цепочку."
}
```

```quiz
{
  "question": "Чем mv отличается от cp?",
  "options": ["Ничем", "cp копирует, mv переносит или переименовывает", "mv работает только с папками"],
  "answer": 1,
  "explanation": "Копирование оставляет оригинал, перемещение — нет. Переименование в Linux — это тоже mv."
}
```

```quiz
{
  "question": "Почему rm требует осторожности?",
  "options": ["Он удаляет файл навсегда, без корзины", "Он работает только с root-правами", "После него система перезагружается"],
  "answer": 0,
  "explanation": "Терминальный rm не кладёт файлы в корзину — они исчезают сразу."
}
```

## Попробуй сам

```terminal
{
  "title": "Файл и его копия",
  "task": "Создай файл notes.txt, создай папку backup и скопируй notes.txt внутрь backup.",
  "setup": { "cwd": "/home/user", "tree": { "README.txt": "Привет\n" } },
  "check": [
    { "type": "path_is_file", "path": "/home/user/notes.txt", "message": "notes.txt создан" },
    { "type": "path_is_dir", "path": "/home/user/backup", "message": "папка backup создана" },
    { "type": "path_is_file", "path": "/home/user/backup/notes.txt", "message": "копия лежит в backup" }
  ],
  "solution": ["touch notes.txt", "mkdir backup", "cp notes.txt backup/notes.txt"],
  "hint": "Порядок: touch → mkdir → cp"
}
```

```terminal
{
  "title": "Переименование",
  "task": "Переименуй файл old.txt в new.txt, чтобы старого имени больше не осталось.",
  "setup": { "cwd": "/home/user", "tree": { "old.txt": "Старое содержимое\n" } },
  "check": [
    { "type": "path_is_file", "path": "/home/user/new.txt", "message": "new.txt существует" },
    { "type": "path_not_exists", "path": "/home/user/old.txt", "message": "old.txt больше нет" }
  ],
  "solution": ["mv old.txt new.txt"],
  "hint": "Переименование = перемещение в тот же каталог под новым именем"
}
```

```terminal
{
  "title": "Вложенные папки одной командой",
  "task": "Создай структуру project/src одной командой mkdir -p.",
  "setup": { "cwd": "/home/user", "tree": { "README.txt": "Привет\n" } },
  "check": [
    { "type": "path_is_dir", "path": "/home/user/project/src", "message": "путь project/src создан" }
  ],
  "solution": ["mkdir -p project/src"],
  "hint": "Флаг -p создаёт все родительские папки по пути"
}
```

```terminal
{
  "title": "Уборка",
  "task": "Удали ненужный файл draft.txt, а пустую папку temp оставь как есть.",
  "setup": { "cwd": "/home/user", "tree": { "draft.txt": "черновик\n", "temp": {} } },
  "check": [
    { "type": "path_not_exists", "path": "/home/user/draft.txt", "message": "draft.txt удалён" },
    { "type": "path_is_dir", "path": "/home/user/temp", "message": "temp на месте" }
  ],
  "solution": ["rm draft.txt"],
  "hint": "rm удаляет файлы, rmdir — только пустые папки"
}
```
