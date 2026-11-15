// The stand-still sniff (src/game/autosniff.js): guided-first-walk design,
// section 5. A touch player has no E key; standing still is their sniff.
import { describe, it, expect, afterEach } from 'vitest';
import { tickAutoSniff, sniffRange, AUTO_SNIFF_STILL_S, AUTO_SNIFF_EVERY_S } from '../src/game/autosniff.js';
import { bus } from '../src/events.js';

function walk({ treat = { x: 5, z: 0 }, breed = 'tabby' } = {}) {
  const calls = [];
  return {
    calls,
    cat: { position: { x: 0, y: 0, z: 0 }, userData: { breed } },
    idleTime: 0, prompt: null, perched: null, cameraMode: false, fight: null, rest: null, chasing: false, freezeTime: 0,
    sniffTime: 0,
    scent: {
      standSniff(pos, range) {
        calls.push(range);
        return treat && Math.hypot(treat.x - pos.x, treat.z - pos.z) < range ? treat : null;
      },
    },
  };
}
const offs = [];
afterEach(() => { while (offs.length) offs.pop()(); });
const tips = () => { const got = []; offs.push(bus.on('tip', (e) => got.push(e.id))); return got; };

describe('tickAutoSniff', () => {
  it('sniffs after two seconds standing still near a treasure: nose down, trail asked for, the hint offered', () => {
    const s = walk();
    const got = tips();
    s.idleTime = AUTO_SNIFF_STILL_S - 0.1;
    expect(tickAutoSniff(s, 0.1)).toBe(null);
    expect(s.calls).toHaveLength(0);
    s.idleTime = AUTO_SNIFF_STILL_S;
    expect(tickAutoSniff(s, 0.1)).toEqual({ x: 5, z: 0 });
    expect(s.sniffTime).toBe(1);
    expect(got).toEqual(['sniff']);
  });

  it('at most once every twenty seconds', () => {
    const s = walk();
    s.idleTime = 5;
    expect(tickAutoSniff(s, 0.1)).not.toBe(null);
    for (let t = 0; t < AUTO_SNIFF_EVERY_S - 1; t += 0.5) expect(tickAutoSniff(s, 0.5)).toBe(null);
    expect(s.calls).toHaveLength(1);
    expect(tickAutoSniff(s, 1.5)).not.toBe(null);
    expect(s.calls).toHaveLength(2);
  });

  it('nothing in range: no sniff, no nose down, and it may try again at once', () => {
    const s = walk({ treat: { x: 500, z: 0 } });
    const got = tips();
    s.idleTime = 5;
    expect(tickAutoSniff(s, 0.1)).toBe(null);
    expect(s.sniffTime).toBe(0);
    expect(got).toEqual([]);
    s.cat.position.x = 495;
    expect(tickAutoSniff(s, 0.1)).not.toBe(null);
  });

  it('not while the cat is busy', () => {
    for (const busy of [{ prompt: { kind: 'dig' } }, { perched: {} }, { cameraMode: true }, { fight: {} }, { rest: { kind: 'nap' } }, { chasing: true }, { freezeTime: 1 }]) {
      const s = Object.assign(walk(), busy);
      s.idleTime = 5;
      expect(tickAutoSniff(s, 0.1), JSON.stringify(busy)).toBe(null);
      expect(s.calls).toHaveLength(0);
    }
  });

  it('a cat beside her (its button up) does not stop the sniff', () => {
    for (const kind of ['stray', 'stray-feed', 'collect', 'tip']) {
      const s = Object.assign(walk(), { prompt: { kind } });
      s.idleTime = 5;
      expect(tickAutoSniff(s, 0.1), kind).not.toBe(null);
    }
  });

  it('reaches as far as an E sniff: 18 m, 30 for a keen nose', () => {
    expect(sniffRange('siamese')).toBe(18);
    expect(sniffRange('nope')).toBe(18);
    const s = walk();
    s.idleTime = 5;
    tickAutoSniff(s, 0.1);
    expect(s.calls[0]).toBe(sniffRange('tabby'));
    expect([18, 30]).toContain(s.calls[0]);
  });

  it('a walk without the sniff (a stand-in, the den) is left alone', () => {
    const s = walk();
    s.scent = {};
    s.idleTime = 5;
    expect(tickAutoSniff(s, 0.1)).toBe(null);
  });
});
