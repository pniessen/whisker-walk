// =============================================================================
// THE ECHO DEEP: THE WALL AND THE PRISMS ON A WALK (second story, milestone C3). createDeepSteps(ctx) runs steps 1 and 2 of the story on the hall shell of C2, with the pure rules
// (crystaldeepmission.js, crystaldeepwall.js, crystaldeepprism.js). It adds no mesh and no light: the singing wall, the three prisms and the glows are the LAST vertex ranges of the hall
// stone and glow meshes (crystaldeepparts.js), rewritten in place when something moves.
//   * STEP 1, THE WALL. Once the first story is told, all three tunes are learned and two rubbings are in the album (isOpen), standing near the singing wall offers "Hum back to the wall".
//     The wall plays a five-note phrase (the pads flash in order); stepping the same pads opens it. A wrong step or a wait only lets the flashes fade and the phrase plays again: no fail sound,
//     no count; after a few replays the wall opens by itself. Walking away lets the tune go; nothing is saved. Open: bit 0 of state.crystal.deep, one wd-wall event, the journal page ccwall.
//   * STEP 2, THE PRISMS. With the wall open, the action button beside a stand turns its prism to the next face (rose circle, blue diamond, gold star). Any order, any number of turns;
//     a prism that fits keeps a ring of light; when all three fit the door-crystal lights (bit 1, one wd-prism event, the page ccprism). The stands are never saved while she plays: they start
//     from the same faces every walk until the prisms are set.
//   * A partner step (credit) is taken on this save too. Steps 3 and 4 (Tink) are not here.
// REDUCED MOTION: the wall opens at once, a prism turns at once, the lights jump to their level. No random number, no clock (the walk own dt only), no light.
// =============================================================================
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import { crystalDeepOn } from '../crystalflag.js';
import { WING_LIVE } from '../crystalpages.js';
import { crystalY } from './crystalplan.js';
import * as D from './crystaldeepplan.js';
import * as M from './crystaldeepmission.js';
import * as PR from './crystaldeepprism.js';
import * as W from './crystaldeepwall.js';
import './crystaldeepwallwords.js';

const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const THIRD = (Math.PI * 2) / 3;
if (crystalDeepOn()) { WING_LIVE.wall = true; WING_LIVE.prism = true; } // the journal pages of the wall and the prisms show once the story is in the game (lazy file: no start-up growth)
export const FLASH_HOLD = 0.9; // seconds a pad flash lasts
export const OPEN_SECS = 2.5; // the wall slides open over this long
export const LEAVE_R = 8; // a tune in the middle of being played is let go beyond this far from the chamber middle

/** One soft note on the walk audio context: a sine and a quiet octave, a short pluck. Asks for nothing when muted. */
export function tone(audio, freq, vol = 0.03) {
  if (!audio || typeof audio.getContext !== 'function' || audio.isMuted?.() || !(freq > 0)) return false;
  const ac = audio.getContext();
  if (!ac) return false;
  const now = ac.currentTime;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
  g.connect(audio.getMaster?.() ?? ac.destination);
  for (const [k, mul] of [[1, 1], [2, 0.22]]) {
    const o = ac.createOscillator();
    const og = ac.createGain();
    o.type = 'sine';
    o.frequency.value = freq * k;
    og.gain.value = mul;
    o.connect(og); og.connect(g);
    o.start(now);
    o.stop(now + 1.5);
  }
  return true;
}

