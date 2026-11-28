// Reads a copied performance log (the CSV from For grown-ups > Copy log) and prints one table per device model:
// each place's median and p95 frame ms, share of slow frames (over 40 ms), and the share of time on LOW or lower.
//   node scripts/perfreport.mjs path/to/log.csv
//   node scripts/perfreport.mjs --json rows.json   (rows exported from the perf_reports table, daily summaries only)
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

// Rows exported from the perf_reports table (docs/supabase-v13-perf-reports.sql) as a JSON array → the same row shape
// the report reads (snake_case columns renamed; 'rung' change rows are not windows, so they are left out).
export function fromTableRows(list) {
  const rows = Array.isArray(list) ? list : [];
  return rows.filter((r) => r && r.kind === 'summary').map((r) => ({
    kind: 'walk', device: r.device ?? '', memoryGB: r.memory_gb ?? '', place: r.place ?? '', rung: r.rung ?? '',
    medianMs: r.median_ms ?? 0, p95Ms: r.p95_ms ?? 0, slowShare: r.slow_share ?? 0, frames: 1,
  }));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const json = process.argv[2] === '--json';
  const path = json ? process.argv[3] : process.argv[2];
  if (!path) { console.error('usage: node scripts/perfreport.mjs log.csv | --json rows.json'); process.exit(1); }
  const text = readFileSync(path, 'utf8');
  console.log(report(json ? fromTableRows(JSON.parse(text)) : parseCsv(text)));
}
