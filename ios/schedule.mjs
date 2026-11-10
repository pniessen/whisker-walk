#!/usr/bin/env node
// Turn the nightly refresh on or off on this Mac.
//
//   npm run ios:schedule                 every evening at 7 pm (run from the main checkout)
//   npm run ios:schedule -- status       is it on, and what did the last run say
//   npm run ios:schedule -- remove       turn it off
//
// It installs a launchd agent that runs `node ios/refresh.mjs --auto` while
// you are logged in; if the Mac is asleep at 7 pm, it runs when it wakes.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { launchAgentPlist, stableNode } from './autorefresh-lib.mjs';

const LABEL = 'com.pniessen.whiskerwalk.refresh';
const PLIST = join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
const LOG = join(homedir(), 'Library/Logs/whisker-walk-refresh.log');
const DOMAIN = `gui/${process.getuid()}`;

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '') + (r.stderr ?? '') };
};
const git = (...a) => run('git', a).out.trim();

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function install() {
  const repo = git('rev-parse', '--show-toplevel');
  if (resolve(git('rev-parse', '--git-dir')) !== resolve(git('rev-parse', '--git-common-dir'))) {
    fail('Run this from the main checkout of cat-game, not from a worktree: the nightly job builds what is there.');
  }
  const node = stableNode(process.execPath, existsSync);
  const nodeBin = dirname(node);
  const xml = launchAgentPlist({
    label: LABEL,
    node,
    repo,
    log: LOG,
    path: [nodeBin, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
    hour: 19,
    minute: 0,
  });
  mkdirSync(dirname(PLIST), { recursive: true });
  mkdirSync(dirname(LOG), { recursive: true });
  writeFileSync(PLIST, xml);
  const lint = run('plutil', ['-lint', PLIST]);
  if (!lint.ok) fail(`The job file is not valid: ${lint.out}`);
  run('launchctl', ['bootout', `${DOMAIN}/${LABEL}`]);
  const boot = run('launchctl', ['bootstrap', DOMAIN, PLIST]);
  if (!boot.ok) fail(`launchctl could not load the job: ${boot.out.trim()}`);
  console.log(`✓ The nightly refresh is on: every evening at 7 pm, from ${repo}.`);
  console.log(`  It renews devices in their last 3 days and retries until 11 pm.`);
  console.log(`  Log: ${LOG}`);
  console.log('  Check it: npm run ios:schedule -- status    Turn it off: npm run ios:schedule -- remove');
}

function remove() {
  run('launchctl', ['bootout', `${DOMAIN}/${LABEL}`]);
  rmSync(PLIST, { force: true });
  console.log('✓ The nightly refresh is off. Run npm run ios:refresh by hand each week.');
}

function status() {
  const loaded = run('launchctl', ['print', `${DOMAIN}/${LABEL}`]);
  if (!existsSync(PLIST) || !loaded.ok) {
    console.log('The nightly refresh is off. Turn it on with: npm run ios:schedule');
    return;
  }
  const node = /<array>\s*<string>([^<]+)<\/string>/.exec(readFileSync(PLIST, 'utf8'))?.[1];
  console.log('The nightly refresh is on: every evening at 7 pm.');
  if (node && !existsSync(node)) {
    console.log(`✗ But its node (${node}) is gone, probably after a Node upgrade. Run npm run ios:schedule again.`);
  }
  const lastExit = /last exit code = (.+)/.exec(loaded.out)?.[1];
  if (lastExit) console.log(`Last run's exit code: ${lastExit}`);
  if (existsSync(LOG)) {
    const lines = readFileSync(LOG, 'utf8').trim().split('\n');
    const start = lines.findLastIndex((l) => l.startsWith('=== Nightly refresh'));
    console.log(`\nLast run (${LOG}):\n${lines.slice(Math.max(start, lines.length - 40)).join('\n')}`);
  }
}

const command = process.argv[2] ?? 'install';
if (command === 'install') install();
else if (command === 'remove') remove();
else if (command === 'status') status();
else fail(`Unknown command "${command}". Use install, status or remove.`);
