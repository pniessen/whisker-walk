// soak-out/summary.json: every run folder's run.json and crash.json, crashes grouped.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { groupCrashes } from './groups.mjs';

const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };

export function writeSummary(outRoot) {
  const runs = [];
  const crashes = [];
  if (existsSync(outRoot)) {
    for (const d of readdirSync(outRoot).sort()) {
      const run = readJson(join(outRoot, d, 'run.json'));
      if (!run) continue;
      runs.push(run);
      const crash = readJson(join(outRoot, d, 'crash.json'));
      if (crash) crashes.push({ ...crash, runName: d });
    }
  }
  const summary = {
    updated: new Date().toISOString(),
    runs: runs.length,
    cleanRuns: runs.filter((r) => r.status === 'ok').length,
    crashedRuns: crashes.length,
    minutesPlayed: Math.round(runs.reduce((n, r) => n + (r.minutes ?? 0), 0) * 10) / 10,
    groups: groupCrashes(crashes),
  };
  writeFileSync(join(outRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}
