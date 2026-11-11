import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createHaptics, pickOutput, hapticsAvailable, hapticForDiscovery,
  BRIDGE_MESSAGES, VIBRATE_PATTERNS, MIN_GAP_MS, PURR_BEAT_MS, PURR_MAX_S, HAPTIC_KINDS,
} from '../src/haptics.js';

// The haptics module (src/haptics.js): which output, the vocabulary, the rate
// limit, and the purr's timer. Everything it touches is handed in, so these
// tests need no window, navigator or real time.

// A clock, timers and a deferral queue the test drives by hand.
function rig({ bridge = true, deviceHaptics = true, vibrate = false, enabled = true } = {}) {
  let t = 1000;
  const sent = [];
  const buzzes = [];
  const timers = new Map();
  let nextId = 1;
  const deferred = [];
  const h = createHaptics({
    bridge: bridge ? { postMessage: (m) => sent.push(m) } : null,
    deviceHaptics,
    vibrate: vibrate ? (p) => { buzzes.push(p); return true; } : null,
    now: () => t,
    setInterval: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
    clearInterval: (id) => { timers.delete(id); },
    defer: (fn) => deferred.push(fn),
    enabled,
  });
  const flush = () => { while (deferred.length) deferred.shift()(); };
  // Moves the clock on in interval steps, running each live interval as it falls due.
  const advance = (ms) => {
    const end = t + ms;
    while (timers.size) {
      const [, timer] = [...timers][0];
      if (t + timer.ms > end) break;
      t += timer.ms;
      timer.fn();
    }
    t = end;
  };
  return { h, sent, buzzes, timers, flush, advance, tick: (ms) => { t += ms; } };
}

describe('the output is chosen once', () => {
  const bridge = { postMessage() {} };
  const vibrate = () => true;
  it('the app\'s bridge on a device that can buzz', () => {
    expect(pickOutput({ bridge, deviceHaptics: true, vibrate })).toBe('bridge');
  });
  it('an iPad in the app has the bridge but no Taptic Engine: nothing', () => {
    expect(pickOutput({ bridge, deviceHaptics: false, vibrate: null })).toBe('none');
    expect(pickOutput({ bridge, deviceHaptics: undefined, vibrate: null })).toBe('none');
  });
  it('a browser with navigator.vibrate (Android) uses it', () => {
    expect(pickOutput({ bridge: null, vibrate })).toBe('vibrate');
  });
  it('Safari and desktop: nothing', () => {
    expect(pickOutput({})).toBe('none');
    expect(pickOutput({ bridge: {}, deviceHaptics: true })).toBe('none'); // no postMessage
    expect(pickOutput({ vibrate: 'yes' })).toBe('none');
  });
  it('hapticsAvailable is true exactly when there is an output', () => {
    expect(hapticsAvailable({ bridge, deviceHaptics: true })).toBe(true);
    expect(hapticsAvailable({ bridge, deviceHaptics: false })).toBe(false);
    expect(hapticsAvailable({ vibrate })).toBe(true);
    expect(hapticsAvailable({})).toBe(false);
    expect(rig().h.available).toBe(true);
    expect(rig({ bridge: false }).h.available).toBe(false);
  });
});

describe('the vocabulary', () => {
  it('four kinds and a purr beat, each a short word the Swift side knows', () => {
    expect(HAPTIC_KINDS).toEqual(['tap', 'double', 'success', 'hit']);
    expect(BRIDGE_MESSAGES).toEqual({ tap: 'tap', double: 'double', success: 'success', hit: 'hit', purr: 'purr' });
    for (const k of [...HAPTIC_KINDS, 'purr']) expect(VIBRATE_PATTERNS[k]).toBeDefined();
  });
  it('sends each kind over the bridge as its word', () => {
    const { h, sent, flush, tick } = rig();
    for (const k of HAPTIC_KINDS) { h.play(k); flush(); tick(MIN_GAP_MS); }
    expect(sent).toEqual(['tap', 'double', 'success', 'hit']);
  });
  it('plays each kind as its vibrate pattern', () => {
    const { h, buzzes, flush, tick } = rig({ bridge: false, vibrate: true });
    for (const k of HAPTIC_KINDS) { h.play(k); flush(); tick(MIN_GAP_MS); }
    expect(buzzes).toEqual(HAPTIC_KINDS.map((k) => VIBRATE_PATTERNS[k]));
  });
  it('an unknown kind is ignored', () => {
    const { h, sent, flush } = rig();
    expect(h.play('earthquake')).toBe(false);
    h.play(undefined);
    flush();
    expect(sent).toEqual([]);
  });
  it('a bridge or vibrate that throws is swallowed', () => {
    const h = createHaptics({ bridge: { postMessage() { throw new Error('gone'); } }, deviceHaptics: true, defer: (fn) => fn(), now: () => 0 });
    expect(() => h.play('tap')).not.toThrow();
    const v = createHaptics({ vibrate: () => { throw new Error('no'); }, defer: (fn) => fn(), now: () => 0 });
    expect(() => v.play('tap')).not.toThrow();
  });
  it('with no output nothing is ever sent, and nothing throws', () => {
    const { h, sent, buzzes, flush, timers } = rig({ bridge: false });
    h.play('success');
    h.purr(2);
    flush();
    expect(sent).toEqual([]);
    expect(buzzes).toEqual([]);
    expect(timers.size).toBe(0);
  });
});

