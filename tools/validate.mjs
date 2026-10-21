// Проверка данных: node tools/validate.mjs
// Проверяет data/index.json и все файлы категорий. Запускается автоматически в GitHub Actions.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const errors = [];
const warn = [];
let total = 0;

const readJSON = (p) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { errors.push(`${p}: неверный JSON — ${e.message}`); return null; }
};

const index = readJSON(join(root, 'index.json'));
if (index) {
  for (const section of ['short', 'long']) {
    const cats = index[section];
    if (!Array.isArray(cats)) { errors.push(`index.json: нет массива "${section}"`); continue; }
    const catIds = new Set();
    for (const cat of cats) {
      const where = `index.json → ${section}/${cat.id}`;
      if (!cat.id || !/^[\w-]+$/.test(cat.id)) errors.push(`${where}: id должен состоять из латиницы, цифр, _ или -`);
      if (catIds.has(cat.id)) errors.push(`${where}: повторяющийся id категории`);
      catIds.add(cat.id);
      if (!cat.title) warn.push(`${where}: нет названия (title)`);
      const file = join(root, cat.file || `${section}/${cat.id}.json`);
      if (!existsSync(file)) { errors.push(`${where}: файл не найден ${file}`); continue; }
      const data = readJSON(file);
      if (!data) continue;
      const list = Array.isArray(data) ? data : data.messages;
      if (!Array.isArray(list)) { errors.push(`${file}: нужен массив "messages"`); continue; }
      const ids = new Set();
      list.forEach((m, i) => {
        const msg = typeof m === 'string' ? { text: m } : m;
        const text = typeof msg.text === 'string' ? msg.text : Object.values(msg.text || {}).join('');
        if (!text.trim()) errors.push(`${file}: сообщение #${i + 1} пустое`);
        if (msg.id !== undefined) {
          if (ids.has(String(msg.id))) errors.push(`${file}: повторяющийся id "${msg.id}"`);
          ids.add(String(msg.id));
        }
      });
      if (!list.length) warn.push(`${file}: категория пустая`);
      total += list.length;
    }
  }
}

warn.forEach((w) => console.warn('⚠️  ' + w));
if (errors.length) {
  errors.forEach((e) => console.error('❌ ' + e));
  process.exit(1);
}
console.log(`✅ Данные в порядке. Сообщений: ${total}`);
