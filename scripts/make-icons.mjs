#!/usr/bin/env node
// Renders public/icon.svg to the PNG icons the Android install needs:
// public/icon-192.png, public/icon-512.png and public/icon-maskable-512.png.
// Uses headless Chrome (no packages). The maskable one has no rounded corners
// and the cat is shrunk into the central 80 percent, the safe zone.
// Usage: node scripts/make-icons.mjs [--chrome <path>]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromeAt = process.argv.indexOf('--chrome');
const CHROME = chromeAt > 0 ? process.argv[chromeAt + 1] : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const svg = readFileSync(join(root, 'public/icon.svg'), 'utf8');

export function maskableSvg(src) {
  const open = src.indexOf('>', src.indexOf('<svg')) + 1;
  const body = src.slice(open, src.lastIndexOf('</svg>')).replace(' rx="96"', '');
  return `${src.slice(0, open)}<rect width="512" height="512" fill="#1c2431"/><g transform="translate(51.2 51.2) scale(0.8)">${body}</g></svg>`;
}

function render(svgText, size, out, dir) {
  const html = join(dir, `${size}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(html, `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svgText}`);
  const shot = join(dir, `shot-${size}-${out.length}.png`);
  const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    `--user-data-dir=${join(dir, 'profile')}`, `--window-size=${size},${size}`, `--screenshot=${shot}`, `file://${html}`], { encoding: 'utf8' });
  if (r.error || !existsSync(shot)) throw new Error('Chrome failed: ' + (r.error || r.stderr));
  copyFileSync(shot, out);
}

const dir = mkdtempSync(join(tmpdir(), 'icons-'));
try {
  render(svg, 192, join(root, 'public/icon-192.png'), dir);
  render(svg, 512, join(root, 'public/icon-512.png'), dir);
  render(maskableSvg(svg), 512, join(root, 'public/icon-maskable-512.png'), dir);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