describe('rate limiting and priority', () => {
  it('a burst in one moment plays once, the strongest winning', () => {
    const { h, sent, flush } = rig();
    h.play('tap');
    h.play('success');
    h.play('tap');
    h.play('double');
    flush();
    expect(sent).toEqual(['success']);
  });
  it('no more than one haptic per gap', () => {
    const { h, sent, flush, tick } = rig();
    h.play('tap'); flush();
    tick(MIN_GAP_MS - 1);
    h.play('tap'); flush();
    tick(1);
    h.play('tap'); flush();
    expect(sent).toEqual(['tap', 'tap']);
  });
  it('a stronger one just after a weaker one still plays: a success never loses to a tap', () => {
    const { h, sent, flush, tick } = rig();
    h.play('tap'); flush();
    tick(10);
    h.play('success'); flush();
    tick(10);
    h.play('tap'); flush();
    h.play('success'); flush();
    expect(sent).toEqual(['tap', 'success']);
  });
  it('a held-down stream of events cannot buzz continuously', () => {
    const { h, sent, flush, tick } = rig();
    for (let i = 0; i < 100; i++) { h.play('hit'); flush(); tick(16); }
    expect(sent.length).toBeLessThanOrEqual(Math.ceil((100 * 16) / MIN_GAP_MS));
  });
});

describe('the purr', () => {
  it('starts with a beat at once and repeats at its calm rhythm', () => {
    const { h, sent, advance } = rig();
    h.purr(2);
    expect(h.purring).toBe(true);
    expect(sent).toEqual(['purr']);
    advance(PURR_BEAT_MS * 3);
    expect(sent).toEqual(['purr', 'purr', 'purr', 'purr']);
  });
  it('stops by itself when its time is up', () => {
    const { h, sent, advance, timers } = rig();
    h.purr(1);
    advance(5000);
    expect(h.purring).toBe(false);
    expect(timers.size).toBe(0);
    const beats = sent.length;
    expect(beats).toBe(Math.ceil(1000 / PURR_BEAT_MS));
    advance(5000);
    expect(sent.length).toBe(beats);
  });
  it('a nap\'s next piece extends the one purr; it never starts a second timer', () => {
    const { h, advance, timers } = rig();
    h.purr(1);
    advance(800);
    h.purr(1);
    expect(timers.size).toBe(1);
    advance(900);
    expect(h.purring).toBe(true);
    advance(200);
    expect(h.purring).toBe(false);
  });
  it('stopPurr stops it at once, and is safe any number of times', () => {
    const { h, sent, advance, timers } = rig();
    h.purr(2.5);
    h.stopPurr();
    expect(h.purring).toBe(false);
    expect(timers.size).toBe(0);
    advance(3000);
    expect(sent).toEqual(['purr']);
    expect(() => { h.stopPurr(); h.stopPurr(); }).not.toThrow();
  });
  it('is capped, so a bad duration cannot purr on and on', () => {
    const { h, advance } = rig();
    h.purr(9999);
    advance(PURR_MAX_S * 1000 + PURR_BEAT_MS);
    expect(h.purring).toBe(false);
    for (const bad of [0, -1, NaN, undefined, 'long']) {
      h.purr(bad);
      expect(h.purring).toBe(false);
    }
  });
  it('a purr beat gives way to a tap that just played', () => {
    const { h, sent, flush, advance } = rig();
    h.purr(2);
    advance(PURR_BEAT_MS - 10);
    h.play('tap'); flush();
    advance(10); // the beat falls due 10 ms after the tap: skipped
    expect(sent).toEqual(['purr', 'tap']);
    advance(PURR_BEAT_MS);
    expect(sent).toEqual(['purr', 'tap', 'purr']);
  });
  it('purrs through vibrate too', () => {
    const { h, buzzes, advance } = rig({ bridge: false, vibrate: true });
    h.purr(1);
    advance(PURR_BEAT_MS);
    expect(buzzes).toEqual([VIBRATE_PATTERNS.purr, VIBRATE_PATTERNS.purr]);
    h.stopPurr();
  });
});

