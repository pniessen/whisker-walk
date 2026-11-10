import { describe, it, expect } from 'vitest';
import { planNight, isGameRunning, nightNotice, notifyScript, launchAgentPlist, latestResults, stillPending } from '../ios/autorefresh-lib.mjs';

// The nightly refresh (ios/refresh.mjs --auto, run by launchd at 7 pm) renews
// a device only in its last 3 days, waits while the game is open (until the
// last day), keeps the app alive with the last good build when main can't
// ship, and tells the owner only when there is something to say.

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-14T19:00:00Z');
const inDays = (n) => new Date(now.getTime() + n * DAY).toISOString();
const phone = { udid: 'PHONE', name: 'Peter’s iPhone', reachable: true };
const ipad = { udid: 'IPAD', name: 'Charlie’s iPad', reachable: true };

const actions = (plan) => Object.fromEntries(plan.devices.map((d) => [d.udid, d.action]));

describe('planNight: renew only in the last 3 days', () => {
  it('leaves a device with more than 3 days left alone', () => {
    const plan = planNight({ devices: [phone], history: { PHONE: inDays(3.5) }, playing: new Set(), now });
    expect(actions(plan)).toEqual({ PHONE: 'fine' });
    expect(plan.toRenew).toEqual([]);
  });

  it('renews a reachable device with 3 days or fewer left', () => {
    const plan = planNight({ devices: [phone, ipad], history: { PHONE: inDays(5), IPAD: inDays(2.9) }, playing: new Set(), now });
    expect(actions(plan)).toEqual({ PHONE: 'fine', IPAD: 'renew' });
    expect(plan.toRenew).toEqual(['IPAD']);
  });

  it('renews a device whose app has already stopped opening', () => {
    const plan = planNight({ devices: [ipad], history: { IPAD: inDays(-1) }, playing: new Set(), now });
    expect(plan.toRenew).toEqual(['IPAD']);
  });

  it('marks a due device that is asleep or away as away', () => {
    const plan = planNight({ devices: [{ ...ipad, reachable: false }], history: { IPAD: inDays(2) }, playing: new Set(), now });
    expect(actions(plan)).toEqual({ IPAD: 'away' });
    expect(plan.toRenew).toEqual([]);
  });

  it('counts a known device the Mac no longer lists at all as away, named by its id', () => {
    const plan = planNight({ devices: [], history: { IPAD: inDays(1) }, playing: new Set(), now });
    expect(plan.devices).toEqual([expect.objectContaining({ udid: 'IPAD', name: 'IPAD', action: 'away' })]);
  });

  it('never sets up a new device: that needs the cable and the manual refresh', () => {
    const plan = planNight({ devices: [phone, ipad], history: { PHONE: inDays(1) }, playing: new Set(), now });
    expect(actions(plan)).toEqual({ PHONE: 'renew', IPAD: 'new' });
    expect(plan.toRenew).toEqual(['PHONE']);
  });

  it('carries each device’s expiry and days left', () => {
    const plan = planNight({ devices: [ipad], history: { IPAD: inDays(2.5) }, playing: new Set(), now });
    expect(plan.devices[0].expiry.toISOString()).toBe(inDays(2.5));
    expect(plan.devices[0].daysLeft).toBeCloseTo(2.5);
  });
});

describe('planNight: an install closes the game, so wait while it is open', () => {
  it('waits while the game is open and more than a day is left', () => {
    const plan = planNight({ devices: [ipad], history: { IPAD: inDays(2) }, playing: new Set(['IPAD']), now });
    expect(actions(plan)).toEqual({ IPAD: 'waiting' });
    expect(plan.toRenew).toEqual([]);
  });

  it('renews anyway on the last day: an interrupted walk beats a dead app', () => {
    const plan = planNight({ devices: [ipad], history: { IPAD: inDays(0.9) }, playing: new Set(['IPAD']), now });
    expect(plan.toRenew).toEqual(['IPAD']);
  });
});

