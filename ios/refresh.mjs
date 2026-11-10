#!/usr/bin/env node
// The weekly refresh: rebuild Whisker Walk 2, sign it with a fresh 7-day free
// profile, and install it over the top on every family iPhone/iPad this Mac
// can reach (USB or Wi-Fi). It never uninstalls, so saves are kept.
//
//   npm run ios:refresh            from the main checkout, on main
//   npm run ios:refresh -- --dev   skip the main-only check (development only)
//
// The decisions live in ios/refresh-lib.mjs (tested); this file runs tools.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { preflight, parseDevices, profileMatches, summarize, refreshDevices, updateHistory } from './refresh-lib.mjs';

const TEAM_ID = 'CWCZY9U9A8';
const BUNDLE_ID = 'com.pniessen.WhiskerWalk';
const PROJECT = 'ios/WhiskerWalk.xcodeproj';
const DERIVED = 'ios/build';
const APP = join(DERIVED, 'Build/Products/Release-iphoneos/WhiskerWalk.app');
const PROFILE_DIRS = [
  join(homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles'),
  join(homedir(), 'Library/MobileDevice/Provisioning Profiles'),
];

const dev = process.argv.includes('--dev');

function run(cmd, args, { input, timeout } = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input, timeout, maxBuffer: 256 * 1024 * 1024 });
  return { ok: r.status === 0 && !r.error, out: r.stdout ?? '', err: r.stderr ?? '', error: r.error };
}

function stop(message, detail) {
  console.error(`\n✗ ${message}`);
  if (detail) console.error(detail.trim().split('\n').slice(-15).join('\n'));
  process.exit(1);
}

function step(message) {
  console.log(`\n→ ${message}`);
}

// Run a long, noisy command with its output going to a log file.
function attempt(name, cmd, args) {
  mkdirSync(DERIVED, { recursive: true });
  const log = join(DERIVED, `refresh-${name}.log`);
  const r = run(cmd, args);
  writeFileSync(log, r.out + r.err);
  return { ...r, log };
}

function logged(name, cmd, args) {
  const r = attempt(name, cmd, args);
  if (!r.ok) stop(`${name} failed. Full log: ${r.log}`, r.out + r.err);
  return r.out;
}

const lastLine = (text) => text.trim().split('\n').filter(Boolean).pop() ?? '';

// One value from a provisioning profile (they are signed plists).
function profileValue(file, keyPath, format = 'raw') {
  const plist = run('security', ['cms', '-D', '-i', file]);
  if (!plist.ok) return undefined;
  const v = run('plutil', ['-extract', keyPath, format, '-o', '-', '-'], { input: plist.out });
  return v.ok ? v.out.trim() : undefined;
}

function readProfile(file) {
  return {
    Entitlements: { 'application-identifier': profileValue(file, 'Entitlements.application-identifier') },
    ExpirationDate: profileValue(file, 'ExpirationDate'),
    UUID: profileValue(file, 'UUID'),
    ProvisionedDevices: JSON.parse(profileValue(file, 'ProvisionedDevices', 'json') ?? '[]'),
  };
}

const buildArgs = (destination) => [
  '-project', PROJECT, '-scheme', 'WhiskerWalk', '-configuration', 'Release',
  '-destination', destination, '-derivedDataPath', DERIVED,
  '-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration', 'build',
];
const builtProfile = () => readProfile(join(APP, 'embedded.mobileprovision'));

function build(destination) {
  logged('xcodebuild', 'xcodebuild', buildArgs(destination));
  return builtProfile();
}

// A build for one new device registers it with the free team. If it fails,
// only that device fails: the last good build is still installed elsewhere.
function register(udid) {
  const r = attempt(`register-${udid}`, 'xcodebuild', buildArgs(`platform=iOS,id=${udid}`));
  if (r.ok) return { ok: true, profile: builtProfile() };
  const error = (r.out + r.err).split('\n').find((l) => /error:/.test(l)) ?? lastLine(r.out + r.err);
  // Rebuild the generic app so what gets installed is a complete, signed build.
  build('generic/platform=iOS');
  return { ok: false, detail: `${error.replace(/^.*error:\s*/, '').trim()} (log: ${r.log})` };
}

function install(udid) {
  const r = run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', udid, APP], { timeout: 120_000 });
  return r.ok ? { ok: true } : { ok: false, detail: lastLine(r.error?.message ?? (r.err || r.out)) };
}

// When each device's current install stops opening (gitignored).
const HISTORY = 'ios/installs.json';
const readHistory = () => {
  try { return JSON.parse(readFileSync(HISTORY, 'utf8')); } catch { return {}; }
};

function listDevices() {
  const file = join(tmpdir(), `whiskerwalk-devices-${process.pid}.json`);
  const r = run('xcrun', ['devicectl', 'list', 'devices', '--json-output', file]);
  if (!r.ok) stop('Could not list devices (xcrun devicectl).', r.err);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  rmSync(file, { force: true });
  return parseDevices(json);
}

// 1. Only main, as committed.
if (!dev) {
  const git = (...a) => run('git', a).out.trim();
  const check = preflight({
    branch: git('branch', '--show-current'),
    isWorktree: resolve(git('rev-parse', '--git-dir')) !== resolve(git('rev-parse', '--git-common-dir')),
    dirtyFiles: git('status', '--porcelain').split('\n').filter(Boolean),
  });
  if (!check.ok) stop(check.reason);
}

// 2. The same tests the website deploy runs. Only the repo's own test/
//    folder: in the main checkout, a bare `npm test` would also collect the
//    tests inside every other worktree (.worktrees/, .claude/worktrees/),
//    whose unfinished work can fail and would block the family's refresh.
step('Running the tests');
logged('tests', 'npx', ['vitest', 'run', '--dir', 'test']);

// 3. The app's copy of the game.
step('Building the game for the app');
logged('build-ios', 'npm', ['run', 'build:ios']);

// 4. Throw away this app's cached free profile, so signing makes a new one
//    that lasts the full 7 days (Xcode would otherwise reuse the old one
//    until it runs out).
step('Renewing the 7-day signing profile');
for (const dir of PROFILE_DIRS) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!/\.(mobileprovision|provisionprofile)$/.test(name)) continue;
    const file = join(dir, name);
    if (profileMatches(readProfile(file), { teamId: TEAM_ID, bundleId: BUNDLE_ID })) rmSync(file);
  }
}

// 5. Build and sign.
step('Building and signing the app');
let profile = build('generic/platform=iOS');

// 6. Install on every family device.
step('Installing on your devices');
const devices = listDevices();
const named = new Map(devices.map((d) => [d.udid, d.name]));
const outcome = refreshDevices({
  devices,
  profile,
  register: (udid) => { console.log(`  Setting up ${named.get(udid)} for the first time…`); return register(udid); },
  install: (udid) => { console.log(`  ${named.get(udid)}…`); return install(udid); },
});
profile = outcome.profile;

// 7. Report, and remember each device's new expiry for next time.
const expiry = new Date(profile.ExpirationDate);
const history = readHistory();
const { lines, exitCode } = summarize(outcome.results, expiry, new Date(), history);
writeFileSync(HISTORY, `${JSON.stringify(updateHistory(history, outcome.results, expiry), null, 2)}\n`);
console.log(`\n${lines.join('\n')}`);
process.exit(exitCode);
