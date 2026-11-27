// =============================================================================
// TINK ERRAND OF THE DAY ON A WALK (second story, milestone C6). createDeepErrand(ctx) carries out the day errand of crystaldeeperrand.js (pure) in the Echo Deep and its surroundings.
//   * It is offered from the WALK AFTER the story (a walk that begins with deep bit 3: Tink is home). planDeepErrand(roomSeed, visits) picks the kind and the spot, so every cat in a room
//     has the same one. The errand itself is never saved, only what it pays: AWARDS.deepjob once a walk (log.awardOnce under ERRAND_KEY) and the lowest unset bit of state.crystal.chimes
//     (the album of twelve), with the journal page ccchimes. A partner finishing it (wd-errand) pays this cat too, once.
//   * Four kinds, none can fail: tune (hear three bars on the chime bars of the hall, step on them in the same order; a wrong bar only plays the tune again), prisms (the three stands turn
//     to the day faces shown by three little gems), moss (carry a soft pad from one of six places to the nest), hide (a ring of glints marks where Tink hides; peek inside).
//   * ONE merged mesh at most, made only for the kind of today and only after the story (no new draw on any other walk): the bars, the gems, the pad or the glints. A carried pad is
//     not kept: it is back at its place on the next walk. No light, no random number, no clock (the walk own dt only).
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import { crystalY } from './crystalplan.js';
import * as D from './crystaldeepplan.js';
import * as M from './crystaldeepmission.js';
import * as E from './crystaldeeperrand.js';
import { tone } from './crystaldeepwalllive.js';
import './crystaldeeperrandwords.js';

const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;

// the five chime bars: an arc on the east side of the hall (clear of the stands, the door and the nest; a test holds it)
export const BAR_DEG = Object.freeze([-52, -30, -8, 14, 36]); // moved out and round (pictures): the old 24 deg bar sat 1 m from the east stand
export const BAR_R = 3.9;
export const BAR_AT = Object.freeze(BAR_DEG.map((deg, i) => Object.freeze({ i, x: r2(D.HALL.x + Math.cos((deg * Math.PI) / 180) * BAR_R), z: r2(D.HALL.z + Math.sin((deg * Math.PI) / 180) * BAR_R) })));
export const BAR_COLOURS = Object.freeze([0xff8fb8, 0xffb060, 0xffe27a, 0x8fe0a8, 0x7fc8ff]);
export const BAR_TRIGGER = 0.62;
export const BAR_REACH = 3.2; // the tune is offered within this of the middle bar
export const NOTE_GAP = 0.75; // seconds between the notes of the tune played to her
export const REPLAY_AFTER = 1.2; // a wrong bar: the tune plays again after this
export const LEAVE_R = 9;
export const PROP_NEAR = 45;
export const barAt = (x, z) => { let best = -1; let bd = BAR_TRIGGER; for (const b of BAR_AT) { const d = Math.hypot(x - b.x, z - b.z); if (d <= bd) { bd = d; best = b.i; } } return best; };

