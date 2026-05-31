/* Validate widget files and stamp the widget version (for SE auto-update).
   Usage:
     npm run build      → stamp widget.json widgetVersion from package.json
     npm run validate   → validate only (no writes)  [build.mjs --check] */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const read = (p) => readFile(path.join(ROOT, p), 'utf8');

function fail(msg) { console.error('✗ ' + msg); process.exitCode = 1; }

const pkg = JSON.parse(await read('package.json'));
const rawJson = await read('widget/widget.json');

let fields;
try { fields = JSON.parse(rawJson); }
catch (e) { fail('widget.json is not valid JSON: ' + e.message); process.exit(1); }

// Required hidden fields for auto-update.
for (const k of ['widgetName', 'widgetAuthor', 'widgetVersion', 'widgetUpdateUrl']) {
  if (!fields[k]) fail(`widget.json missing required field: ${k}`);
}
// Every field needs a type.
for (const [k, v] of Object.entries(fields)) {
  if (!v || typeof v !== 'object' || !v.type) fail(`field "${k}" missing "type"`);
}

const groups = [...new Set(Object.values(fields).map(f => f.group).filter(Boolean))];
console.log(`Fields: ${Object.keys(fields).length}  ·  Groups: ${groups.length} (${groups.join(', ')})`);

// Confirm html/css/js exist and are non-empty.
for (const f of ['widget/widget.html', 'widget/widget.css', 'widget/widget.js']) {
  const c = await read(f).catch(() => '');
  if (!c.trim()) fail(`${f} is empty or missing`);
}

if (process.exitCode === 1) { console.error('Build validation failed.'); process.exit(1); }

if (CHECK) { console.log('✓ Validation passed.'); process.exit(0); }

// Stamp version from package.json into widget.json.
if (fields.widgetVersion.value !== pkg.version) {
  fields.widgetVersion.value = pkg.version;
  await writeFile(path.join(ROOT, 'widget/widget.json'), JSON.stringify(fields, null, 2) + '\n');
  console.log(`✓ Stamped widgetVersion = ${pkg.version}`);
} else {
  console.log(`✓ widgetVersion already ${pkg.version}`);
}
