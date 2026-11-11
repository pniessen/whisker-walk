import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { preflight, parseDevices, profileMatches, summarize, refreshDevices, updateHistory, cloudProblem } from '../ios/refresh-lib.mjs';

// The refresh (ios/refresh.mjs) reinstalls the iOS app on every family
// device. These are its decisions: what may be built, which devices count,
// which cached signing profile to throw away, and what to tell the owner.

const fixture = JSON.parse(readFileSync(new URL('./fixtures/devicectl-devices.json', import.meta.url), 'utf8'));
const ids = { teamId: 'CWCZY9U9A8', bundleId: 'com.pniessen.WhiskerWalk' };

describe('preflight: only main as committed reaches the children', () => {
  it('passes on a clean main checkout', () => {
    expect(preflight({ branch: 'main', isWorktree: false, dirtyFiles: [] })).toEqual({ ok: true });
  });
  it('refuses another branch', () => {
    const r = preflight({ branch: 'ios-app', isWorktree: false, dirtyFiles: [] });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/main/);
  });
  it('refuses a worktree', () => {
    expect(preflight({ branch: 'main', isWorktree: true, dirtyFiles: [] }).ok).toBe(false);
  });
  it('refuses uncommitted changes', () => {
    const r = preflight({ branch: 'main', isWorktree: false, dirtyFiles: ['src/main.js'] });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/uncommitted/);
  });
});

describe('parseDevices', () => {
  const devs = parseDevices(fixture);

  it('keeps physical iPhones and iPads and drops simulators', () => {
    expect(devs.map((d) => d.model).sort()).toEqual(['iPad (A16)', 'iPhone 18 Pro']);
  });

  it('reads name, udid and iOS version', () => {
    const phone = devs.find((d) => d.model === 'iPhone 18 Pro');
    expect(phone).toMatchObject({ name: 'Peter’s iPhone (9501)', udid: '00008160-000000000000PHON', osVersion: '27.2' });
  });

  it('a plugged-in device is reachable, one out of range is not', () => {
    expect(devs.find((d) => d.model === 'iPhone 18 Pro').reachable).toBe(true);
    expect(devs.find((d) => d.model === 'iPad (A16)').reachable).toBe(false);
  });

  it('a device on the home Wi-Fi is reachable before any tunnel is open', () => {
    const wifi = structuredClone(fixture);
    const ipad = wifi.result.devices.find((d) => d.hardwareProperties.marketingName === 'iPad (A16)');
    ipad.connectionProperties = { pairingState: 'paired', tunnelState: 'disconnected', transportType: 'localNetwork' };
    expect(parseDevices(wifi).find((d) => d.model === 'iPad (A16)').reachable).toBe(true);
  });

  it('copes with no devices at all', () => {
    expect(parseDevices({ result: { devices: [] } })).toEqual([]);
    expect(parseDevices({})).toEqual([]);
  });
});

describe('profileMatches: which cached free profiles belong to this app', () => {
  it('matches the app id for this team and bundle', () => {
    expect(profileMatches({ Entitlements: { 'application-identifier': 'CWCZY9U9A8.com.pniessen.WhiskerWalk' } }, ids)).toBe(true);
  });
  it('leaves other apps alone, including the tests bundle and Hello World', () => {
    expect(profileMatches({ Entitlements: { 'application-identifier': 'CWCZY9U9A8.com.pniessen.HelloWorld' } }, ids)).toBe(false);
    expect(profileMatches({ Entitlements: { 'application-identifier': 'CWCZY9U9A8.com.pniessen.WhiskerWalkTests' } }, ids)).toBe(false);
  });
  it('leaves wildcard and malformed profiles alone', () => {
    expect(profileMatches({ Entitlements: { 'application-identifier': 'CWCZY9U9A8.*' } }, ids)).toBe(false);
    expect(profileMatches({}, ids)).toBe(false);
  });
});

describe('summarize', () => {
  const now = new Date('2026-11-10T09:00:00Z');
  const fresh = new Date('2026-11-17T09:00:00Z');
  const text = (r) => r.lines.join('\n');

  it('succeeds when something installed and nothing failed, even if a device was asleep', () => {
    const r = summarize([{ name: 'Dad', status: 'installed' }, { name: 'Iris', status: 'skipped', detail: 'asleep' }], fresh, now);
    expect(r.exitCode).toBe(0);
    expect(text(r)).toMatch(/Iris.*skipped/);
  });

  it('fails when nothing was installed', () => {
    expect(summarize([{ name: 'Iris', status: 'skipped' }], fresh, now).exitCode).toBe(1);
    expect(summarize([], fresh, now).exitCode).toBe(1);
  });

  it('fails when an install errored, and names it', () => {
    const r = summarize([{ name: 'Dad', status: 'installed' }, { name: 'Leo', status: 'failed', detail: 'device locked' }], fresh, now);
    expect(r.exitCode).toBe(1);
    expect(text(r)).toMatch(/Leo.*device locked/);
  });

  it('points a new device at the setup guide', () => {
    const r = summarize([{ name: 'Leo', status: 'unregistered' }, { name: 'Dad', status: 'installed' }], fresh, now);
    expect(text(r)).toMatch(/Leo.*ios\/README\.md/);
  });

  it('says when to refresh again: the day before it expires', () => {
    expect(text(summarize([{ name: 'Dad', status: 'installed' }], fresh, now))).toMatch(/16 Nov/);
  });

  it('warns when the new install expires in under 6 days', () => {
    const r = summarize([{ name: 'Dad', status: 'installed' }], new Date('2026-11-13T09:00:00Z'), now);
    expect(text(r)).toMatch(/warning/i);
    expect(text(summarize([{ name: 'Dad', status: 'installed' }], fresh, now))).not.toMatch(/warning/i);
  });
});