// ---- the drawing: one merged mesh, vertex colours, no uv and no normal -------------------------------------------------------------------------------------------
const paint = (geo, hex) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  return g;
};
const gemGeometry = (face, x, y, z) => {
  const hex = D.FACE_COLOURS[face];
  if (face === 0) return paint(new THREE.SphereGeometry(0.17, 6, 4).translate(x, y, z), hex);
  if (face === 1) return paint(new THREE.OctahedronGeometry(0.22, 0).translate(x, y, z), hex);
  return mergeGeometries([paint(new THREE.ConeGeometry(0.2, 0.26, 5).translate(x, y + 0.13, z), hex), paint(new THREE.ConeGeometry(0.2, 0.26, 5).rotateX(Math.PI).translate(x, y - 0.13, z), hex)]);
};
/** The pieces of one kind: { geo, bars: [{start, count, base}] } (bars only for the tune). Pure of the scene, so a test can look at it. */
export function errandGeometry(kind, plan) {
  const parts = [];
  const bars = [];
  let at = 0;
  const add = (g) => { parts.push(g); const c = g.attributes.position.count; const r = { start: at, count: c }; at += c; return r; };
  if (kind === 'tune') {
    for (const b of BAR_AT) {
      const g = paint(new THREE.BoxGeometry(0.9, 0.14, 0.4).rotateY(-Math.atan2(b.z - D.HALL.z, b.x - D.HALL.x) - Math.PI / 2).translate(b.x, crystalY(b.x, b.z) + 0.09, b.z), BAR_COLOURS[b.i]);
      const r = add(g);
      bars.push({ ...r, base: g.attributes.color.array.slice() });
    }
  } else if (kind === 'prisms') {
    D.STANDS.forEach((s, i) => add(gemGeometry(plan.faces[i], s.x, crystalY(s.x, s.z) + 2.0, s.z)));
  } else if (kind === 'moss') {
    add(paint(new THREE.CylinderGeometry(0.5, 0.56, 0.12, 9).translate(0, 0.06, 0), 0x6fb87a));
    add(paint(new THREE.SphereGeometry(0.3, 7, 4).scale(1, 0.4, 1).translate(0.1, 0.14, -0.05), 0x9fe0a0));
  } else {
    const s = E.SPOTS[plan.spot];
    const y = crystalY(s.x, s.z);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; add(paint(new THREE.OctahedronGeometry(0.1, 0).translate(s.x + Math.cos(a) * 0.95, y + 0.35 + 0.15 * (k % 2), s.z + Math.sin(a) * 0.95), k % 2 ? 0xffe27a : 0xb9a6e8)); }
    add(paint(new THREE.SphereGeometry(0.2, 7, 5).translate(s.x, y + 0.2, s.z), 0xb9a6e8));
    for (const sx of [-1, 1]) add(paint(new THREE.ConeGeometry(0.06, 0.16, 4).translate(s.x + sx * 0.09, y + 0.45, s.z), 0xc4b4f0));
  }
  return { geo: mergeGeometries(parts), bars };
}

