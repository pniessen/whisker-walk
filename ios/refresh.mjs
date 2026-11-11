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
//                                  on their last 3 nights, waits while the game
//                                  is open, retries until 11 pm, and if main
//                                  can't ship tonight reinstalls the last
//                                  version that passed
//
// The decisions live in ios/refresh-lib.mjs and ios/autorefresh-lib.mjs
// (tested); this file runs tools.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadEnv } from 'vite';
import { preflight, parseDevices, profileMatches, summarize, refreshDevices, updateHistory, cloudProblem } from './refresh-lib.mjs';
import {
  planNight, isGameRunning, nightNotice, notifyScript, latestResults, stillPending,
  takeLock as takeLockFile, dropLock as dropLockFile,
} from './autorefresh-lib.mjs';

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
// Held while a refresh builds or installs, so a refresh by hand and the
// nightly run never build into ios/build at the same time.
const LOCK = join(DERIVED, 'refresh.lock');
const PROFILE_DIRS = [
  join(homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles'),
  join(homedir(), 'Library/MobileDevice/Provisioning Profiles'),
];
// A step that hangs (a keychain prompt, a stuck test) fails instead of
// blocking every later night.
const MINUTE = 60_000;
const TIMEOUT = { tests: 15 * MINUTE, buildIos: 10 * MINUTE, xcodebuild: 30 * MINUTE, git: 2 * MINUTE, devicectl: 2 * MINUTE };

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
  writeFileSync(log, r.out + r.err + (r.error ? `\n${r.error.message}\n` : ''));
  return { ...r, log };
}

function logged(name, cmd, args, { reason, ...opts } = {}) {
  const r = attempt(name, cmd, args, opts);
  if (!r.ok) {
    const timedOut = r.error?.code === 'ETIMEDOUT';
    throw new StepFailed(`${name} ${timedOut ? 'timed out' : 'failed'}. Full log: ${r.log}`, {
      detail: r.out + r.err,
      reason: `${reason ?? `${name} failed`}${timedOut ? ' (it timed out)' : ''}`,
    });
  }
  return r.out;
}

const lastLine = (text) => text.trim().split('\n').filter(Boolean).pop() ?? '';
const git = (...a) => run('git', a, { timeout: TIMEOUT.git }).out.trim();

// One value from a provisioning profile (they are signed plists).
function profileValue(file, keyPath, format = 'raw') {
  const plist = run('security', ['cms', '-D', '-i', file]);
  if (!plist.ok) return undefined;
  const v = run('plutil', ['-extract', keyPath, format, '-o', '-', '-'], { input: plist.out });
  return v.ok ? v.out.trim() : undefined;
}

function readProfile(file) {
  let devices = [];
  try { devices = JSON.parse(profileValue(file, 'ProvisionedDevices', 'json') ?? '[]'); } catch { /* none */ }
  return {
    Entitlements: { 'application-identifier': profileValue(file, 'Entitlements.application-identifier') },
    ExpirationDate: profileValue(file, 'ExpirationDate'),
    UUID: profileValue(file, 'UUID'),
    ProvisionedDevices: devices,
  };
}

const buildArgs = (destination, { project = PROJECT, derived = DERIVED } = {}) => [
  '-project', project, '-scheme', 'WhiskerWalk', '-configuration', 'Release',
  '-destination', destination, '-derivedDataPath', derived,
  '-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration', 'build',
];

// The signing profile inside a built app; without a readable expiry nothing
// can be installed or remembered.
function profileOf(app) {
  const profile = readProfile(join(app, 'embedded.mobileprovision'));
  if (Number.isNaN(new Date(profile.ExpirationDate).getTime())) {
    throw new StepFailed(`The built app's signing profile could not be read (${app}).`, { reason: "the built app's signing profile could not be read" });
  }
  return profile;
}

function build(destination) {
  logged('xcodebuild', 'xcodebuild', buildArgs(destination), { reason: 'the app build failed', timeout: TIMEOUT.xcodebuild });
  return profileOf(APP);
}

