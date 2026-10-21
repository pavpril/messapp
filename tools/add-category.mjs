// Добавить (или перезаписать) категорию из текстового файла.
//
//   node tools/add-category.mjs <short|long> <id> <файл.txt> "Название RU" "Назва UK" [эмодзи]
//
// Пример:
//   node tools/add-category.mjs short birthday birthday.txt "День рождения" "День народження" 🎂
//
// Формат .txt: сообщения разделяются строкой из трёх дефисов (---).
// Если в файле нет ни одной строки "---", сообщения разделяются пустой строкой.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [section, id, src, titleRu, titleUk, icon] = process.argv.slice(2);
if (!['short', 'long'].includes(section) || !id || !src) {
  console.error('Использование: node tools/add-category.mjs <short|long> <id> <файл.txt> "Название RU" "Назва UK" [эмодзи]');
  process.exit(1);
}
if (!/^[\w-]+$/.test(id)) {
  console.error('id категории: только латиница, цифры, _ и - (например, category_3)');
  process.exit(1);
}

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const raw = readFileSync(src, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const parts = /^\s*---\s*$/m.test(raw) ? raw.split(/^\s*---\s*$/m) : raw.split(/\n\s*\n/);
const texts = parts.map((s) => s.trim()).filter(Boolean);

const file = `${section}/${id}.json`;
const out = { messages: texts.map((text, i) => ({ id: String(i + 1), text })) };
mkdirSync(join(dataDir, section), { recursive: true });
writeFileSync(join(dataDir, file), JSON.stringify(out, null, 2) + '\n');

const indexPath = join(dataDir, 'index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
index[section] ||= [];
const entry = {
  id,
  title: { ru: titleRu || id, uk: titleUk || titleRu || id },
  icon: icon || '💬',
  file
};
const pos = index[section].findIndex((c) => c.id === id);
if (pos >= 0) index[section][pos] = { ...index[section][pos], ...entry };
else index[section].push(entry);
writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');

console.log(`Готово: ${texts.length} сообщ. → data/${file}`);
console.log('Важно: если меняете тексты существующих сообщений, сохраняйте их порядок —');
console.log('избранное пользователей привязано к id (номеру) сообщения.');