describe('the setting off means silence', () => {
  it('created off: nothing plays and no purr starts', () => {
    const { h, sent, flush, timers } = rig({ enabled: false });
    h.play('success');
    h.purr(2);
    flush();
    expect(sent).toEqual([]);
    expect(timers.size).toBe(0);
    expect(h.purring).toBe(false);
  });
  it('switched off mid-purr: the purr stops, and a waiting haptic is dropped', () => {
    const { h, sent, flush, advance, timers } = rig();
    h.purr(3);
    h.play('success');
    h.setEnabled(false);
    flush();
    expect(timers.size).toBe(0);
    advance(2000);
    expect(sent).toEqual(['purr']);
  });
  it('switched back on, it plays again', () => {
    const { h, sent, flush } = rig({ enabled: false });
    h.setEnabled(true);
    h.play('tap'); flush();
    expect(sent).toEqual(['tap']);
  });
});

describe('hapticForDiscovery — which awards buzz', () => {
  it('a treasure, a pick-up and a tip-over are a light tap', () => {
    for (const t of ['treasure', 'collectible', 'mischief']) expect(hapticForDiscovery(t)).toBe('tap');
  });
  it('a greeting and a nose boop are a soft double tap', () => {
    for (const t of ['friend', 'boop']) expect(hapticForDiscovery(t)).toBe('double');
  });
  it('a goal, all goals, a goal together and a legend (a golden mouse among them) are a success', () => {
    for (const t of ['goal', 'jackpot', 'duogoal', 'legend']) expect(hapticForDiscovery(t)).toBe('success');
  });
  it('everything else is still', () => {
    for (const t of ['critter', 'scenic', 'pet', 'perk', 'photo', 'intruder', 'patrol', undefined, 'constructor']) {
      expect(hapticForDiscovery(t)).toBeNull();
    }
  });
});

// main.js is the one place the game's moments meet the haptics: pinned here
// by its text, since main.js boots the whole game and cannot run headless.
describe('main.js wiring', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  it('listens on the bus for every moment, and calls nothing from game code', () => {
    expect(main).toContain('haptics.play(hapticForDiscovery(type));');
    expect(main).toContain("bus.on('pounce:land', () => haptics.play('tap'));");
    expect(main).toContain("bus.on('fight:hit', () => haptics.play('hit'));");
    expect(main).toContain("bus.on('purr', ({ seconds }) => haptics.purr(seconds));");
    expect(main).toContain("bus.on('purr:end', () => haptics.stopPurr());");
    const rankUp = main.indexOf('hud.toast(`RANK UP');
    expect(main.indexOf("haptics.play('success');", rankUp) - rankUp).toBeLessThan(80);
    for (const f of ['game/avatar.js', 'game/interactions.js', 'game/clanfight.js', 'game/walk.js']) {
      expect(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'), f).not.toMatch(/\bhaptics\.(play|purr|stopPurr|setEnabled)\(|haptics\.js'/);
    }
  });
  it('the purr stops on pause, at the end of the walk, and when the page is hidden', () => {
    expect(main).toContain('if (!locked) haptics.stopPurr();');
    expect(main).toContain('onWalkEnded: () => { clearResume(window.localStorage); haptics.stopPurr(); },');
    expect(main).toContain("document.addEventListener('visibilitychange', () => { if (document.hidden) haptics.stopPurr(); });");
  });
  it('follows the setting live, and picks its output from the bridge, the device profile and vibrate', () => {
    expect(main).toContain("haptics.setEnabled(settings.get('haptics'));");
    expect(main).toContain('bridge: window.webkit?.messageHandlers?.haptic ?? null,');
    expect(main).toContain('deviceHaptics: readDeviceProfile(window)?.haptics === true,');
    expect(main).toContain("vibrate: coarse && typeof navigator.vibrate === 'function'");
  });
});
