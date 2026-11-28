import { describe, it, expect } from 'vitest';
import { crashSignature, groupCrashes, mergeEntries, causeOf } from '../scripts/soak/groups.mjs';
import { buildMatrix, nextJob, markDone, newQueue, reuseQueue, runMinutes } from '../scripts/soak/queue.mjs';
import { resolveRequest } from '../scripts/soak/server.mjs';
import { findChrome, chromeArgs, launchCommand } from '../scripts/soak/chrome.mjs';
import { mulberry32 } from '../scripts/soak/rng.mjs';
import { parseNightArgs, jobArgs } from '../scripts/soak-night.mjs';

const frame = (message, source = 'main-1.js', line = 10) => ({ kind: 'frame', message, source, line, count: 1 });

describe('soak crash grouping', () => {
  it('merges one failure seen by three nets, keeping the entry with a file and line', () => {
    const merged = mergeEntries([{ kind: 'error', message: 'TypeError: x', source: '', line: 0 }, { kind: 'error', message: 'TypeError: x', source: 'moon-9.js', line: 44 }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ source: 'moon-9.js', line: 44 });
  });
  it('groups by message plus file:line and counts, numbers in a message do not split a group', () => {
    const c = (msg, runName, line = 10) => ({ kind: 'diagnostics', entries: [frame(msg, 'a.js', line)], runName, place: 'reef', replay: `r ${runName}` });
    const groups = groupCrashes([c('bad index 3', 'r1'), c('bad index 7', 'r2'), c('other', 'r3'), c('bad index 9', 'r4', 11)]);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ count: 2, first: 'r1', places: { reef: 2 } });
  });
  it('a walk-ended card is grouped by the failure before it', () => {
    const c = { kind: 'walk-ended', entries: [{ kind: 'walk-ended', message: 'card' }, frame('boom', 'x.js', 5)] };
    expect(causeOf(c).message).toBe('boom');
    expect(crashSignature(c)).toContain('x.js:5');
  });
});

describe('soak matrix and queue', () => {
  const jobs = buildMatrix();
  it('puts reef then moon first and covers every place, cat, tv, throttle and couch value', () => {
    expect(jobs[0].place).toBe('reef');
    expect(jobs.findIndex((j) => j.place === 'moon')).toBeGreaterThan(jobs.findIndex((j) => j.place === 'reef' && j.throttle === 6));
    expect(new Set(jobs.map((j) => j.place)).size).toBe(22);
    const reef = jobs.filter((j) => j.place === 'reef');
    expect(new Set(reef.map((j) => j.cat))).toContain('hagrid');
    expect(new Set(reef.map((j) => j.cat))).toContain('custom');
    expect(new Set(reef.map((j) => j.throttle))).toEqual(new Set([1, 4, 6]));
    expect(new Set(reef.map((j) => j.tv))).toEqual(new Set([0, 1]));
    expect(new Set(reef.map((j) => j.couch))).toEqual(new Set([0, 1]));
    expect(new Set(jobs.map((j) => j.id)).size).toBe(jobs.length);
  });
  it('resumes after the last done job, and only reuses a queue for the same matrix', () => {
    let q = newQueue(jobs);
    q = markDone(markDone(q, jobs[0].id), jobs[1].id);
    expect(nextJob(q).id).toBe(jobs[2].id);
    expect(reuseQueue(JSON.parse(JSON.stringify(q)), jobs).done).toHaveLength(2);
    expect(reuseQueue(JSON.parse(JSON.stringify(q)), jobs.slice(1)).done).toHaveLength(0);
    expect(reuseQueue(null, jobs).done).toEqual([]);
  });
  it('gives the last run only what is left of the night', () => {
    expect(runMinutes({ perRun: 4, msLeft: 3600e3 })).toBe(4);
    expect(runMinutes({ perRun: 4, msLeft: 90e3 })).toBe(1.5);
    expect(runMinutes({ perRun: 4, msLeft: -5 })).toBe(0);
  });
  it('can restrict to some places and refuses unknown ones', () => {
    expect(new Set(buildMatrix({ places: ['moon'] }).map((j) => j.place))).toEqual(new Set(['moon']));
    expect(() => parseNightArgs(['--places', 'nowhere'])).toThrow(/unknown place/);
    const a = jobArgs(jobs[0], { out: 'o', chrome: null }, 3);
    expect(a).toContain('--throttle');
    expect(a.slice(a.indexOf('--minutes'), a.indexOf('--minutes') + 2)).toEqual(['--minutes', '3.00']);
  });
});

describe('soak server and chrome helpers', () => {
  it('serves only inside the build, under the base path', () => {
    expect(resolveRequest('/r/dist', '/whisker-walk/')).toBe('/r/dist/index.html');
    expect(resolveRequest('/r/dist', '/whisker-walk/assets/a.js?x=1')).toBe('/r/dist/assets/a.js');
    expect(resolveRequest('/r/dist', '/whisker-walk/../secret')).toBeNull();
    expect(resolveRequest('/r/dist', '/whisker-walk/%2e%2e/secret')).toBeNull();
    expect(resolveRequest('/r/dist', '/elsewhere')).toBeNull();
  });
  it('finds Chrome per platform, with an override', () => {
    expect(findChrome('/x/chrome', 'linux', () => false)).toBe('/x/chrome');
    expect(findChrome(null, 'darwin', () => true)).toContain('Google Chrome.app');
    expect(findChrome(null, 'linux', (p) => p === '/usr/bin/google-chrome')).toBe('/usr/bin/google-chrome');
    expect(() => findChrome(null, 'linux', () => false)).toThrow(/no Chrome/);
  });
  it('starts Chrome headless unless asked, with no sandbox and software GL on Linux, under nice', () => {
    expect(chromeArgs({ profile: '/p', headed: false, platform: 'darwin' })).toContain('--headless=new');
    expect(chromeArgs({ profile: '/p', headed: true, platform: 'darwin' })).not.toContain('--headless=new');
    expect(chromeArgs({ profile: '/p', headed: false, platform: 'linux' })).toContain('--no-sandbox');
    expect(launchCommand('/c', ['a'], 'linux')).toEqual({ cmd: 'nice', args: ['-n', '15', '/c', 'a'] });
  });
});

describe('seeded generator', () => {
  it('repeats for a seed and differs between seeds', () => {
    const a = mulberry32(5); const b = mulberry32(5); const c = mulberry32(6);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
});