describe('latestResults and stillPending: retry the evening until every due device is done', () => {
  const plan = (devices) => ({ devices, toRenew: devices.filter((d) => d.action === 'renew').map((d) => d.udid) });
  const dev = (udid, action) => ({ udid, name: udid, action, daysLeft: 2 });

  it('keeps only each device’s latest result', () => {
    const r = latestResults([
      { udid: 'IPAD', status: 'failed' }, { udid: 'PHONE', status: 'installed' }, { udid: 'IPAD', status: 'installed' },
    ]);
    expect(r).toEqual([{ udid: 'IPAD', status: 'installed' }, { udid: 'PHONE', status: 'installed' }]);
  });

  it('is done when every due device has been installed', () => {
    expect(stillPending(plan([dev('IPAD', 'renew'), dev('PHONE', 'fine')]), [{ udid: 'IPAD', status: 'installed' }])).toEqual([]);
  });

  it('keeps going for away, waiting and failed devices', () => {
    const p = plan([dev('A', 'away'), dev('W', 'waiting'), dev('F', 'renew'), dev('N', 'new')]);
    expect(stillPending(p, [{ udid: 'F', status: 'failed' }]).sort()).toEqual(['A', 'F', 'W']);
  });
});

describe('isGameRunning', () => {
  const procs = (...paths) => ({ result: { runningProcesses: paths.map((executable, i) => ({ executable, processIdentifier: i })) } });
  const game = 'file:///private/var/containers/Bundle/Application/AB12/WhiskerWalk.app/WhiskerWalk';

  it('finds the game among the device’s processes', () => {
    expect(isGameRunning(procs('file:///sbin/launchd', game))).toBe(true);
  });
  it('ignores other apps, including look-alike names', () => {
    expect(isGameRunning(procs('file:///private/var/containers/Bundle/Application/CD34/WhiskerWalkPro.app/WhiskerWalkPro'))).toBe(false);
  });
  it('is false for an empty or unreadable list', () => {
    expect(isGameRunning({})).toBe(false);
    expect(isGameRunning(null)).toBe(false);
  });
});

describe('nightNotice: speak only when there is something to say', () => {
  const plan = (devices) => ({ devices, toRenew: devices.filter((d) => d.action === 'renew').map((d) => d.udid) });
  const dev = (udid, name, action, days) => ({ udid, name, action, expiry: new Date(inDays(days)), daysLeft: days });
  const expiry = new Date(inDays(7));
  const fresh = { kind: 'fresh' };

  it('is silent on a quiet night', () => {
    expect(nightNotice({ plan: plan([dev('PHONE', 'Peter’s iPhone', 'fine', 5)]), results: [], expiry: null, build: null, now })).toBeNull();
  });

  it('is silent while it waits for a game to close with time to spare', () => {
    expect(nightNotice({ plan: plan([dev('IPAD', 'Charlie’s iPad', 'waiting', 2)]), results: [], expiry: null, build: null, now })).toBeNull();
  });

  it('says quietly which devices were renewed and until when', () => {
    const n = nightNotice({
      plan: plan([dev('IPAD', 'Charlie’s iPad', 'renew', 2)]),
      results: [{ udid: 'IPAD', name: 'Charlie’s iPad', status: 'installed' }],
      expiry, build: fresh, now,
    });
    expect(n.urgent).toBe(false);
    expect(n.message).toMatch(/Charlie’s iPad/);
    expect(n.message).toMatch(/Sat 21 Nov/);
  });

  it('warns when the update was held back and the last good version went on instead', () => {
    const n = nightNotice({
      plan: plan([dev('IPAD', 'Charlie’s iPad', 'renew', 2)]),
      results: [{ udid: 'IPAD', name: 'Charlie’s iPad', status: 'installed' }],
      expiry, build: { kind: 'fallback', reason: 'the tests failed' }, now,
    });
    expect(n.urgent).toBe(true);
    expect(n.message).toMatch(/the tests failed/);
    expect(n.message).toMatch(/last good version/);
  });

  it('alerts when the signing was not actually renewed (under 6 days)', () => {
    const n = nightNotice({
      plan: plan([dev('IPAD', 'Charlie’s iPad', 'renew', 2)]),
      results: [{ udid: 'IPAD', name: 'Charlie’s iPad', status: 'installed' }],
      expiry: new Date(inDays(2)), build: fresh, now,
    });
    expect(n.urgent).toBe(true);
    expect(n.message).toMatch(/not renewed/);
  });

  it('alerts when an install failed, naming the device', () => {
    const n = nightNotice({
      plan: plan([dev('IPAD', 'Charlie’s iPad', 'renew', 2)]),
      results: [{ udid: 'IPAD', name: 'Charlie’s iPad', status: 'failed', detail: 'device locked' }],
      expiry, build: fresh, now,
    });
    expect(n.urgent).toBe(true);
    expect(n.message).toMatch(/Charlie’s iPad/);
    expect(n.message).toMatch(/device locked/);
  });

  it('retries a failed install quietly while more than 2 days are left', () => {
    expect(nightNotice({
      plan: plan([dev('IPAD', 'Charlie’s iPad', 'renew', 2.8)]),
      results: [{ udid: 'IPAD', name: 'Charlie’s iPad', status: 'failed', detail: 'device locked' }],
      expiry, build: fresh, now,
    })).toBeNull();
  });

  it('alerts when nothing could be built, with what to run', () => {
    const n = nightNotice({
      plan: plan([dev('IPAD', 'Charlie’s iPad', 'renew', 2)]),
      results: [], expiry: null, build: { kind: 'failed', reason: 'no last good version is saved yet' }, now,
    });
    expect(n.urgent).toBe(true);
    expect(n.message).toMatch(/no last good version/);
    expect(n.message).toMatch(/npm run ios:refresh/);
  });

  it('is quiet about a device away on its first due night', () => {
    expect(nightNotice({ plan: plan([dev('IPAD', 'Charlie’s iPad', 'away', 2.9)]), results: [], expiry: null, build: null, now })).toBeNull();
  });

  it('alerts when a due device has been away into its last 2 days, with its stop date', () => {
    const n = nightNotice({ plan: plan([dev('IPAD', 'Charlie’s iPad', 'away', 1.5)]), results: [], expiry: null, build: null, now });
    expect(n.urgent).toBe(true);
    expect(n.message).toMatch(/Charlie’s iPad/);
    expect(n.message).toMatch(/Mon 16 Nov/);
  });
});

