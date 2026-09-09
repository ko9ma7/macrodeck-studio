import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dataRoot = path.join(root, 'public', 'data');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const customPath = path.join(dataRoot, 'custom-data.json');
const custom = fs.existsSync(customPath) ? readJson(customPath) : { schemaVersion: 1, items: [] };
if (custom.schemaVersion !== 1) throw new Error('custom-data schemaVersion must be 1');
if (!Array.isArray(custom.items)) throw new Error('custom-data items must be an array');
const ids = new Set();
for (const [i, item] of custom.items.entries()) {
  if (!item.id || !item.title || item.value == null) throw new Error(`custom items[${i}] requires id, title, value`);
  if (ids.has(item.id)) throw new Error(`duplicate custom id: ${item.id}`);
  ids.add(item.id);
  if (item.sourceUrl && !/^https?:\/\//.test(item.sourceUrl)) throw new Error(`invalid sourceUrl: ${item.id}`);
}

const catalogPath = path.join(dataRoot, 'history', 'catalog.json');
if (!fs.existsSync(catalogPath)) throw new Error('history/catalog.json is missing');
const catalog = readJson(catalogPath);
if (!Array.isArray(catalog.items) || !catalog.items.length) throw new Error('history catalog has no series');
let total = 0;
for (const item of catalog.items) {
  if (!item.id || !Number.isFinite(Number(item.points)) || Number(item.points) < 1) throw new Error(`invalid history catalog item: ${item.id || 'unknown'}`);
  const seriesPath = path.join(dataRoot, 'history', `${item.id}.json`);
  if (!fs.existsSync(seriesPath)) throw new Error(`history file missing: ${item.id}`);
  const payload = readJson(seriesPath);
  if (!Array.isArray(payload.series) || payload.series.length < 1) throw new Error(`history series empty: ${item.id}`);
  total += payload.series.length;
}
if (total !== Number(catalog.totalPoints)) throw new Error(`history point count mismatch: catalog=${catalog.totalPoints}, actual=${total}`);

const collection = readJson(path.join(dataRoot, 'collection-meta.json'));
if (!Number.isFinite(Number(collection.snapshotCadenceMinutes)) || Number(collection.snapshotCadenceMinutes) < 5) throw new Error('invalid snapshot cadence');


const libraryPath = path.join(dataRoot, 'reference', 'indicator-library.json');
if (!fs.existsSync(libraryPath)) throw new Error('reference/indicator-library.json is missing');
const library = readJson(libraryPath);
if (!Array.isArray(library.items) || library.items.length < 20) throw new Error('indicator library is unexpectedly small');
for (const page of ['index.html','history.html','sectors.html','catalog.html','admin.html']) {
  if (!fs.existsSync(path.join(root, page))) throw new Error(`missing page: ${page}`);
}

const themeDir = path.join(root, 'app-v5', 'themes');
for (const name of ['monitor','terminal','swiss','editorial','blueprint','glass','cyber','ledger']) {
  if (!fs.existsSync(path.join(themeDir, `${name}.css`))) throw new Error(`missing UI theme: ${name}`);
}


const requiredAssets = ['styles.css','main.js','history.js','sectors.js','catalog.js','shell.js','theme-manager.js','storage.js','data.js','analysis-charts.js'];
for (const asset of requiredAssets) {
  if (!fs.existsSync(path.join(root,'app-v5',asset))) throw new Error(`missing app-v5 asset: ${asset}`);
}
for (const page of ['index.html','history.html','sectors.html','catalog.html']) {
  const html = fs.readFileSync(path.join(root,page),'utf8');
  if (!html.includes('./app-v5/')) throw new Error(`${page} is not using versioned app-v5 assets`);
}

console.log(`OK: ${custom.items.length} custom items · ${catalog.items.length} history series · ${total.toLocaleString()} points · ${library.items.length} library entries · ${collection.snapshotCadenceMinutes}m cadence · app-v5 verified`);
