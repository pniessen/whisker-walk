// The Reef's seal ride: a free ride on one of the two swimming seals. The offer (last in the prompt order, "Hop off the seal" first while riding), boarding and
// hopping off, one cat per seal (a partner's claim too), the ride's own end (40 s, "Wheee!"), the journal line once, steering held to a few metres, nothing left
// held when the walk ends or something else takes her off the seat, reduced motion, the words in both sets and the source rules.
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

stubCanvasDocument();
const { build } = await import('../src/world/reef.js');
const P = await import('../src/world/reefplan.js');
const { SEAL_RIDE } = await import('../src/world/reefsealride.js');
const { LINES } = await import('../src/world/reefsealridewords.js');
const { phrase } = await import('../src/clanphrases.js');
const { createProgression } = await import('../src/progression.js');

const DT = 1 / 30;
const read = (f) => readFileSync(f, 'utf8');

describe('on a walk', () => {
  const made = [];
  afterEach(() => { for (const m of made.splice(0)) m.life.dispose(); });
  const fakePlayer = () => ({ perchY: 0, floatY: 0, inputActive: false, kickHeld: false, dir: { x: 0, z: 0 }, halt() {}, clearFloat() {}, inputDirection() { return { x: this.dir.x, z: this.dir.z }; } });
  const make = ({ reducedMotion = false } = {}) => {
    const sc = new THREE.Scene();
    const placed = build(sc);
    const awards = [];
    const sent = [];
    const log = { awardOnce(kind, key, text) { const first = !awards.some((a) => a.key === key); if (first) awards.push({ kind, key, text }); return first ? 12 : 0; }, count() { return 0; }, mark() {} };
    const progression = createProgression(memoryStorage());
    const camera = new THREE.PerspectiveCamera();
    const cat = new THREE.Group();
    cat.position.set(0, P.reefY(0, 36), 36);
    const player = fakePlayer();
    const said = [];
    const life = placed.life({ scene: sc, progression, player, log, reducedMotion, visits: 1, doc: null, sendEvent: (ev) => sent.push(ev) });
    const orig = { riding: null, marker: 1, update() {}, late() {}, jump() { return false; }, pawKind() { return null; } };
    const session = { cat, perched: null, perchHold: null, idleTime: 0, fair: orig };
    const seals = life.spottable.filter((s) => s.type === 'rfseal').slice(0, 2);
    const m = { life, scene: sc, player, cat, session, placed, camera, progression, orig, awards, sent, said, seals, t: 0 };
    m.tick = (n = 1) => {
      for (let i = 0; i < n; i++) {
        m.t += DT;
        life.update(DT, m.t, cat.position, camera, session);
        session.fair.update(DT, m.t, { cat, player, session });
        session.fair.late(DT, m.t, { cat, player, session });
      }
    };
    m.beside = (i) => { const s = seals[i].pos; cat.position.set(s.x + 2.8, s.y, s.z); };
    m.board = (i = 0) => { m.tick(2); m.beside(i); m.tick(0); expect(life.promptAt(cat.position)).toBe(phrase('reef.sealride.on')); life.interact(); m.tick(2); };
    m.hopOff = () => { expect(life.promptAt(cat.position)).toBe(phrase('reef.sealride.off')); life.interact(); m.tick(2); };
    made.push(m);
    return m;
  };

  it('beside a swimming seal she is offered "Ride the seal"; far from both she is offered nothing from it', () => {
    const m = make();
    m.tick(2);
    expect(m.life.promptAt(m.cat.position)).not.toBe('Ride the seal');
    m.beside(0);
    expect(m.life.promptAt(m.cat.position)).toBe('Ride the seal');
  });

  it('board: the walk\'s seat record (sits, swims), perchY, the co-walk seat id, the first line and one journal line; hop off puts it all back', () => {
    const m = make();
    m.board(0);
    expect(m.life.sealRide.riding).toBe(true);
    expect(m.session.perched.swim).toBe(true);
    expect(m.session.perched.pose).toBe('requestPet');
    expect(m.session.perchHold).toBe(m.session.perched);
    expect(m.player.perchY).toBeGreaterThan(0.3);
    expect(m.session.fair.riding).toEqual({ id: 'reef-seal', rideId: 'reef' });
    expect(m.session.fair.marker).toBe(1);
    expect(m.awards).toEqual([{ kind: 'reeffind', key: 'reef-seal-ride', text: phrase('reef.sealride.find') }]);
    expect(m.sent).toContainEqual({ kind: 'seal-in', seal: 0 });
    // she moves with the seal
    const p0 = { x: m.cat.position.x, z: m.cat.position.z };
    m.tick(30);
    expect(Math.hypot(m.cat.position.x - p0.x, m.cat.position.z - p0.z)).toBeGreaterThan(0.3);
    expect(m.cat.position.x).toBeCloseTo(m.seals[0].pos.x, 3);
    m.hopOff();
    expect(m.life.sealRide.riding).toBe(false);
    expect(m.session.perched).toBeNull();
    expect(m.session.perchHold).toBeNull();
    expect(m.player.perchY).toBe(0);
    expect(m.session.fair.riding).toBeNull();
    expect(m.sent).toContainEqual({ kind: 'seal-out', seal: 0 });
    m.board(0);
    m.hopOff();
    expect(m.awards).toHaveLength(1); // the journal line once
  });

  it('one cat per seal: a seal with a rider (a partner\'s claim too) is not offered; the other seal still is; the claim ends with the partner\'s hop off', () => {
    const m = make();
    expect(m.life.credit({ kind: 'seal-in', seal: 0 })).toBe('in');
    m.tick(2);
    m.beside(0);
    // a seal within reach that is taken is not the offer; with the other seal far, nothing is offered
    expect(m.life.promptAt(m.cat.position)).not.toBe('Ride the seal');
    m.beside(1);
    expect(m.life.promptAt(m.cat.position)).toBe('Ride the seal');
    m.life.interact(); m.tick(2);
    expect(m.life.sealRide.state.seal).toBe(1);
    expect(m.life.credit({ kind: 'seal-in', seal: 1 })).toBeNull(); // hers already
    expect(m.life.credit({ kind: 'seal-out', seal: 1 })).toBeNull(); // a partner cannot give back her seal
    expect(m.life.credit({ kind: 'seal-in', seal: 9 })).toBeNull();
    expect(m.life.credit({ kind: 'seal-out', seal: 0 })).toBe('out');
    m.hopOff();
    m.board(0); // the first one is free again
    expect(m.life.sealRide.state.seal).toBe(0);
  });

  it('a partner\'s claim that goes quiet lapses', () => {
    const m = make();
    m.life.credit({ kind: 'seal-in', seal: 0 });
    m.tick(Math.ceil((SEAL_RIDE.friendLapse + 2) / DT));
    m.beside(0);
    expect(m.life.promptAt(m.cat.position)).toBe('Ride the seal');
  });

  it('the ride ends by itself after about 40 s with a soft "Wheee!", the cat is set down and the seal is free', () => {
    const m = make();
    m.board(0);
    m.tick(Math.ceil((SEAL_RIDE.seconds - 2) / DT));
    expect(m.life.sealRide.riding).toBe(true);
    m.tick(Math.ceil(4 / DT));
    expect(m.life.sealRide.riding).toBe(false);
    expect(m.session.perched).toBeNull();
    expect(m.player.perchY).toBe(0);
    expect(m.sent).toContainEqual({ kind: 'seal-out', seal: 0 });
    m.beside(0);
    expect(m.life.promptAt(m.cat.position)).toBe('Ride the seal');
  });

  it('steering moves the circle a few metres at most, and the cat stays over open water inside the bounds', () => {
    const m = make();
    m.board(0);
    m.player.inputActive = true; m.player.dir = { x: 1, z: 0 };
    let far = 0;
    for (let i = 0; i < 38 / DT; i++) {
      m.tick(1);
      const c = m.cat.position;
      expect(c.x).toBeGreaterThan(P.REEF_BOUNDS.minX); expect(c.x).toBeLessThan(P.REEF_BOUNDS.maxX);
      expect(c.z).toBeGreaterThan(P.REEF_BOUNDS.minZ); expect(c.z).toBeLessThan(P.REEF_BOUNDS.maxZ);
      expect(c.y).toBeGreaterThan(P.reefY(c.x, c.z));
      far = Math.max(far, Math.abs(c.x - 0));
    }
    expect(far).toBeLessThan(40);
    expect(m.life.sealRide.riding).toBe(true);
  });

  it('a walk that ends while she rides clears everything (perch, seat, fair, the seal)', () => {
    const m = make();
    m.board(0);
    m.life.dispose();
    expect(m.session.perched).toBeNull();
    expect(m.session.perchHold).toBeNull();
    expect(m.player.perchY).toBe(0);
    expect(m.session.fair).toBe(m.orig);
    expect(m.sent).toContainEqual({ kind: 'seal-out', seal: 0 });
  });

  it('something else taking her off the seat ends the ride on the next frame, with nothing held', () => {
    const m = make();
    m.board(0);
    m.session.perched = null;
    m.tick(2);
    expect(m.life.sealRide.riding).toBe(false);
    expect(m.session.fair.riding).toBeNull();
    m.beside(0);
    expect(m.life.promptAt(m.cat.position)).toBe('Ride the seal');
  });

  it('she cannot board while perched on something else (a mount)', () => {
    const m = make();
    m.tick(2);
    m.session.perched = { y: 1 };
    m.beside(0);
    expect(m.life.promptAt(m.cat.position)).not.toBe('Ride the seal');
  });

  it('reduced motion: the ridden seal still moves (the ride works), and hop off is the same', () => {
    const m = make({ reducedMotion: true });
    m.tick(2);
    m.board(0);
    const a = { x: m.cat.position.x, z: m.cat.position.z };
    m.tick(30);
    expect(Math.hypot(m.cat.position.x - a.x, m.cat.position.z - a.z)).toBeGreaterThan(0.3);
    expect(m.life.sealRide.riding).toBe(true);
    m.hopOff();
  });
});

describe('words and sources', () => {
  it('the same plain lines in both word sets, no series word in either', () => {
    expect(Object.keys(LINES)).toEqual(['reef.sealride.on', 'reef.sealride.off', 'reef.sealride.tip', 'reef.sealride.end', 'reef.sealride.find']);
    for (const [id, line] of Object.entries(LINES)) {
      expect(phrase(id)).toBe(line);
      expect(bannedIn(line), id).toBeNull();
      withOffWords(() => { expect(phrase(id)).toBe(line); });
    }
  });
  it('draws no random number and reads no clock; the seal poses stay pure', () => {
    const src = read('src/world/reefsealride.js').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
});
