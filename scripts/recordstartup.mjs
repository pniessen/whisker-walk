// Rewrites test/fixtures/startup-kb.json from the last `npm run build` (dist/):
//   node scripts/recordstartup.mjs [dist]
// The fixture holds the measured gzipped start-up size in kB; test/lazybuild.test.js
// fails if a build is more than "slack" kB above it. Run this on purpose when a
// milestone grows start-up, and say why in the commit message (the ceiling
// itself stays in scripts/buildjson.mjs). The "history" note is kept as is.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { startupFiles } from './buildjson.mjs';

const dir = process.argv[2] || 'dist';
const fixture = new URL('../test/fixtures/startup-kb.json', import.meta.url);
const manifest = JSON.parse(readFileSync(join(dir, '.vite', 'manifest.json'), 'utf8'));
const bytes = startupFiles(manifest).reduce((n, f) => n + gzipSync(readFileSync(join(dir, f))).length, 0);
let old = {};
try { old = JSON.parse(readFileSync(fixture, 'utf8')); } catch { /* first run */ }
const next = { ...old, kb: Math.round(bytes / 10) / 100, slack: old.slack ?? 0.5 };
writeFileSync(fixture, JSON.stringify(next, null, 2) + '\n');
console.log(`start-up ${next.kb} kB (was ${old.kb ?? 'none'}), slack ${next.slack}: wrote test/fixtures/startup-kb.json`);
