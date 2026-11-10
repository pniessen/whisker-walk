#!/usr/bin/env node
// The refresh: rebuild Whisker Walk 2, sign it with a fresh 7-day free
// profile, and install it over the top on family iPhones/iPads this Mac can
// reach (USB or Wi-Fi). It never uninstalls, so saves are kept.
//
//   npm run ios:refresh            from the main checkout, on main: every
//                                  reachable device now, and sets up new ones
//   npm run ios:refresh -- --dev   skip the main-only check (development only)
//   node ios/refresh.mjs --auto    the nightly run (installed by
//                                  `npm run ios:schedule`): renews only devices
//                                  in their last 3 days, waits while the game
//                                  is open, and if main can't ship tonight
//                                  reinstalls the last version that passed
//
// The decisions live in ios/refresh-lib.mjs and ios/autorefresh-lib.mjs
// (tested); this file runs tools.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { preflight, parseDevices, profileMatches, summarize, refreshDevices, updateHistory } from './refresh-lib.mjs';
import { planNight, isGameRunning, nightNotice, notifyScript, latestResults, stillPending } from './autorefresh-lib.mjs';

const TEAM_ID = 'CWCZY9U9A8';
const BUNDLE_ID = 'com.pniessen.WhiskerWalk';
const PROJECT = 'ios/WhiskerWalk.xcodeproj';
const DERIVED = 'ios/build';
const PRODUCT = 'Build/Products/Release-iphoneos/WhiskerWalk.app';
const APP = join(DERIVED, PRODUCT);
// The last build that passed its tests: the game bundle and its commit.
const LAST_GOOD = 'ios/last-good';
const FALLBACK_SRC = resolve(DERIVED, 'fallback-src');
const FALLBACK_DERIVED = resolve(DERIVED, 'fallback-derived');
const PROFILE_DIRS = [
  join(homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles'),
  join(homedir(), 'Library/MobileDevice/Provisioning Profiles'),
];

const dev = process.argv.includes('--dev');
const auto = process.argv.includes('--auto');

/** A step that failed; `reason` is the short form for a notification. */
class StepFailed extends Error {
  constructor(message, { detail = '', reason = message } = {}) {
    super(message);
    this.detail = detail;
    this.reason = reason;
  }
}

function run(cmd, args, { input, timeout, cwd } = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input, timeout, cwd, maxBuffer: 256 * 1024 * 1024 });
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
function attempt(name, cmd, args, opts) {
  mkdirSync(DERIVED, { recursive: true });
  const log = join(DERIVED, `refresh-${name}.log`);
  const r = run(cmd, args, opts);
  writeFileSync(log, r.out + r.err);
  return { ...r, log };
}

function logged(name, cmd, args, { reason, ...opts } = {}) {
  const r = attempt(name, cmd, args, opts);
  if (!r.ok) throw new StepFailed(`${name} failed. Full log: ${r.log}`, { detail: r.out + r.err, reason: reason ?? `${name} failed` });
  return r.out;
}

const lastLine = (text) => text.trim().split('\n').filter(Boolean).pop() ?? '';
const git = (...a) => run('git', a).out.trim();

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

const buildArgs = (destination, { project = PROJECT, derived = DERIVED } = {}) => [
  '-project', project, '-scheme', 'WhiskerWalk', '-configuration', 'Release',
  '-destination', destination, '-derivedDataPath', derived,
  '-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration', 'build',
];
const profileOf = (app) => readProfile(join(app, 'embedded.mobileprovision'));

function build(destination) {
  logged('xcodebuild', 'xcodebuild', buildArgs(destination), { reason: 'the app build failed' });
  return profileOf(APP);
}

// A build for one new device registers it with the free team. If it fails,
// only that device fails: the last good build is still installed elsewhere.
function register(udid) {
  const r = attempt(`register-${udid}`, 'xcodebuild', buildArgs(`platform=iOS,id=${udid}`));
  if (r.ok) return { ok: true, profile: profileOf(APP) };
  const error = (r.out + r.err).split('\n').find((l) => /error:/.test(l)) ?? lastLine(r.out + r.err);
  // Rebuild the generic app so what gets installed is a complete, signed build.
  build('generic/platform=iOS');
  return { ok: false, detail: `${error.replace(/^.*error:\s*/, '').trim()} (log: ${r.log})` };
}

function install(udid, app) {
  const r = run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', udid, app], { timeout: 120_000 });
  return r.ok ? { ok: true } : { ok: false, detail: lastLine(r.error?.message ?? (r.err || r.out)) };
}

// When each device's current install stops opening (gitignored).
const HISTORY = 'ios/installs.json';
const readHistory = () => {
  try { return JSON.parse(readFileSync(HISTORY, 'utf8')); } catch { return {}; }
};

