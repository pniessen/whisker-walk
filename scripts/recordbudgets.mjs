// Edits one row of test/fixtures/area-budgets.json (the per-area build ceilings that
// test/budget.test.js reads), so a merge no longer conflicts on that test file:
//   node scripts/recordbudgets.mjs <area> <meshes> <casters> <triangles> ["history note to append"]
// Run this on purpose when a milestone grows an area, and say why in the commit message.
// Ceilings are upper bounds only: set them at the measured numbers +12% (the usual
// ruling) and read the measured numbers from `npx vitest run test/budget.test.js`.
// A new area is added as a row here AND to AREA_BUILDERS in test/budget.test.js.
import { readFileSync, writeFileSync } from 'node:fs';

const [name, m, c, t, ...note] = process.argv.slice(2);
if (!name || [m, c, t].some((v) => !Number.isFinite(Number(v)))) {
  console.error('usage: node scripts/recordbudgets.mjs <area> <meshes> <casters> <triangles> ["note"]');
  process.exit(1);
}
const file = new URL('../test/fixtures/area-budgets.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
let row = data.areas.find((r) => r.name === name);
if (!row) data.areas.push((row = { name, meshes: 0, casters: 0, triangles: 0, note: '' }));
const was = `${row.meshes} / ${row.casters} / ${row.triangles}`;
Object.assign(row, { meshes: Number(m), casters: Number(c), triangles: Number(t) });
if (note.length) row.note = `${row.note} ${note.join(' ')}`.trim();
writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log(`${name}: ${was} -> ${m} / ${c} / ${t}: wrote test/fixtures/area-budgets.json`);
