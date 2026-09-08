import fs from 'node:fs';
const path = new URL('../public/data/custom-data.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
if (data.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
if (!Array.isArray(data.items)) throw new Error('items must be an array');
const ids = new Set();
for (const [i, item] of data.items.entries()) {
  if (!item.id || !item.title || item.value == null) throw new Error(`items[${i}] requires id, title, value`);
  if (ids.has(item.id)) throw new Error(`duplicate id: ${item.id}`);
  ids.add(item.id);
  if (item.sourceUrl && !/^https?:\/\//.test(item.sourceUrl)) throw new Error(`invalid sourceUrl: ${item.id}`);
}
console.log(`OK: ${data.items.length} custom items`);