// createDeepSteps(ctx) -> { promptAt, interact, credit, update, state }
// ctx: { dyn, stone, glow (the two meshes), progression, audio, reducedMotion, sendEvent, colliders }
export function createDeepSteps(ctx) {
  const { dyn, stone, glow, audio = null, reducedMotion = false, progression = null } = ctx;
  const colliders = Array.isArray(ctx.colliders) ? ctx.colliders : null;
  const send = typeof ctx.sendEvent === 'function' ? ctx.sendEvent : () => {};
  const rec = () => progression?.state?.crystal;
  const bits = () => M.deepBits(rec());
  const plug = D.WALL_PLUG.map((c) => ({ ...c }));
  let faces = (bits() & M.PRISMS) ? [...PR.TARGET] : [...PR.START];
  const goal = faces.map((f) => -f * THIRD); // where each prism wants to point (it turns on, never back)
  const ang = goal.slice();
  const flash = new Array(D.PAD_COUNT).fill(0);
  const held = new Array(D.PAD_COUNT).fill(false);
  const ring = [0, 0, 0];
  const ringShown = [-1, -1, -1];
  const flashShown = new Array(D.PAD_COUNT).fill(-1);
  let doorLevel = 0;
  let doorShown = -1;
  let wallK = (bits() & M.WALL) ? 1 : 0;
  let wallShown = -1;
  let wall = null; // the running welcome phrase, or null
  let lastPad = -1;
  let cat = null;
  let target = null;
  let clock = 0;
  let solid = false;

  const setSolid = (on) => {
    if (!colliders || on === solid) return;
    for (const c of plug) { const i = colliders.indexOf(c); if (on && i < 0) colliders.push(c); else if (!on && i >= 0) colliders.splice(i, 1); }
    solid = on;
  };
  const commit = (crystal) => {
    const pr = progression;
    if (!pr?.state) return;
    pr.state.crystal = { ...(pr.state.crystal ?? {}), deep: crystal.deep };
    pr.addPoints?.(0); // the save own "persist now": it adds nothing
  };
  const sight = (id) => { try { progression?.recordSighting?.(id); } catch { /* a stand-in save */ } };
  const perform = (step, remote) => {
    const r = remote ? M.credit(rec(), step) : M.apply(rec(), step);
    if (!r.changed) return null;
    commit(r.crystal);
    sight(step.kind === 'wall' ? 'ccwall' : 'ccprism');
    return r.effect;
  };
  let etarget = null; // the day faces of Tink errand of the day (C6), or null: then the stands hold the door pattern
  const matched = () => PR.matches(faces, etarget ?? PR.TARGET);
  // the prisms turn on to the given pattern (each by the turns it still needs)
  const settle = (to = PR.TARGET) => { const old = faces; faces = [...to]; for (let k = 0; k < 3; k++) goal[k] -= ((((faces[k] - old[k]) % 3) + 3) % 3) * THIRD; };

  function openWall() {
    wall = null; held.fill(false);
    if (!perform({ kind: 'wall' }, false)) return;
    send(M.wire({ kind: 'wall' }));
    for (let i = 0; i < D.PAD_COUNT; i++) flash[i] = 1.4;
    tone(audio, D.PAD_FREQS[2], 0.03); tone(audio, D.PAD_FREQS[5], 0.025);
    say('crystal-deep-wall', phrase('crystal.deep.wall.open'));
  }
  function handle(events) {
    for (const e of events) {
      if (e.k === 'phrase') { flash[e.pad] = FLASH_HOLD; tone(audio, D.PAD_FREQS[e.pad], 0.026); }
      else if (e.k === 'ok') { held[e.pad] = true; flash[e.pad] = FLASH_HOLD; }
      else if (e.k === 'miss' || e.k === 'timeout' || e.k === 'replay') held.fill(false);
      else if (e.k === 'open') openWall();
    }
  }
  function turnStand(i) {
    const before = matched()[i];
    faces = PR.turn(faces, i);
    goal[i] -= THIRD;
    tone(audio, D.PAD_FREQS[(faces[i] * 2 + i) % D.PAD_COUNT], 0.028);
    if (matched()[i] && !before) say('crystal-deep-fits', phrase('crystal.deep.prism.fits'));
    if (PR.solved(faces) && perform({ kind: 'prism' }, false)) {
      send(M.wire({ kind: 'prism' }));
      tone(audio, D.PAD_FREQS[4], 0.03); tone(audio, D.PAD_FREQS[6], 0.024);
      say('crystal-deep-door', phrase('crystal.deep.prism.done'));
    }
  }

  // ---- drawing: rewrite the vertex ranges that moved ------------------------------------------------------------------------------------
  const writeWall = () => {
    const w = dyn.wall;
    const p = stone.geometry.attributes.position;
    const dy = -wallK * (D.WALL.h + 0.3);
    for (let i = 0; i < w.count; i++) p.setXYZ(w.start + i, w.base[i * 3], w.base[i * 3 + 1] + dy, w.base[i * 3 + 2]);
    p.needsUpdate = true;
  };
  const writePrism = (k) => {
    const pc = dyn.prisms[k];
    const p = stone.geometry.attributes.position;
    const n = stone.geometry.attributes.normal;
    const c = Math.cos(ang[k]);
    const s = Math.sin(ang[k]);
    for (let i = 0; i < pc.count; i++) {
      const x = pc.pos[i * 3]; const z = pc.pos[i * 3 + 2];
      p.setXYZ(pc.start + i, pc.x + x * c + z * s, pc.y + pc.pos[i * 3 + 1], pc.z - x * s + z * c);
      const nx = pc.nor[i * 3]; const nz = pc.nor[i * 3 + 2];
      n.setXYZ(pc.start + i, nx * c + nz * s, pc.nor[i * 3 + 1], -nx * s + nz * c);
    }
    p.needsUpdate = true; n.needsUpdate = true;
  };
  const writeGlow = (piece, level) => {
    const col = glow.geometry.attributes.color;
    for (let i = 0; i < piece.count; i++) col.setXYZ(piece.start + i, piece.base[i * 3] * level, piece.base[i * 3 + 1] * level, piece.base[i * 3 + 2] * level);
    col.needsUpdate = true;
  };
  const q = (v) => Math.round(v * 100) / 100;
  function paintAll() {
    if (wallShown !== q(wallK)) { wallShown = q(wallK); writeWall(); }
    for (let i = 0; i < D.PAD_COUNT; i++) {
      const v = q(Math.max(flash[i] > 0 ? Math.min(1, flash[i] / FLASH_HOLD) : 0, held[i] ? 0.7 : 0));
      if (flashShown[i] !== v) { flashShown[i] = v; writeGlow(dyn.pads[i], v); }
    }
    for (let i = 0; i < 3; i++) { const v = q(ring[i]); if (ringShown[i] !== v) { ringShown[i] = v; writeGlow(dyn.rings[i], v); } }
    if (doorShown !== q(doorLevel)) { doorShown = q(doorLevel); writeGlow(dyn.door, doorShown); }
  }
  for (let k = 0; k < 3; k++) writePrism(k);
  setSolid(wallK < 1);
  for (let i = 0; i < 3; i++) ring[i] = matched()[i] ? 1 : 0;
  doorLevel = PR.solved(faces) && (bits() & M.PRISMS) ? 1 : 0;
  paintAll();

  const near = (p, x, z, r) => !!p && Math.hypot(p.x - x, p.z - z) <= r;
  function decide(p) {
    if (!p || !M.unlocked(rec())) return null;
    const b = bits();
    if (!(b & M.WALL)) {
      if (!wall && near(p, D.WALL.x, D.WALL.z, D.WALL.reach) && M.isOpen(rec())) return { kind: 'hum', line: phrase('crystal.deep.wall.prompt') };
      return null;
    }
    if (!(b & M.PRISMS) && wallK >= 1) {
      const i = D.standAt(p.x, p.z);
      if (i >= 0) return { kind: 'turn', stand: i, line: phrase('crystal.deep.prism.turn') };
    }
    return null;
  }

  return {
    get state() { return { wall: wallK, faces: [...faces], doorLevel, running: !!wall, record: rec() }; },
    get faces() { return [...faces]; },
    // the errand of the day (C6): the stands take the day faces for a while. begin(target) turns them on to the start faces; turn(i) turns one stand and answers true once they fit; end() lets them go back to the door pattern
    errand: {
      begin(target) { etarget = PR.clean(target); settle(PR.START.map((v, i) => (v === etarget[i] ? (v + 1) % 3 : v))); },
      turn(i) {
        if (!etarget || PR.solved(faces, etarget)) return false;
        const before = matched()[i];
        faces = PR.turn(faces, i, etarget);
        goal[i] -= THIRD;
        tone(audio, D.PAD_FREQS[(faces[i] * 2 + i) % D.PAD_COUNT], 0.028);
        if (matched()[i] && !before) say('crystal-deep-fits', phrase('crystal.deep.prism.fits'));
        return PR.solved(faces, etarget);
      },
      end() { if (etarget) { etarget = null; settle(); } },
      get on() { return !!etarget; },
    },
    promptAt(p) { if (p) cat = p; target = decide(p); return target ? target.line : null; },
    interact() {
      if (!target) return null;
      const t = target;
      target = null;
      if (t.kind === 'hum') {
        wall = W.newWall(); held.fill(false); lastPad = -1;
        say('crystal-deep-listen', phrase('crystal.deep.wall.listen'));
        return 'hum';
      }
      turnStand(t.stand);
      return 'turn';
    },
    // a partner step (wd-wall, wd-prism) is taken here too; the steps of Tink are not this file
    credit(ev) {
      const step = M.toStep(ev);
      if (!step || (step.kind !== 'wall' && step.kind !== 'prism')) return null;
      const effect = perform(step, true);
      if (!effect) return null;
      wall = null;
      if (step.kind === 'prism') { settle(); say('crystal-deep-door', phrase('crystal.deep.prism.partner')); }
      else say('crystal-deep-wall', phrase('crystal.deep.wall.partner'));
      return effect;
    },
    update(dt, t, catPos) {
      const d = dt > 0 ? Math.min(dt, 1) : 0;
      clock += d;
      if (catPos) cat = catPos;
      // what the save says now (a partner step, or this walk own): the wall and the prisms follow it
      const b = bits();
      if ((b & M.PRISMS) && !etarget && !PR.solved(faces)) settle();
      // the welcome phrase, and her steps on the pads
      if (wall && cat) {
        const onFloor = !Number.isFinite(cat.y) || cat.y - crystalY(cat.x, cat.z) < 0.4;
        const pad = onFloor ? D.padAt(cat.x, cat.z) : -1;
        if (pad !== lastPad) { lastPad = pad; if (pad >= 0) handle(W.step(wall, pad)); }
        if (wall && Math.hypot(cat.x - D.CH.x, cat.z - D.CH.z) > LEAVE_R) { wall = null; held.fill(false); } // walked away: let it go, nothing saved
      }
      if (wall) handle(W.tick(wall, d));
      for (let i = 0; i < D.PAD_COUNT; i++) if (flash[i] > 0) flash[i] = Math.max(0, flash[i] - d);
      // the wall slides (reduced motion: at once)
      const wantWall = (b & M.WALL) ? 1 : 0;
      wallK = reducedMotion ? wantWall : wallK + Math.max(-d / OPEN_SECS, Math.min(d / OPEN_SECS, wantWall - wallK));
      setSolid(wallK < 0.5);
      // the prisms turn (reduced motion: at once)
      for (let k = 0; k < 3; k++) {
        const diff = goal[k] - ang[k];
        if (diff === 0) continue;
        ang[k] = reducedMotion || Math.abs(diff) < 0.01 ? goal[k] : ang[k] + Math.sign(diff) * Math.min(Math.abs(diff), 7 * d);
        writePrism(k);
      }
      const m = matched();
      for (let i = 0; i < 3; i++) { const want = m[i] ? 1 : 0; ring[i] = reducedMotion ? want : ring[i] + Math.max(-d * 3, Math.min(d * 3, want - ring[i])); }
      const wantDoor = (b & M.PRISMS) ? 1 : 0;
      doorLevel = reducedMotion ? wantDoor : doorLevel + Math.max(-d * 0.8, Math.min(d * 0.8, wantDoor - doorLevel));
      paintAll();
    },
    dispose() { setSolid(false); wall = null; },
  };
}
