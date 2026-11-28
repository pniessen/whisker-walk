// Reads a copied performance log (the CSV from For grown-ups > Copy log) and prints one table per device model:
// each place's median and p95 frame ms, share of slow frames (over 40 ms), and the share of time on LOW or lower.
//   node scripts/perfreport.mjs path/to/log.csv
import { readFileSync } from 'node:fs';

export function parseCsv(text) {
  const [head, ...lines] = text.split(/\r?\n/).filter((l) => l.trim());
  const cols = head.split(',');
  // a cell holding a comma (the model id iPad7,11) is in double quotes
  const split = (l) => [...l.matchAll(/("([^"]*)"|[^,]*)(,|$)/g)].slice(0, cols.length).map((m) => (m[2] !== undefined ? m[2] : m[1]));
  return lines.map((l) => Object.fromEntries(split(l).map((v, i) => [cols[i], v])));
}

const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function report(rows) {
  const walks = rows.filter((r) => r.kind === 'walk' && r.place);
  const devices = [...new Set(walks.map((r) => r.device || 'browser'))].sort();
  const out = [];
  for (const dev of devices) {
    const mine = walks.filter((r) => (r.device || 'browser') === dev);
    const mem = mine.find((r) => r.memoryGB)?.memoryGB;
    out.push(`${dev}${mem ? ` (${mem} GB)` : ''}`);
    out.push('place'.padEnd(18) + 'windows  median ms  p95 ms  slow %  on LOW or lower %');
    for (const place of [...new Set(mine.map((r) => r.place))].sort()) {
      const list = mine.filter((r) => r.place === place);
      const w = (r) => Number(r.frames) || 1;
      const total = list.reduce((n, r) => n + w(r), 0);
      const slow = list.reduce((n, r) => n + (Number(r.slowShare) || 0) * w(r), 0) / total;
      const low = list.filter((r) => Number(r.rung) >= 3).reduce((n, r) => n + w(r), 0) / total;
      out.push(place.padEnd(18) + String(list.length).padEnd(9)
        + median(list.map((r) => Number(r.medianMs) || 0)).toFixed(1).padEnd(11)
        + median(list.map((r) => Number(r.p95Ms) || 0)).toFixed(1).padEnd(8)
        + (slow * 100).toFixed(1).padEnd(8) + (low * 100).toFixed(0));
    }
    const starts = rows.filter((r) => r.kind === 'start' && (r.device || 'browser') === dev && r.firstWalkS);
    if (starts.length) out.push(`start-up: first paint ${median(starts.map((r) => Number(r.firstFrameS) || 0)).toFixed(1)} s, first walk ${median(starts.map((r) => Number(r.firstWalkS))).toFixed(1)} s (median of ${starts.length} launches)`);
    out.push('');
  }
  return out.join('\n') || 'No walk rows in that file.';
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const path = process.argv[2];
  if (!path) { console.error('usage: node scripts/perfreport.mjs log.csv'); process.exit(1); }
  console.log(report(parseCsv(readFileSync(path, 'utf8'))));
}