// A build for one new device registers it with the free team. If it fails,
// only that device fails: the last good build is still installed elsewhere.
function register(udid) {
  const r = attempt(`register-${udid}`, 'xcodebuild', buildArgs(`platform=iOS,id=${udid}`), { timeout: TIMEOUT.xcodebuild });
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

/** The device list, or a problem worth an alert when it is missing or unreadable. */
function readHistoryChecked() {
  if (!existsSync(HISTORY)) return { history: {}, problem: `${HISTORY} is missing` };
  try {
    const history = JSON.parse(readFileSync(HISTORY, 'utf8'));
    if (!history || typeof history !== 'object' || Array.isArray(history)) throw new Error('not an object');
    if (Object.keys(history).length === 0) return { history, problem: `${HISTORY} lists no devices` };
    return { history };
  } catch {
    return { history: {}, problem: `${HISTORY} could not be read` };
  }
}
const readHistory = () => readHistoryChecked().history;

// Merge this run's installs into the file as it is now (a refresh by hand may
// have added a device since this run started), written atomically.
function saveInstalls(results, expiry) {
  const next = updateHistory(readHistory(), results, expiry);
  const tmp = `${HISTORY}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(tmp, HISTORY);
  return next;
}

function devicectlJson(args) {
  const file = join(tmpdir(), `whiskerwalk-devicectl-${process.pid}.json`);
  const r = run('xcrun', ['devicectl', ...args, '--json-output', file], { timeout: TIMEOUT.devicectl });
  try {
    return { json: r.ok ? JSON.parse(readFileSync(file, 'utf8')) : null, err: r.err || r.error?.message || '' };
  } catch (e) {
    return { json: null, err: e.message };
  } finally {
    rmSync(file, { force: true });
  }
}

function listDevices() {
  const { json, err } = devicectlJson(['list', 'devices']);
  if (!json) throw new StepFailed('Could not list devices (xcrun devicectl).', { detail: err, reason: "the Mac couldn't list devices" });
  return parseDevices(json);
}

const takeLock = () => takeLockFile(LOCK);
const dropLock = () => dropLockFile(LOCK);
process.on('exit', dropLock);

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

// Cloud saves are baked into the game at build time (from .env.local). A
// game built without them has no Save tile, so never ship one: check the
// settings Vite will use before building, and the built game after.
function checkCloud(builtDir) {
  const env = loadEnv('ios', process.cwd(), 'VITE_');
  const bundle = builtDir === undefined ? undefined : readdirSync(join(builtDir, 'assets'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(builtDir, 'assets', name), 'utf8'))
    .join('\n');
  const problem = cloudProblem(env, bundle);
  if (problem) throw new StepFailed(`Not shipping a game without cloud saves: ${problem}.`, { reason: problem });
}

// Test, build and sign main. On success (except --dev) it becomes the last
// good version the nightly run can fall back to.
function freshBuild() {
  if (!dev) checkMain();
  checkCloud();
  const commit = git('rev-parse', 'HEAD'); // what is tested and built
  // The same tests the website deploy runs. Only the repo's own test/
  // folder: in the main checkout, a bare `npm test` would also collect the
  // tests inside every other worktree (.worktrees/, .claude/worktrees/),
  // whose unfinished work can fail and would block the family's refresh.
  step('Running the tests');
  logged('tests', 'npx', ['vitest', 'run', '--dir', 'test'], { reason: 'the tests failed on main', timeout: TIMEOUT.tests });
  step('Building the game for the app');
  logged('build-ios', 'npm', ['run', 'build:ios'], { reason: 'the game build failed', timeout: TIMEOUT.buildIos });
  checkCloud('ios/web');
  renewProfile();
  step('Building and signing the app');
  const profile = build('generic/platform=iOS');
  if (!dev) saveLastGood(commit);
  return { app: APP, profile };
}

// Replace ios/last-good in one step, so a crash never leaves half of one.
function saveLastGood(commit) {
  const next = `${LAST_GOOD}.next`;
  try {
    rmSync(next, { recursive: true, force: true });
    cpSync('ios/web', join(next, 'web'), { recursive: true });
    writeFileSync(join(next, 'commit'), `${commit}\n`);
    rmSync(LAST_GOOD, { recursive: true, force: true });
    renameSync(next, LAST_GOOD);
  } catch (e) {
    console.log(`  (Could not save this as the last good version: ${e.message})`);
  }
}

// Rebuild the last version that passed, from its own commit and its saved
// game bundle (no tests, no node build), with a fresh signing profile.
function fallbackBuild() {
  const commitFile = join(LAST_GOOD, 'commit');
  if (!existsSync(commitFile) || !existsSync(join(LAST_GOOD, 'web', 'index.html'))) {
    throw new StepFailed('No last good version is saved yet.', { reason: 'no last good version is saved yet' });
  }
  const sha = readFileSync(commitFile, 'utf8').trim();
  step(`Rebuilding the last good version (${sha.slice(0, 7)})`);
  // Only this script's own scratch worktree is ever removed.
  const dropSource = () => {
    run('git', ['worktree', 'remove', '--force', FALLBACK_SRC], { timeout: TIMEOUT.git });
    rmSync(FALLBACK_SRC, { recursive: true, force: true });
  };
  dropSource();
  try {
    logged('fallback-checkout', 'git', ['worktree', 'add', '--force', '--detach', FALLBACK_SRC, sha], {
      reason: `the last good commit ${sha.slice(0, 7)} couldn't be checked out`, timeout: TIMEOUT.git,
    });
    cpSync(join(LAST_GOOD, 'web'), join(FALLBACK_SRC, 'ios/web'), { recursive: true });
    renewProfile();
    logged('fallback-xcodebuild', 'xcodebuild', buildArgs('generic/platform=iOS', {
      project: join(FALLBACK_SRC, PROJECT), derived: FALLBACK_DERIVED,
    }), { reason: 'the last good version would not build', timeout: TIMEOUT.xcodebuild });
    const app = join(FALLBACK_DERIVED, PRODUCT);
    return { app, profile: profileOf(app) };
  } catch (e) {
    if (e instanceof StepFailed) throw e;
    throw new StepFailed(`The last good version could not be rebuilt: ${e.message}`, { reason: 'the last good version could not be rebuilt' });
  } finally {
    dropSource();
  }
}

