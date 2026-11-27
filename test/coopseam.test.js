import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';

// Couch play, milestone 0 (docs/superpowers/plans/2026-11-22-couch-coop.md):
// the seam is identity when off, a headless player adds no listeners and moves
// exactly like a normal one, and poll(dt, forcePad) leaves solo play alone.

const doc = stubCanvasDocument({ pointerLock: true });
const { coop, coopWanted } = await import('../src/coopseam.js');
const { createPlayer } = await import('../src/player.js');
const { buildCat } = await import('../src/cat/model.js');
const { bus } = await import('../src/events.js');
const { createGamepad } = await import('../src/gamepad.js');
const { start, standardPads } = await import('../src/coop/index.js');
const { COOP_READY, coopReady } = await import('../src/coop/table.js');
const { CATALOG } = await import('../src/progression.js');
const { AREA_LOADERS } = await import('../src/world/areas.js');

afterEach(() => { coop.poll = null; vi.restoreAllMocks(); });

describe('the seam is identity when couch play is off', () => {
  it('starts with nobody listening, and only ?coop=1 asks for it', () => {
    expect(coop.poll).toBeNull();
    expect(coopWanted('')).toBe(false);
    expect(coopWanted('?coop=0')).toBe(false);
    expect(coopWanted('?coop=10')).toBe(false);
    expect(coopWanted('?tv=1&coop=1')).toBe(true);
    expect(coopWanted('?coop=1')).toBe(true);
  });

  const SRC = new URL('../src/', import.meta.url);
  const files = (dir) => readdirSync(dir).flatMap((f) => {
    const u = new URL(f + (statSync(new URL(f, dir)).isDirectory() ? '/' : ''), dir);
    return f.endsWith('.js') ? [u] : statSync(u).isDirectory() ? files(u) : [];
  });

  it('nothing outside src/coop/ imports it statically; main.js reaches it only by import() behind the flag', () => {
    for (const u of files(SRC)) {
      if (u.pathname.includes('/src/coop/')) continue;
      const code = readFileSync(u, 'utf8');
      const statics = [...code.matchAll(/^\s*(?:import|export)\b[^;]*?from\s*['"]([^'"]*coop\/[^'"]*)['"]/gm)];
      expect(statics.map((m) => m[1]), u.pathname).toEqual([]);
    }
    const main = readFileSync(new URL('main.js', SRC), 'utf8');
    expect(main).toMatch(/if \(coopWanted\(location\.search\)\) import\('\.\/coop\/index\.js'\)/);
    expect(main.match(/coop\/index\.js/g)).toHaveLength(1);
    expect(main.match(/coop\.poll\?\.\(dt\)/g)).toHaveLength(1);
  });

  it('the frame loop calls the seam in order: poll, then the pad glue with the pad it chose, then (after player.update) frame', () => {
    const main = readFileSync(new URL('main.js', SRC), 'utf8');
    const a = main.indexOf('coop.poll?.(dt);');
    const b = main.indexOf('gamepad.poll(dt, coop.pad);');
    const c = main.indexOf('player.update(dt, session.areaData.colliders');
    const d = main.indexOf('coop.frame?.(dt);');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(d).toBeGreaterThan(c);
    expect(main.slice(c, d)).not.toMatch(/\n\s*session\./); // nothing but player.update's own lines between them
    expect(main.match(/coop\.frame\?\.\(dt\)/g)).toHaveLength(1);
    expect(main.match(/gamepad\.poll\(/g)).toHaveLength(1);
  });

  it('every slot starts empty: with no chunk the pad glue gets null and reads its own pad, as today', () => {
    expect(coop).toEqual({ poll: null, pad: null, frame: null, late: null });
  });

  it('the seam file imports nothing and stays tiny', () => {
    const code = readFileSync(new URL('coopseam.js', SRC), 'utf8');
    expect(code).not.toMatch(/^\s*import\b/m);
    expect(code.length).toBeLessThan(900);
  });

  it('src/coop/ never asks the network for anything', () => {
    for (const u of files(new URL('coop/', SRC))) {
      expect(readFileSync(u, 'utf8'), u.pathname).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|supabase|EventSource/);
    }
  });
});

describe('the per-place ready table', () => {
  it('has a row for every place the game can walk in, and only the Neighborhood and the open places (M3) are ready', () => {
    const ids = new Set([...Object.keys(CATALOG.areas), ...Object.keys(AREA_LOADERS)]);
    for (const id of ids) expect(Object.keys(COOP_READY), `${id} has no couch row`).toContain(id);
    expect(Object.entries(COOP_READY).filter(([, v]) => v).map(([k]) => k).sort()).toEqual(['den', 'docks', 'moor', 'neighborhood', 'pines', 'river', 'woods']); // M3 opened the open places
    expect(coopReady('neighborhood')).toBe(true);
    expect(coopReady('fair')).toBe(false);
    expect(coopReady('nowhere')).toBe(false);
  });
});

describe('the chunk, started', () => {
  const pad = (index, over = {}) => ({ index, connected: true, mapping: 'standard', id: 'x', axes: [0, 0, 0, 0], buttons: [], ...over });

  it('sees only connected standard pads, and survives a missing or throwing API', () => {
    expect(standardPads({ getGamepads: () => [pad(0), pad(1, { mapping: '' }), null, pad(3, { connected: false }), pad(2)] }).map((p) => p.index)).toEqual([0, 2]);
    expect(standardPads({})).toEqual([]);
    expect(standardPads({ getGamepads: () => { throw new Error('no'); } })).toEqual([]);
  });

  it('with no walk code handed in (the milestone-0 call), a second pad is counted and nothing goes anywhere', () => {
    let session = { areaId: 'neighborhood', net: null };
    const pads = [pad(0), pad(1)];
    const h = start({ nav: { getGamepads: () => pads }, getSession: () => session });
    expect(coop.poll).toBeTypeOf('function');
    coop.poll(0.016);
    expect(h.state).toMatchObject({ pads: 2, ready: true, joined: false });
    session = { areaId: 'neighborhood', net: {} }; // an online co-walk: couch play stays out
    coop.poll(0.016);
    expect(h.state.ready).toBe(false);
    session = { areaId: 'fair', net: null };
    coop.poll(0.016);
    expect(h.state.ready).toBe(false);
    session = null;
    coop.poll(0.016);
    expect(h.state.ready).toBe(false);
    h.stop();
    expect(coop.poll).toBeNull();
  });
});

describe('a headless player', () => {
  const DT = 1 / 60;
  const rig = (opts, canvas) => {
    const player = createPlayer(new THREE.PerspectiveCamera(), canvas, opts);
    const cat = buildCat('tabby');
    cat.position.set(0, 0, 0);
    player.setAvatar(cat, 3.5);
    player.enable();
    return { player, cat };
  };
  // A scripted walk: run, turn, a hop, stop.
  const WALK = (f) => (f < 120 ? { x: 0, z: -1, mag: 1 } : f < 200 ? { x: 1, z: -1, mag: 0.7 } : f < 260 ? { x: -1, z: 0, mag: 1 } : null);
  const replay = ({ player, cat }, frames = 320) => {
    const out = [];
    for (let f = 0; f < frames; f++) {
      player.setTouchMove(WALK(f));
      if (f === 40) player.pounce?.();
      player.update(DT, [], { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, []);
      out.push([cat.position.x, cat.position.y, cat.position.z, cat.rotation.y].map((v) => Math.round(v * 1e6) / 1e6).join(','));
    }
    return out;
  };

  it('adds no listener to the page or to a canvas, and needs no canvas', () => {
    const add = vi.fn();
    doc.addEventListener = add;
    const canvas = { addEventListener: vi.fn() };
    createPlayer(new THREE.PerspectiveCamera(), canvas, { headless: true });
    createPlayer(new THREE.PerspectiveCamera(), null, { headless: true });
    expect(add).not.toHaveBeenCalled();
    expect(canvas.addEventListener).not.toHaveBeenCalled();
    createPlayer(new THREE.PerspectiveCamera(), canvas); // today's player still listens
    expect(add).toHaveBeenCalled();
    expect(canvas.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('returns the same API as the normal player', () => {
    const a = Object.keys(createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} })).sort();
    const b = Object.keys(createPlayer(new THREE.PerspectiveCamera(), null, { headless: true })).sort();
    expect(b).toEqual(a);
  });

  it('two movers on the same path end in the same places, frame for frame, as one normal player', () => {
    const normal = replay(rig(undefined, { addEventListener() {} }));
    const one = replay(rig({ headless: true }, null));
    const two = replay(rig({ headless: true }, null));
    expect(one).toEqual(normal);
    expect(two).toEqual(one);
    expect(new Set(normal).size).toBeGreaterThan(100); // it did move
  });

  it('two movers run side by side do not disturb each other', () => {
    const a = rig({ headless: true }, null), b = rig({ headless: true }, null);
    const alone = replay(rig({ headless: true }, null));
    const both = [];
    for (let f = 0; f < 320; f++) {
      a.player.setTouchMove(WALK(f));
      b.player.setTouchMove(f % 2 ? { x: 1, z: 0, mag: 1 } : null);
      if (f === 40) a.player.pounce?.();
      for (const x of [a, b]) x.player.update(DT, [], { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, []);
      both.push([a.cat.position.x, a.cat.position.y, a.cat.position.z, a.cat.rotation.y].map((v) => Math.round(v * 1e6) / 1e6).join(','));
    }
    expect(both).toEqual(alone);
  });

  it('never speaks for the first cat on the bus, and disable() does not touch pointer lock', () => {
    const seen = vi.fn();
    const off = bus.on('player:lockchange', seen);
    const exit = vi.fn();
    doc.exitPointerLock = exit;
    const m = createPlayer(new THREE.PerspectiveCamera(), null, { headless: true });
    m.setTouchEngaged(true);
    m.disable();
    expect(seen).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    const p = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
    p.setTouchEngaged(true);
    expect(seen).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('gamepad.poll(dt, forcePad)', () => {
  const ID = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
  const mk = (over = {}) => ({ index: 0, connected: true, mapping: 'standard', id: ID, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), ...over });
  const rig = (current) => {
    const onMove = vi.fn(), onAction = vi.fn();
    const g = createGamepad({ win: { addEventListener() {}, removeEventListener() {} }, nav: { getGamepads: () => [current] }, doc: null, menuNav: { enter() {}, step() {}, alt() {}, press() {}, scroll() {}, settle() {} }, getEngaged: () => true, toast() {}, onMove, onAction });
    return { g, onMove, onAction };
  };

  it('with no argument it reads the active pad as before', () => {
    const r = rig(mk({ axes: [0, -1, 0, 0] }));
    r.g.poll(0.016);
    expect(r.onMove).toHaveBeenCalled();
  });

  it('with an argument it reads that pad, even when the browser lists none', () => {
    const r = rig(null);
    r.g.poll(0.016);
    expect(r.onMove).not.toHaveBeenCalled();
    r.g.poll(0.016, mk({ index: 1, axes: [0, -1, 0, 0] }));
    expect(r.onMove).toHaveBeenCalled();
  });

  it('with an argument it ignores the browser\'s active pad', () => {
    const r = rig(mk({ axes: [0, -1, 0, 0] }));
    r.g.poll(0.016, mk({ index: 1 }));
    expect(r.onMove).not.toHaveBeenCalled();
  });
});