describe('notifyScript', () => {
  it('builds an AppleScript notification with quotes and backslashes escaped', () => {
    const s = notifyScript({ title: 'Whisker "Walk"', message: 'a\\b', urgent: false });
    expect(s).toBe('display notification "a\\\\b" with title "Whisker \\"Walk\\""');
  });
  it('adds an alert sound when urgent', () => {
    expect(notifyScript({ title: 't', message: 'm', urgent: true })).toMatch(/sound name "Basso"$/);
  });
});

describe('launchAgentPlist: the 7 pm job', () => {
  const xml = launchAgentPlist({
    label: 'com.pniessen.whiskerwalk.refresh',
    node: '/Users/p/.local/share/mise/installs/node/26/bin/node',
    repo: '/Users/p/CLAUDE-CODE/projects/cat-game',
    log: '/Users/p/Library/Logs/whisker-walk-refresh.log',
    path: '/Users/p/.local/share/mise/installs/node/26/bin:/usr/bin:/bin',
    hour: 19, minute: 0,
  });

  it('runs the refresh in auto mode from the main checkout', () => {
    expect(xml).toContain('<string>/Users/p/.local/share/mise/installs/node/26/bin/node</string>');
    expect(xml).toContain('<string>/Users/p/CLAUDE-CODE/projects/cat-game/ios/refresh.mjs</string>');
    expect(xml).toContain('<string>--auto</string>');
    expect(xml).toMatch(/<key>WorkingDirectory<\/key>\s*<string>\/Users\/p\/CLAUDE-CODE\/projects\/cat-game<\/string>/);
  });

  it('fires daily at 19:00 and only in the logged-in session', () => {
    expect(xml).toMatch(/<key>StartCalendarInterval<\/key>\s*<dict>\s*<key>Hour<\/key>\s*<integer>19<\/integer>\s*<key>Minute<\/key>\s*<integer>0<\/integer>/);
    expect(xml).toMatch(/<key>LimitLoadToSessionType<\/key>\s*<string>Aqua<\/string>/);
  });

  it('logs to one file and passes a PATH that finds node', () => {
    expect(xml).toMatch(/<key>StandardOutPath<\/key>\s*<string>\/Users\/p\/Library\/Logs\/whisker-walk-refresh.log<\/string>/);
    expect(xml).toMatch(/<key>StandardErrorPath<\/key>\s*<string>\/Users\/p\/Library\/Logs\/whisker-walk-refresh.log<\/string>/);
    expect(xml).toMatch(/<key>PATH<\/key>\s*<string>\/Users\/p\/.local\/share\/mise\/installs\/node\/26\/bin:\/usr\/bin:\/bin<\/string>/);
  });

  it('escapes XML special characters in paths', () => {
    const x = launchAgentPlist({ label: 'l', node: '/a&b/node', repo: '/r<1>', log: '/l', path: '/p', hour: 19, minute: 0 });
    expect(x).toContain('/a&amp;b/node');
    expect(x).toContain('/r&lt;1&gt;');
  });
});