// createDeepErrand(ctx) -> { promptAt, interact, credit, goalFor, update, state, plan, dispose }
// ctx: { scene, progression, audio, log, reducedMotion, roomSeed, visits, send | sendEvent, steps (the wall and prisms: crystaldeepwalllive.js createDeepSteps result) }
export function createDeepErrand(ctx) {
  const { scene, progression = null, log = null, audio = null, steps = null } = ctx;
  const send = ctx.send ?? ctx.sendEvent;
  const rec = () => progression?.state?.crystal;
  const eligible = M.told(rec()); // Tink was already home when this walk began
  const plan = E.planDeepErrand(ctx.roomSeed, ctx.visits ?? 0);
  const kind = plan.kind;
  let done = !!log?.count && log.count(E.ERRAND_KEY) > 0; // a resumed walk that already paid it
  let clock = 0;
  let disposed = false;
  let told = false;
  let target = null;
  let item = 'home'; // the moss pad: home, carried or given (never saved)
  let found = false;
  let cat = null;
  let mesh = null;
  let pieces = null;
  const spot = E.SPOTS[plan.spot];
  const nest = D.NEST;
  const active = () => eligible && !done && !disposed;
  // the tune: phase idle, playing or echo
  const tune = { phase: 'idle', t: 0, note: 0, got: 0, again: -1, last: -1 };
  const flash = new Array(E.BARS).fill(0);
  const flashShown = new Array(E.BARS).fill(-1);

  if (active()) {
    const g = errandGeometry(kind, plan);
    pieces = g.bars;
    mesh = new THREE.Mesh(g.geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.name = 'crystal:deep:errand';
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
    Object.assign(mesh.userData, { noMerge: true, noCast: true, noContactShadow: true });
    if (kind === 'moss') mesh.position.set(spot.x, crystalY(spot.x, spot.z), spot.z);
    mesh.visible = false;
    scene.add(mesh);
    if (kind === 'prisms') steps?.errand?.begin(plan.faces);
  }

  const sight = (id) => { try { progression?.recordSighting?.(id); } catch { /* a stand-in save */ } };
  // done: the paws once a walk, the lowest unset chime bit, the page
  function complete(remote = false) {
    if (!active()) return false;
    done = true;
    const paid = log ? log.awardOnce('deepjob', E.ERRAND_KEY, phrase('crystal.deep.errand.pay')) : 0;
    if (paid > 0 || !log) {
      const bits = progression?.state?.crystal?.chimes ?? 0;
      const i = E.nextChime(bits);
      if (i >= 0 && progression?.state) {
        progression.state.crystal = { ...(progression.state.crystal ?? {}), chimes: E.withChime(bits, i) };
        progression.addPoints?.(0); // the save own "persist now": it adds nothing
        sight('ccchimes');
        say('crystal-deep-chime', `${E.ALBUM[i][0]} ${phrase('crystal.deep.errand.chime')}`);
        if (E.nextChime(progression.state.crystal.chimes) < 0) say('crystal-deep-chimes-full', phrase('crystal.deep.errand.full'));
      }
    }
    if (kind === 'prisms') steps?.errand?.end();
    if (mesh && kind !== 'moss') mesh.visible = false;
    if (!remote) send?.(E.JOB_WIRE);
    audio?.chime?.();
    return true;
  }

  const playNote = (bar) => { flash[bar] = 0.9; tone(audio, D.PAD_FREQS[bar + 1], 0.026); };
  function startTune() { tune.phase = 'playing'; tune.t = 0; tune.note = 0; tune.got = 0; tune.again = -1; say('crystal-deep-tune', phrase('crystal.deep.errand.tune.listen')); }

  const decide = (p) => {
    if (!active() || !p) return null;
    if (kind === 'tune' && tune.phase !== 'playing' && dist(p, BAR_AT[2]) <= BAR_REACH) return { kind: 'tune', line: phrase('crystal.deep.errand.tune.prompt') };
    if (kind === 'prisms') { const i = D.standAt(p.x, p.z); if (i >= 0 && steps?.errand?.on) return { kind: 'turn', stand: i, line: phrase('crystal.deep.prism.turn') }; }
    if (kind === 'moss') {
      if (item === 'home' && E.canPickMoss(null, dist(p, spot))) return { kind: 'pick', line: phrase('crystal.deep.errand.moss.pick') };
      if (item === 'carried' && dist(p, nest) <= E.NEST_REACH) return { kind: 'give', line: phrase('crystal.deep.errand.moss.give') };
    }
    if (kind === 'hide' && !found && dist(p, spot) <= E.HIDE_REACH) return { kind: 'peek', line: phrase('crystal.deep.errand.hide.prompt') };
    return null;
  };
  const LINE = { tune: () => phrase('crystal.deep.errand.tune'), prisms: () => phrase('crystal.deep.errand.prisms'), moss: () => phrase('crystal.deep.errand.moss'), hide: () => phrase('crystal.deep.errand.hide') };
  const lineOf = () => LINE[kind]();
  const goalPoint = () => (kind === 'tune' ? BAR_AT[2] : kind === 'prisms' ? D.HALL : kind === 'moss' ? (item === 'carried' ? nest : spot) : spot);

  return {
    plan, kind,
    get state() { return { kind, eligible, done, item }; },
    promptAt(p) { if (p) cat = p; target = decide(p); return target ? target.line : null; },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'tune') startTune();
      else if (t.kind === 'turn') { if (steps.errand.turn(t.stand)) complete(); }
      else if (t.kind === 'pick') { item = 'carried'; audio?.chime?.(); say('crystal-deep-moss', phrase('crystal.deep.errand.moss.got')); }
      else if (t.kind === 'give') { item = 'given'; complete(); }
      else if (t.kind === 'peek') { found = true; complete(); }
      return t.kind;
    },
    // a partner finished the errand of the day (wd-errand): this cat is paid too, once
    credit(ev) { return E.isJobEvent(ev) && complete(true) ? 'errand' : null; },
    goalFor(prev, errand = null) {
      if (!active() || (prev?.g && prev.g.kind !== 'rest') || (errand?.eligible && !errand.done)) return prev;
      const p = goalPoint();
      return { g: { kind: 'forge', icon: 'spark', line: phrase('crystal.deep.errand.guide'), chip: phrase('crystal.deep.errand.guide.chip') }, x: p.x, z: p.z, y: crystalY(p.x, p.z) + 0.5 };
    },
    update(dt, _t, catPos = null) {
      if (disposed) return;
      const step = dt > 0 ? Math.min(dt, 0.5) : 0;
      clock += step;
      if (catPos) cat = catPos;
      if (!active()) return;
      if (!told && clock > 2.5) { told = true; say('crystal-deep-errand-today', lineOf()); }
      const anchor = goalPoint();
      if (mesh) mesh.visible = !cat || dist(cat, kind === 'moss' ? spot : anchor) <= PROP_NEAR || item === 'carried';
      if (kind === 'moss' && mesh) {
        if (item === 'carried' && cat) { mesh.position.set(cat.x, (cat.y ?? 0) + 0.75, cat.z); mesh.scale.setScalar(0.6); }
        else if (item === 'home') { mesh.position.set(spot.x, crystalY(spot.x, spot.z) + 0.04, spot.z); mesh.scale.setScalar(1); }
        else { mesh.position.set(nest.x + 0.3, crystalY(nest.x, nest.z) + nest.h, nest.z + 0.1); mesh.scale.setScalar(0.8); }
      }
      if (kind === 'tune') {
        if (tune.phase === 'playing') {
          tune.t += step;
          while (tune.note < plan.tune.length && tune.t >= 0.4 + tune.note * NOTE_GAP) playNote(plan.tune[tune.note++]);
          if (tune.note >= plan.tune.length && tune.t >= 0.4 + plan.tune.length * NOTE_GAP) { tune.phase = 'echo'; tune.got = 0; tune.last = cat ? barAt(cat.x, cat.z) : -1; }
        } else if (tune.phase === 'echo') {
          if (tune.again >= 0) { tune.again += step; if (tune.again >= REPLAY_AFTER) startTune(); }
          else if (cat) {
            const onFloor = !Number.isFinite(cat.y) || cat.y - crystalY(cat.x, cat.z) < 0.4;
            const b = onFloor ? barAt(cat.x, cat.z) : -1;
            if (b !== tune.last) {
              tune.last = b;
              if (b >= 0) {
                playNote(b);
                const r = E.tuneStep(plan.tune, tune.got, b);
                tune.got = r.got;
                if (r.event === 'done') { tune.phase = 'idle'; complete(); }
                else if (r.event === 'restart') tune.again = 0;
              }
            }
            if (dist(cat, BAR_AT[2]) > LEAVE_R) tune.phase = 'idle'; // walked away: let it go, nothing saved
          }
        }
        for (let i = 0; i < E.BARS; i++) if (flash[i] > 0) flash[i] = Math.max(0, flash[i] - step);
        if (mesh && pieces) {
          const col = mesh.geometry.attributes.color;
          for (let i = 0; i < E.BARS; i++) {
            const v = Math.round(Math.min(1, flash[i] / 0.9) * 100) / 100;
            if (flashShown[i] === v) continue;
            flashShown[i] = v;
            const p = pieces[i];
            const k = 0.5 + 0.5 * v;
            for (let j = 0; j < p.count; j++) col.setXYZ(p.start + j, Math.min(1, p.base[j * 3] * k + 0.3 * v), Math.min(1, p.base[j * 3 + 1] * k + 0.3 * v), Math.min(1, p.base[j * 3 + 2] * k + 0.3 * v));
            col.needsUpdate = true;
          }
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      item = 'home'; // a carried pad is not kept: the next walk finds it at its own place
      if (kind === 'prisms') steps?.errand?.end();
      if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh = null; }
    },
  };
}