describe('refreshDevices: one device never holds up the others', () => {
  const phone = { udid: 'P', name: 'Dad', reachable: true };
  const newIpad = { udid: 'N', name: 'Leo', reachable: true };
  const asleep = { udid: 'S', name: 'Iris', reachable: false };
  const profile = { ProvisionedDevices: ['P', 'S'], ExpirationDate: '2026-11-17T09:00:00Z' };

  function fakes({ registerOk }) {
    const installed = [];
    return {
      installed,
      register: (udid) => (registerOk
        ? { ok: true, profile: { ...profile, ProvisionedDevices: [...profile.ProvisionedDevices, udid] } }
        : { ok: false, detail: 'Developer Mode is off' }),
      install: (udid) => { installed.push(udid); return { ok: true }; },
    };
  }

  it('a new device that cannot be set up fails alone; the rest still install', () => {
    const f = fakes({ registerOk: false });
    const { results } = refreshDevices({ devices: [phone, newIpad, asleep], profile, ...f });
    expect(f.installed).toEqual(['P']);
    expect(results.find((r) => r.name === 'Dad').status).toBe('installed');
    expect(results.find((r) => r.name === 'Leo')).toMatchObject({ status: 'failed', detail: expect.stringMatching(/Developer Mode is off/) });
    expect(results.find((r) => r.name === 'Iris').status).toBe('skipped');
  });

  it('a new device that can be set up is registered, then installed', () => {
    const f = fakes({ registerOk: true });
    const out = refreshDevices({ devices: [phone, newIpad], profile, ...f });
    expect(f.installed.sort()).toEqual(['N', 'P']);
    expect(out.profile.ProvisionedDevices).toContain('N');
    expect(out.results.every((r) => r.status === 'installed')).toBe(true);
  });

  it('an unregistered device out of range is left for setup, not attempted', () => {
    const f = fakes({ registerOk: true });
    const { results } = refreshDevices({ devices: [{ udid: 'X', name: 'Gran', reachable: false }], profile, ...f });
    expect(results).toEqual([{ name: 'Gran', udid: 'X', status: 'unregistered' }]);
    expect(f.installed).toEqual([]);
  });

  it('a failed install is reported with its reason', () => {
    const { results } = refreshDevices({
      devices: [phone], profile,
      register: () => ({ ok: false }),
      install: () => ({ ok: false, detail: 'device locked' }),
    });
    expect(results[0]).toMatchObject({ status: 'failed', detail: 'device locked' });
  });
});

describe('summarize: every device says when its own app stops opening', () => {
  const now = new Date('2026-11-10T09:00:00Z');
  const fresh = new Date('2026-11-17T09:00:00Z');
  const text = (r) => r.lines.join('\n');

  it('labels the date as the new installs’ expiry', () => {
    expect(text(summarize([{ name: 'Dad', udid: 'P', status: 'installed' }], fresh, now))).toMatch(/New installs expire/);
  });

  it('a skipped device shows the date its earlier install stops opening', () => {
    const history = { S: '2026-11-14T09:00:00Z' };
    const r = summarize([{ name: 'Dad', udid: 'P', status: 'installed' }, { name: 'Iris', udid: 'S', status: 'skipped' }], fresh, now, history);
    expect(text(r)).toMatch(/Iris.*skipped.*stops opening Sat 14 Nov/);
    expect(text(r)).not.toMatch(/warning/i);
  });

  it('warns by name when a skipped device stops opening within 2 days', () => {
    const history = { S: '2026-11-11T09:00:00Z' };
    const r = summarize([{ name: 'Dad', udid: 'P', status: 'installed' }, { name: 'Iris', udid: 'S', status: 'skipped' }], fresh, now, history);
    expect(text(r)).toMatch(/Warning:.*Iris/);
  });

  it('a skipped device with no record says it keeps its earlier date', () => {
    const r = summarize([{ name: 'Dad', udid: 'P', status: 'installed' }, { name: 'Iris', udid: 'S', status: 'skipped' }], fresh, now, {});
    expect(text(r)).toMatch(/Iris.*earlier/);
  });
});

describe('updateHistory', () => {
  it('records the new expiry for installed devices only, keeping the rest', () => {
    const expiry = new Date('2026-11-17T09:00:00Z');
    const results = [{ name: 'Dad', udid: 'P', status: 'installed' }, { name: 'Iris', udid: 'S', status: 'skipped' }];
    expect(updateHistory({ S: '2026-11-14T09:00:00Z', P: '2026-11-12T00:00:00Z' }, results, expiry))
      .toEqual({ S: '2026-11-14T09:00:00Z', P: '2026-11-17T09:00:00.000Z' });
  });
});

// The cloud settings are baked into the game when it is built. A build
// without them has no Save tile, so a child can't bring a cat across or
// restore a deleted app: the refresh must never ship one.
describe('cloudProblem: never ship a game without cloud saves', () => {
  const env = { VITE_SUPABASE_URL: 'https://abcd.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key' };
  it('passes when both settings are set', () => {
    expect(cloudProblem(env)).toBeNull();
  });
  it('refuses when the settings are missing, naming where they go', () => {
    expect(cloudProblem({})).toMatch(/cloud saves.*\.env\.local/);
  });
  it('refuses when one setting is blank', () => {
    expect(cloudProblem({ ...env, VITE_SUPABASE_ANON_KEY: '  ' })).toMatch(/VITE_SUPABASE_ANON_KEY/);
  });
  it('passes a built game that contains the cloud address', () => {
    expect(cloudProblem(env, 'const u="https://abcd.supabase.co";')).toBeNull();
  });
  it('refuses a built game that left the cloud address out', () => {
    expect(cloudProblem(env, 'const u=void 0;')).toMatch(/left out cloud saves/);
  });
});
