// Reads a `vitest --reporter=json` report and prints HEAVY_COST rows (for
// test/heavy.js) for every test file that took over 20 s, longest first.
//   npx vitest run --reporter=json --outputFile=vt.json
//   node scripts/heavycost.mjs vt.json
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function heavyRows(report, minSeconds = 20) {
  return (report.testResults || [])
    .map((r) => {
      const ms = (r.endTime ?? 0) - (r.startTime ?? 0);
      return [String(r.name).split(/[\\/]/).pop(), Math.round(ms / 1000)];
    })
    .filter(([, s]) => s > minSeconds)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

export const formatRows = (rows) => rows.map(([f, s]) => `  ['${f}', ${s}],`).join('\n');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: node scripts/heavycost.mjs <vitest-json-report>');
    process.exit(1);
  }
  console.log(formatRows(heavyRows(JSON.parse(readFileSync(path, 'utf8')))));
}
