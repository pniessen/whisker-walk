import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { preflight, parseDevices, profileMatches, summarize } from '../ios/refresh-lib.mjs';

// The weekly refresh (ios/refresh.mjs) reinstalls the iOS app on every family
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