function devicectlJson(args) {
  const file = join(tmpdir(), `whiskerwalk-devicectl-${process.pid}.json`);
  const r = run('xcrun', ['devicectl', ...args, '--json-output', file], { timeout: 120_000 });
  try {
    return r.ok ? JSON.parse(readFileSync(file, 'utf8')) : null;
  } finally {
    rmSync(file, { force: true });
  }
}

function listDevices() {
  const json = devicectlJson(['list', 'devices']);
  if (!json) throw new StepFailed('Could not list devices (xcrun devicectl).', { reason: "the Mac couldn't list devices" });
  return parseDevices(json);
}

// Throw away this app's cached free profile, so signing makes a new one that
// lasts the full 7 days (Xcode would otherwise reuse the old one until it
// runs out).
function renewProfile() {
  step('Renewing the 7-day signing profile');
  for (const dir of PROFILE_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!/\.(mobileprovision|provisionprofile)$/.test(name)) continue;
      const file = join(dir, name);
      if (profileMatches(readProfile(file), { teamId: TEAM_ID, bundleId: BUNDLE_ID })) rmSync(file);
    }
  }
}

// Only main, as committed, in the main checkout.
function checkMain() {
  const state = {
    branch: git('branch', '--show-current'),
    isWorktree: resolve(git('rev-parse', '--git-dir')) !== resolve(git('rev-parse', '--git-common-dir')),
    dirtyFiles: git('status', '--porcelain').split('\n').filter(Boolean),
  };
  const check = preflight(state);
  if (check.ok) return;
  const reason = state.branch !== 'main' ? `cat-game is on ${state.branch || 'no branch'}, not main`
    : state.isWorktree ? 'the refresh ran from a worktree'
      : 'cat-game has uncommitted changes';
  throw new StepFailed(check.reason, { reason });
}

// Test, build and sign main. On success (except --dev) it becomes the last
// good version the nightly run can fall back to.
function freshBuild() {
  if (!dev) checkMain();
  // The same tests the website deploy runs. Only the repo's own test/
  // folder: in the main checkout, a bare `npm test` would also collect the
  // tests inside every other worktree (.worktrees/, .claude/worktrees/),
  // whose unfinished work can fail and would block the family's refresh.
  step('Running the tests');
  logged('tests', 'npx', ['vitest', 'run', '--dir', 'test'], { reason: 'the tests failed on main' });
  step('Building the game for the app');
  logged('build-ios', 'npm', ['run', 'build:ios'], { reason: 'the game build failed' });
  renewProfile();
  step('Building and signing the app');
  const profile = build('generic/platform=iOS');
  if (!dev) {
    rmSync(LAST_GOOD, { recursive: true, force: true });
    cpSync('ios/web', join(LAST_GOOD, 'web'), { recursive: true });
    writeFileSync(join(LAST_GOOD, 'commit'), `${git('rev-parse', 'HEAD')}\n`);
  }
  return { app: APP, profile };
}

// Rebuild the last version that passed, from its own commit and its saved
// game bundle (no tests, no node build), with a fresh signing profile.
function fallbackBuild() {
  const commitFile = join(LAST_GOOD, 'commit');
  if (!existsSync(commitFile)) throw new StepFailed('No last good version is saved yet.', { reason: 'no last good version is saved yet' });
  const sha = readFileSync(commitFile, 'utf8').trim();
  step(`Rebuilding the last good version (${sha.slice(0, 7)})`);
  const dropSource = () => {
    if (existsSync(FALLBACK_SRC)) run('git', ['worktree', 'remove', '--force', FALLBACK_SRC]);
    rmSync(FALLBACK_SRC, { recursive: true, force: true });
    run('git', ['worktree', 'prune']);
  };
  dropSource();
  try {
    logged('fallback-checkout', 'git', ['worktree', 'add', '--detach', FALLBACK_SRC, sha], { reason: `the last good commit ${sha.slice(0, 7)} couldn't be checked out` });
    cpSync(join(LAST_GOOD, 'web'), join(FALLBACK_SRC, 'ios/web'), { recursive: true });
    renewProfile();
    logged('fallback-xcodebuild', 'xcodebuild', buildArgs('generic/platform=iOS', {
      project: join(FALLBACK_SRC, PROJECT), derived: FALLBACK_DERIVED,
    }), { reason: 'the last good version would not build' });
  } finally {
    dropSource();
  }
  const app = join(FALLBACK_DERIVED, PRODUCT);
  return { app, profile: profileOf(app) };
}

function notify(notice) {
  if (!notice) return;
  console.log(`\nNotice: ${notice.title}: ${notice.message}`);
  run('osascript', ['-e', notifyScript(notice)]);
}