function notify(notice) {
  if (!notice) return;
  console.log(`\nNotice: ${notice.title}: ${notice.message}`);
  if (process.env.WHISKERWALK_NO_NOTIFY) return; // testing the refresh itself
  run('osascript', ['-e', notifyScript(notice)], { timeout: 30_000 });
}

function manual() {
  const lock = takeLock();
  if (!lock.ok) stop(`Another refresh is running${lock.pid ? ` (process ${lock.pid})` : ''}. Wait for it to finish and try again.`);
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
    const { lines, exitCode } = summarize(outcome.results, expiry, new Date(), readHistory());
    saveInstalls(outcome.results, expiry);
    console.log(`\n${lines.join('\n')}`);
    process.exit(exitCode);
  } catch (e) {
    if (e instanceof StepFailed) stop(e.message, e.detail);
    throw e;
  }
}

// Asleep iPads drop off Wi-Fi for a while, and a game may be open, so the
// nightly run keeps trying every RETRY minutes for WINDOW minutes (7 pm to
// 11 pm) and sends one notice at the end. It exits 0 once it has reported;
// anything else (a crash) makes the launchd wrapper raise its own alert.
const option = (name, fallback) => {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? Number(arg.split('=')[1]) : fallback;
};
const RETRY_MS = option('retry-minutes', 30) * MINUTE;
const WINDOW_MS = option('window-minutes', 240) * MINUTE;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function nightly() {
  const start = new Date();
  const deadline = start.getTime() + WINDOW_MS;
  console.log(`\n=== Nightly refresh, ${start.toString()} ===`);

  const { problem: historyProblem } = readHistoryChecked();
  if (historyProblem) {
    notify(nightNotice({ plan: { devices: [], toRenew: [] }, results: [], expiry: null, build: null, now: start, historyProblem }));
    process.exit(0);
  }

  let devices = null; // the last successful listing
  let listProblem = null;
  let built = null;
  let buildInfo = null;
  let buildFailure = null;
  let results = [];
  let plan = { devices: [], toRenew: [] };

  for (let round = 1; ; round += 1) {
    const now = new Date();
    console.log(`\nRound ${round}, ${now.toLocaleTimeString()}:`);
    const history = readHistory();
    try {
      devices = listDevices();
      listProblem = null;
    } catch (e) {
      // CoreDevice can be slow to come back after the Mac wakes: try again later.
      listProblem = e.reason ?? e.message;
      console.log(`  ${listProblem}`);
      devices = (devices ?? []).map((d) => ({ ...d, reachable: false }));
    }

    // An install closes the game, so look for it only on devices that are due.
    const due = planNight({ devices, history, playing: new Set(), now }).toRenew;
    const playing = new Set(due.filter((udid) => isGameRunning(devicectlJson(['device', 'info', 'processes', '--device', udid]).json)));
    plan = planNight({ devices, history, playing, now });
    for (const d of plan.devices) {
      const left = d.daysLeft === undefined ? '' : ` (${d.daysLeft.toFixed(2)} days left)`;
      console.log(`  ${d.name}: ${d.action}${left}`);
    }

    if (plan.toRenew.length > 0) {
      const lock = takeLock();
      if (!lock.ok) {
        console.log(`  A refresh by hand is running${lock.pid ? ` (process ${lock.pid})` : ''}; skipping this round.`);
      } else {
        try {
          if (!built) {
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
                // Provisioning can fail for a while; build again next round.
                buildFailure = `${e.reason}, and ${f.reason}`;
              }
            }
          }
          if (built) {
            buildFailure = null;
            step('Installing');
            const named = new Map(plan.devices.map((d) => [d.udid, d.name]));
            const expiry = new Date(built.profile.ExpirationDate);
            const thisRound = plan.toRenew.map((udid) => {
              console.log(`  ${named.get(udid)}…`);
              const r = install(udid, built.app);
              const result = { udid, name: named.get(udid), status: r.ok ? 'installed' : 'failed', detail: r.detail };
              console.log(`  ${result.name}: ${result.status}${result.detail ? ` (${result.detail})` : ''}`);
              return result;
            });
            results = results.concat(thisRound);
            saveInstalls(thisRound, expiry);
          }
        } finally {
          dropLock();
        }
      }
    }

    const pending = stillPending(plan, results);
    if (pending.length === 0 && !listProblem) break;
    if (Date.now() + RETRY_MS > deadline) {
      if (pending.length > 0) console.log(`Giving up for tonight on ${pending.length} device${pending.length === 1 ? '' : 's'}.`);
      break;
    }
    console.log(`Trying again in ${RETRY_MS / MINUTE} minutes.`);
    sleep(RETRY_MS);
  }

  const expiry = built ? new Date(built.profile.ExpirationDate) : null;
  const build = buildFailure && !built ? { kind: 'failed', reason: buildFailure } : buildInfo;
  notify(nightNotice({ plan, results: latestResults(results), expiry, build, now: new Date(), listProblem }));
  if (!built) console.log('Nothing installed tonight.');
  process.exit(0);
}

if (auto) nightly();
else manual();