function manual() {
  try {
    const built = freshBuild();
    step('Installing on your devices');
    const devices = listDevices();
    const named = new Map(devices.map((d) => [d.udid, d.name]));
    const outcome = refreshDevices({
      devices,
      profile: built.profile,
      register: (udid) => { console.log(`  Setting up ${named.get(udid)} for the first time…`); return register(udid); },
      install: (udid) => { console.log(`  ${named.get(udid)}…`); return install(udid, APP); },
    });
    // Report, and remember each device's new expiry for next time.
    const expiry = new Date(outcome.profile.ExpirationDate);
    const history = readHistory();
    const { lines, exitCode } = summarize(outcome.results, expiry, new Date(), history);
    writeFileSync(HISTORY, `${JSON.stringify(updateHistory(history, outcome.results, expiry), null, 2)}\n`);
    console.log(`\n${lines.join('\n')}`);
    process.exit(exitCode);
  } catch (e) {
    if (e instanceof StepFailed) stop(e.message, e.detail);
    throw e;
  }
}

// Asleep iPads drop off Wi-Fi for a while, and a game may be open, so the
// nightly run keeps trying every RETRY minutes for WINDOW minutes (7 pm to
// 11 pm) and sends one notice at the end.
const option = (name, fallback) => {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? Number(arg.split('=')[1]) : fallback;
};
const RETRY_MS = option('retry-minutes', 30) * 60_000;
const WINDOW_MS = option('window-minutes', 240) * 60_000;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function nightly() {
  const start = new Date();
  const deadline = start.getTime() + WINDOW_MS;
  console.log(`\n=== Nightly refresh, ${start.toString()} ===`);
  let history = readHistory();
  let devices = [];
  let built = null;
  let buildInfo = null;
  let results = [];
  let plan;

  for (let round = 1; ; round += 1) {
    const now = new Date();
    try {
      devices = listDevices();
    } catch (e) {
      if (round === 1) {
        notify(nightNotice({ plan: { devices: [], toRenew: [] }, results: [], expiry: null, build: { kind: 'failed', reason: e.reason }, now }));
        process.exit(1);
      }
      devices = devices.map((d) => ({ ...d, reachable: false }));
    }

    // An install closes the game, so look for it only on devices that are due.
    const due = planNight({ devices, history, playing: new Set(), now }).toRenew;
    const playing = new Set(due.filter((udid) => isGameRunning(devicectlJson(['device', 'info', 'processes', '--device', udid]))));
    plan = planNight({ devices, history, playing, now });
    console.log(`\nRound ${round}, ${now.toLocaleTimeString()}:`);
    for (const d of plan.devices) {
      const left = d.daysLeft === undefined ? '' : ` (${d.daysLeft.toFixed(1)} days left)`;
      console.log(`  ${d.name}: ${d.action}${left}`);
    }

    if (plan.toRenew.length > 0 && !built) {
      try {
        built = freshBuild();
        buildInfo = { kind: 'fresh' };
      } catch (e) {
        if (!(e instanceof StepFailed)) throw e;
        console.log(`  Can't ship main tonight: ${e.message}`);
        try {
          built = fallbackBuild();
          buildInfo = { kind: 'fallback', reason: e.reason };
        } catch (f) {
          if (!(f instanceof StepFailed)) throw f;
          console.log(`  ${f.message}`);
          notify(nightNotice({ plan, results: [], expiry: null, build: { kind: 'failed', reason: `${e.reason}, and ${f.reason}` }, now }));
          process.exit(1);
        }
      }
    }

    if (plan.toRenew.length > 0) {
      step('Installing');
      const named = new Map(plan.devices.map((d) => [d.udid, d.name]));
      const expiry = new Date(built.profile.ExpirationDate);
      const round_ = plan.toRenew.map((udid) => {
        console.log(`  ${named.get(udid)}…`);
        const r = install(udid, built.app);
        const result = { udid, name: named.get(udid), status: r.ok ? 'installed' : 'failed', detail: r.detail };
        console.log(`  ${result.name}: ${result.status}${result.detail ? ` (${result.detail})` : ''}`);
        return result;
      });
      results = results.concat(round_);
      history = updateHistory(history, round_, expiry);
      writeFileSync(HISTORY, `${JSON.stringify(history, null, 2)}\n`);
    }

    const pending = stillPending(plan, results);
    if (pending.length === 0) break;
    if (Date.now() + RETRY_MS > deadline) {
      console.log(`Giving up for tonight on ${pending.length} device${pending.length === 1 ? '' : 's'}.`);
      break;
    }
    console.log(`Trying again in ${RETRY_MS / 60_000} minutes.`);
    sleep(RETRY_MS);
  }

  const expiry = built ? new Date(built.profile.ExpirationDate) : null;
  const notice = nightNotice({ plan, results: latestResults(results), expiry, build: buildInfo, now: new Date() });
  notify(notice);
  if (!built) console.log('Nothing installed tonight.');
  process.exit(notice?.urgent ? 1 : 0);
}

if (auto) nightly();
else manual();
