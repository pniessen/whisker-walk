// =============================================================================
// MOSSY AND THE FIRST MANGO ON A WALK (milestone J2: chapter one). The old tortoise who keeps the lodge, the mango tree and the ripe mango in the grove, the kitchen table on the
// veranda and the meow's ring of sparkles, all drawn here and run by the pure rules (world/junglemission.js for the steps, world/junglestory.js for the places and her turn).
//   * MOSSY sits on the veranda, shell moss-green; the Interact button says hello (step 1). She slowly turns to look at the cat. Her talk is a picture over her head (a mango, a
//     table), never text; the words (world/junglewords.js, the one NAMES table) are only the toast line beside it.
//   * THE FIRST MANGO lies under the mango tree in the grove. Interact picks it up (in her mouth in front of her; the story's own item, never the walk's mouth, so it never goes
//     to the den); Interact at the kitchen table (the cat up on the veranda, not under it) sets it down and the table glows. A carried mango is NEVER SAVED: however a walk ends
//     (leaving, a room, a reload) the next walk finds it under the tree, and nothing is lost.
//   * THE MEOW calls her: she shows the next goal's picture and a ring of sparkles rises where it is (a column over the spot, a trail from the cat). No fail.
// The place's ONE PointLight (the veranda lantern's, made at build in jungleparts.js) is not touched here: the table's glow is a sprite. Reduced motion: no breathing, no bob,
// no pulse, the table lights at once. Draws no random number and reads no clock of its own (the walk's dt only). A step done by anyone in the room is credited the same way
// (credit), and a step of hers is sent as a `jl-` event.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from './junglemission.js';
import * as S from './junglestory.js';
import * as P from './jungleplan.js';
import { createPromptArbiter } from './promptarbiter.js';
import { ST } from './junglestages.js';

export const RING = Object.freeze({ secs: 6, bubble: 4, points: 30 }); // how long the meow's ring and the picture stay
export const TABLE_LOOK = Object.freeze({ halo: 2.4, haloHigh: 0.55, rise: 1.2 });
const COLORS = Object.freeze({
  shell: 0x6a7a3c, shellDark: 0x4e5c2c, plate: 0x8a9650, moss: 0x5f9a48, skin: 0x9aa56a, belly: 0xe2d49a, eye: 0x24241c,
  mango: 0xf0a020, mangoRed: 0xd8502c, stem: 0x4c7a30, glint: 0xfff2c0, wood: 0x8a5e3a, woodLight: 0xb88a58, trunk: 0x6e5238, leaf: 0x3f8f3c, leafLight: 0x5fae48, cloth: 0xe8d8a8, plateCol: 0xf2ead2,
});
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const mark = (o) => { o.castShadow = false; o.receiveShadow = false; Object.assign(o.userData, { noMerge: true, noCast: true, noContactShadow: true }); return o; };

const paint = (geo, hex) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
};
const ball = (r, x, y, z, sx, sy, sz, hex, seg = 8) => paint(new THREE.SphereGeometry(r, seg, seg - 2).scale(sx, sy, sz).translate(x, y, z), hex);
const merged = (parts) => { const geo = mergeGeometries(parts, false); parts.forEach((p) => p.dispose()); return geo; };

let _dot = null;
function dotTexture() {
  if (_dot) return _dot;
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
    const k = (y * n + x) * 4;
    data[k] = data[k + 1] = data[k + 2] = 255; data[k + 3] = Math.round(255 * (r >= 1 ? 0 : (1 - r) ** 1.4));
  }
  _dot = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  _dot.needsUpdate = true;
  return _dot;
}

// ---- Mossy: a friendly old tortoise facing +z. One vertex-coloured mesh: a high moss-green shell with lighter plates and a moss patch, a pale belly rim, a long neck and head, four
// stubby legs and a small tail.
export function mossyGeometry() {
  const parts = [
    ball(0.3, 0, 0.2, 0, 1, 0.78, 1.2, COLORS.shell, 12), ball(0.31, 0, 0.1, 0, 1, 0.3, 1.2, COLORS.belly, 10),
    ball(0.1, 0, 0.5, 0, 1.1, 0.5, 1.3, COLORS.plate, 8), ball(0.1, -0.19, 0.38, 0.04, 1, 0.5, 1.2, COLORS.plate, 6), ball(0.1, 0.19, 0.38, 0.04, 1, 0.5, 1.2, COLORS.plate, 6),
    ball(0.1, 0, 0.36, -0.22, 1, 0.5, 1.1, COLORS.shellDark, 6), ball(0.1, 0, 0.36, 0.22, 1, 0.5, 1.1, COLORS.shellDark, 6),
    ball(0.12, 0.05, 0.53, -0.1, 1.2, 0.35, 1, COLORS.moss, 6), // a tuft of moss
    ball(0.07, 0, 0.2, 0.33, 1, 1, 1.9, COLORS.skin, 8), ball(0.095, 0, 0.27, 0.5, 1, 0.95, 1.05, COLORS.skin, 10), // neck and head
    ball(0.016, -0.05, 0.3, 0.57, 1, 1, 1, COLORS.eye, 6), ball(0.016, 0.05, 0.3, 0.57, 1, 1, 1, COLORS.eye, 6),
    ball(0.05, 0, 0.04, -0.36, 1, 0.8, 1.6, COLORS.skin, 6),
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(ball(0.075, sx * 0.24, 0.06, sz * 0.2, 1, 0.9, 1.3, COLORS.skin, 6)); // four legs
  return merged(parts);
}
function makeMossy() {
  const g = new THREE.Group();
  g.name = 'jungle:mossy';
  const body = mark(new THREE.Mesh(mossyGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true })));
  body.scale.setScalar(1.3);
  g.add(body);
  g.userData.body = body;
  return g;
}

// ---- the mango: a plump ellipsoid with a red cheek and a little stem (also the three on the tree, which are only to look at)
function mangoGeometry() {
  return merged([ball(0.1, 0, 0, 0, 1, 1.2, 0.85, COLORS.mango, 8), ball(0.06, 0.04, -0.02, 0.04, 1, 1.1, 0.8, COLORS.mangoRed, 6), paint(new THREE.CylinderGeometry(0.01, 0.014, 0.05, 4).translate(0, 0.13, 0), COLORS.stem)]);
}
function makeMango() {
  const g = new THREE.Group();
  g.name = 'jungle:mango';
  g.add(mark(new THREE.Mesh(mangoGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }))));
  return g;
}
// The banana bunch and the cacao pod are stage b's (junglewingparts.js fruitModel); a stage that is not in leaves a mango in their place (never reached: their steps are stage b's).
const makeFruit = (kind) => (kind === 'mango' ? makeMango() : ST.b?.fruitModel?.(kind) ?? makeMango());

// ---- the mango tree in the grove: a thick trunk, a broad green crown of five lumps, three mangoes hanging. One mesh.
export function treeGeometry() {
  const parts = [paint(new THREE.CylinderGeometry(0.28, 0.4, 3.0, 8).translate(0, 1.5, 0), COLORS.trunk)];
  [[0, 3.7, 0, 1.9], [-1.3, 3.2, 0.5, 1.4], [1.3, 3.3, -0.4, 1.5], [0.4, 3.0, 1.3, 1.3], [-0.5, 4.3, -0.8, 1.3]].forEach(([x, y, z, r], i) => parts.push(ball(r, x, y, z, 1, 0.75, 1, i % 2 ? COLORS.leafLight : COLORS.leaf, 8)));
  [[0.9, 2.55, 0.9], [-0.7, 2.7, 1.0], [0.1, 2.6, -1.1]].forEach(([x, y, z]) => parts.push(ball(0.11, x, y, z, 1, 1.2, 0.85, COLORS.mango, 6)));
  return merged(parts);
}

// ---- the kitchen table: a plank top, four legs, a cloth runner and three plates (the fruit sit on them)
export function tableGeometry() {
  const T = S.TABLE;
  const parts = [paint(new THREE.BoxGeometry(1.5, 0.08, 0.9).translate(0, 0.58, 0), COLORS.woodLight), paint(new THREE.BoxGeometry(1.5, 0.01, 0.28).translate(0, 0.63, 0), COLORS.cloth)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(paint(new THREE.BoxGeometry(0.1, 0.56, 0.1).translate(sx * 0.65, 0.28, sz * 0.36), COLORS.wood));
  for (const s of T.slots) parts.push(paint(new THREE.CylinderGeometry(0.14, 0.12, 0.025, 10).translate(s.x - T.x, 0.65, s.z - T.z), COLORS.plateCol));
  return merged(parts);
}

// Mossy's picture over her head: one emoji in a round white bubble.
function makeBubble() {
  const cv = globalThis.document?.createElement?.('canvas');
  const ok = !!cv?.getContext?.('2d');
  if (ok) cv.width = cv.height = 128;
  const tex = ok ? new THREE.CanvasTexture(cv) : null;
  if (tex) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: false });
  const sprite = mark(new THREE.Sprite(mat));
  sprite.name = 'jungle:mossy:bubble';
  sprite.scale.set(0.75, 0.75, 1);
  sprite.visible = false;
  let shown = null;
  return {
    sprite,
    get icon() { return shown; },
    show(name) {
      shown = name;
      if (!ok) return;
      const c = cv.getContext('2d');
      c.clearRect(0, 0, 128, 128);
      c.fillStyle = 'rgba(255,255,255,.96)';
      c.beginPath(); c.arc(64, 60, 52, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(44, 100); c.lineTo(64, 126); c.lineTo(80, 98); c.fill();
      c.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000';
      c.fillText(S.BUBBLE_ICON[name] ?? S.BUBBLE_ICON.heart, 64, 64);
      tex.needsUpdate = true;
    },
    dispose() { tex?.dispose(); mat.dispose(); },
  };
}

function sparkles(n, size, color, opacity, map) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({ map, alphaTest: 0.02, size, sizeAttenuation: true, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const p = mark(new THREE.Points(geo, mat));
  p.frustumCulled = false;
  p.visible = false;
  return p;
}
const glow = (color, opacity, scale, map) => {
  const sp = mark(new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true })));
  sp.scale.setScalar(scale);
  return sp;
};

const findLine = (i) => (i === 1 ? phrase('jungle.banana.find') : i === 2 ? phrase('jungle.cacao.find') : phrase('jungle.fruit.find'));
const gotLine = (i) => (i === 1 ? phrase('jungle.banana.got') : i === 2 ? phrase('jungle.cacao.got') : phrase('jungle.fruit.got'));

// createMossy(ctx) -> { promptAt, interact, credit, step, update, goalNow, goal, state, dispose, group }
// ctx: { scene, progression, audio, reducedMotion, send }
export function createMossy(ctx) {
  const { scene, reducedMotion = false } = ctx;
  const progression = ctx.progression ?? null;
  const audio = ctx.audio ?? null;
  const rec = () => M.normalize(progression?.state?.jungle);

  let clock = 0;
  let disposed = false;
  let target = null; // what the action button would do now
  let carrying = null; // the fruit in her mouth: 0, 1, 2 or null (NEVER saved)
  let meowed = false;
  let ringT = -100;
  let bubbleT = -100;
  let wobble = -100;
  let goalCur = null;
  let goalAt = -100;
  const told = new Set();
  const mossy = { x: S.MOSSY.start.x, z: S.MOSSY.start.z, yaw: Math.PI, moving: false };
  let lit = M.delivered(progression?.state?.jungle, 0) ? 1 : 0; // the table's glow, 0 to 1 (rises when the fruit is set down)

  const FR = S.allFruits(); // the mango, and the banana and the cacao once stage b is in (milestone J5)
  const group = makeMossy();
  group.position.set(mossy.x, S.TABLE.y, mossy.z);
  const tex = dotTexture();
  const scenery = [
    Object.assign(mark(new THREE.Mesh(treeGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }))), { name: 'jungle:mangotree' }),
    Object.assign(mark(new THREE.Mesh(tableGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }))), { name: 'jungle:table' }),
  ];
  scenery[0].position.set(P.MANGO_TREE.x, P.jungleY(P.MANGO_TREE.x, P.MANGO_TREE.z), P.MANGO_TREE.z);
  scenery[1].position.set(S.TABLE.x, S.TABLE.y, S.TABLE.z);
  const fruits = FR.map((f) => makeFruit(f.kind));
  const glints = FR.map(() => { const s = glow(COLORS.glint, 0.8, 0.6, tex); s.name = 'jungle:fruit:glint'; return s; });
  const halo = glow(0xffd78a, 0, TABLE_LOOK.halo, tex);
  halo.name = 'jungle:table:halo';
  halo.visible = false;
  halo.position.set(S.TABLE.glow.x, S.TABLE.glow.y, S.TABLE.glow.z);
  const bubble = makeBubble();
  const ring = sparkles(RING.points, 0.2, 0xfff0d0, 0.9, tex);
  ring.name = 'jungle:meowRing';
  const objects = [group, ...scenery, ...fruits, ...glints, halo, bubble.sprite, ring];
  for (const o of objects) scene.add(o);

  const fruitMode = (i) => (M.delivered(progression?.state?.jungle, i) ? 'posted' : carrying === i ? 'carried' : 'home');
  const wanted = () => M.wantedFruit(progression?.state?.jungle);

  // The goal now: where the meow's ring rises and which picture Mossy shows. { g: { kind, fruit?, icon }, x, z, y }
  function goalPoint() {
    const g = M.nextGoal(progression?.state?.jungle, carrying);
    const f = g.fruit !== undefined ? FR[g.fruit] : null;
    if (g.kind === 'fruit' && f) return { g, x: f.x, z: f.z, y: P.jungleY(f.x, f.z) + f.y + 0.45 };
    if (g.kind === 'deliver' || g.kind === 'set') return { g, x: S.TABLE.x, z: S.TABLE.z, y: S.TABLE.y };
    return { g, x: mossy.x, z: mossy.z, y: S.TABLE.y };
  }
  const goal = () => (goalCur ?? (goalCur = goalPoint()));

  function commit(next) {
    const pr = progression;
    if (!pr?.state) return;
    pr.state.jungle = { ...(pr.state.jungle ?? {}), step: next.step, fruit: next.fruit };
    pr.addPoints?.(0); // the save's own "persist now": it adds nothing
  }
  function perform(ev, { remote = false } = {}) {
    const r = remote ? M.credit(progression?.state?.jungle, ev) : M.apply(progression?.state?.jungle, ev);
    if (!r.changed) return null;
    const before = rec().step;
    commit(r.jungle);
    goalCur = null;
    if (before < M.STEP.third && r.jungle.step >= M.STEP.third) progression?.recordSighting?.('jl7'); // the journal's fruit page: all three are delivered
    return r.effect;
  }
  function showBubble(kind) { bubble.show(kind); bubbleT = clock; }
  function callMossy() {
    const gp = goal();
    ringT = clock;
    showBubble(gp.g.icon);
    audio?.chime?.();
    const hintKey = 'hint-' + gp.g.kind + (gp.g.fruit ?? '');
    if (!told.has(hintKey)) {
      told.add(hintKey);
      if (gp.g.kind === 'fruit') say('jungle-fruit-find' + (gp.g.fruit || ''), findLine(gp.g.fruit));
    }
  }
  const offMeow = bus.on('tip:did', (e) => { if (e && e.id === 'call') meowed = true; });

  // ---- the action button -------------------------------------------------------------------------------------------------------
  function decide(catPos) {
    if (disposed || !catPos) return null;
    const r = rec();
    if (r.step < M.STEP.met && dist(catPos, mossy) < S.MOSSY.reach) return { kind: 'meet', line: phrase('jungle.mossy.prompt') };
    if (carrying !== null && dist(catPos, S.TABLE) < S.TABLE.reach && (catPos.y ?? S.TABLE.y) >= S.TABLE.minY) return { kind: 'give', fruit: carrying, line: phrase('jungle.fruit.give') };
    if (carrying === null && wanted() >= 0) {
      const f = FR[wanted()];
      if (f && dist(catPos, f) < f.reach && (catPos.y ?? 0) >= (f.minY ?? -Infinity)) return { kind: 'pick', fruit: f.id, line: phrase('jungle.fruit.prompt') };
    }
    return null;
  }

  function placeFruit(i, t, catPos, session) {
    const f = FR[i];
    const mode = fruitMode(i);
    const g = fruits[i];
    let x = f.x; let z = f.z; let y = P.jungleY(f.x, f.z) + f.y;
    if (mode === 'carried' && catPos) {
      const yaw = session?.cat?.rotation?.y ?? 0;
      x = catPos.x + Math.sin(yaw) * 0.5; z = catPos.z + Math.cos(yaw) * 0.5; y = (catPos.y ?? 0) + 0.18;
    } else if (mode === 'posted') { const s = S.TABLE.slots[i]; x = s.x; y = s.y + 0.1; z = s.z; }
    g.position.set(x, y, z);
    g.visible = true;
    const gl = glints[i];
    gl.visible = mode === 'home' && wanted() === i;
    if (gl.visible) {
      gl.position.set(x, y + 0.4, z);
      gl.material.opacity = reducedMotion ? 0.75 : 0.45 + 0.4 * Math.sin(t * 3.1 + i * 2);
    }
  }
  function placeTable(dt) {
    const want = M.delivered(progression?.state?.jungle, 0) ? 1 : 0;
    lit = reducedMotion ? want : lit + Math.sign(want - lit) * Math.min(Math.abs(want - lit), dt / TABLE_LOOK.rise);
    halo.visible = lit > 0.001;
    halo.material.opacity = TABLE_LOOK.haloHigh * smooth(lit);
  }

  function placeRing(t, catPos) {
    const rk = clock - ringT;
    if (rk < 0 || rk >= RING.secs) { ring.visible = false; return; }
    const gp = goal();
    const fade = smooth(rk / 0.4) * (1 - smooth((rk - (RING.secs - 1.2)) / 1.2));
    ring.material.opacity = 0.9 * fade;
    ring.visible = true;
    const pos = ring.geometry.attributes.position;
    let k = 0;
    const bob = reducedMotion ? 0 : t * 1.4;
    for (let i = 0; i < 12; i++, k++) { // a ring of sparkles round the goal
      const a = (i / 12) * Math.PI * 2 + bob * 0.4;
      pos.setXYZ(k, gp.x + Math.cos(a) * 0.9, gp.y + 0.35 + (reducedMotion ? 0 : 0.12 * Math.sin(bob * 2 + i)), gp.z + Math.sin(a) * 0.9);
    }
    for (let i = 0; i < 8; i++, k++) { // a column of them over it (so it shows from far)
      const ph = reducedMotion ? i / 8 : ((bob * 0.25 + i / 8) % 1);
      pos.setXYZ(k, gp.x + 0.1 * Math.sin(i * 2), gp.y + 0.3 + ph * 2.4, gp.z + 0.1 * Math.cos(i * 2));
    }
    const sx = catPos ? catPos.x : mossy.x; const sz = catPos ? catPos.z : mossy.z; const sy = catPos?.y ?? 0;
    const dx = gp.x - sx; const dz = gp.z - sz;
    const dd = Math.hypot(dx, dz) || 1;
    for (let i = 0; k < RING.points; i++, k++) { // a trail from the cat toward it, rising to the goal's height
      const along = Math.min(dd, 1.6 + i * 1.3);
      const px = sx + (dx / dd) * along; const pz = sz + (dz / dd) * along;
      pos.setXYZ(k, px, sy + (gp.y - sy) * (along / dd) + 0.5 + (reducedMotion ? 0 : 0.15 * Math.sin(bob * 2 + i)), pz);
    }
    pos.needsUpdate = true;
  }

  return {
    get state() { return { clock, carrying, mossy: { ...mossy }, record: rec(), fruitModes: FR.map((f) => fruitMode(f.id)), bubble: bubble.icon, lit }; },
    get mossy() { return mossy; },
    get group() { return group; },
    get fruits() { return fruits; },
    get halo() { return halo; },
    get bubble() { return bubble; },
    goalNow: goalPoint,
    goal,
    // a step of the story that is not a button here (stage b's: 'set' at the table, and the supper's own steps): the same effects and the same wire as her own
    step(ev, remote = false) {
      if (disposed) return null;
      const effect = perform(ev, { remote });
      if (effect && !remote && ev.kind === 'set') ctx.send?.(M.wire(ev));
      return effect;
    },
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      goalCur = null;
      if (t.kind === 'meet') {
        if (perform({ kind: 'meet' })) {
          ctx.send?.(M.wire({ kind: 'meet' }));
          audio?.chime?.();
          showBubble('fruit');
          say('jungle-mossy-met', phrase('jungle.mossy.met'));
        }
      } else if (t.kind === 'pick') {
        carrying = t.fruit;
        audio?.chime?.();
        say('jungle-fruit-got' + (t.fruit || ''), gotLine(t.fruit));
        showBubble('table');
      } else if (t.kind === 'give') {
        const id = t.fruit;
        carrying = null;
        const effect = perform({ kind: 'deliver', fruit: id });
        wobble = clock;
        if (effect) {
          ctx.send?.(M.wire({ kind: 'deliver', fruit: id }));
          audio?.chime?.();
          say('jungle-table-delivered', phrase('jungle.table.delivered'));
          showBubble('heart');
        }
      }
      return t.kind;
    },
    // a step done by anyone in the room (a `jl-` event): the same effects as her own; the fruit she was holding is gone from her mouth if it was the one just set down
    credit(ev) {
      const step = M.toStep(ev);
      if (!step || disposed) return null;
      const effect = perform(step, { remote: true });
      if (!effect) return null;
      if (carrying !== null && M.delivered(progression?.state?.jungle, carrying)) carrying = null;
      wobble = clock;
      return effect;
    },
    update(dt, t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      const r = rec();
      const near = catPos ? dist(catPos, mossy) : 1e9;

      // Mossy: sits, turns to the cat
      S.mossyStep(mossy, catPos, step);
      if (catPos && !told.has('seen') && r.step < M.STEP.met && near < S.MOSSY.seen) { told.add('seen'); showBubble('fruit'); say('jungle-mossy-hello', phrase('jungle.mossy.hello')); }
      const wob = clock - wobble < 1.2 && !reducedMotion ? Math.sin((clock - wobble) * 12) * 0.2 * (1 - (clock - wobble) / 1.2) : 0;
      const breathe = reducedMotion ? 0 : 0.02 * Math.sin(clock * 1.6);
      group.position.set(mossy.x, S.TABLE.y, mossy.z);
      group.rotation.y = mossy.yaw + wob;
      group.userData.body.scale.set(1.3, 1.3 * (1 + breathe), 1.3);
      group.visible = !catPos || near < 60;

      for (let i = 0; i < fruits.length; i++) placeFruit(i, t, catPos, session);
      placeTable(step);

      // the meow: Mossy shows the next picture and the ring rises
      if (meowed) { meowed = false; callMossy(); }

      // the picture over her head
      const bk = clock - bubbleT;
      if (bk >= 0 && bk < RING.bubble) {
        bubble.sprite.visible = true;
        bubble.sprite.position.set(mossy.x, S.TABLE.y + 1.1 + (reducedMotion ? 0 : 0.05 * Math.sin(t * 4)), mossy.z);
        bubble.sprite.material.opacity = smooth(bk / 0.25) * (1 - smooth((bk - (RING.bubble - 0.6)) / 0.6));
      } else bubble.sprite.visible = false;

      placeRing(t, catPos);
      if (clock - goalAt > 0.5) { goalCur = null; goalAt = clock; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      offMeow?.();
      carrying = null; // a fruit in her mouth when the walk ends is not kept: the next walk finds it under the tree
      bubble.dispose();
      for (const o of objects) {
        scene.remove(o);
        o.traverse?.((m) => {
          m.geometry?.dispose?.();
          if (m.material && m.material !== bubble.sprite.material) m.material.dispose?.();
        });
      }
    },
  };
}

// The action button's one arbiter for the place: Mossy first, then the stages' own offers (stage slots that answer null until a stage fills them, so later milestones add to the
// list and never fight over it).
export function createJunglePrompts(mossy, wing = null) {
  const slot = (get) => ({ promptAt: (p) => get()?.promptAt?.(p) ?? null, interact: () => get()?.interact?.() ?? null });
  return createPromptArbiter([mossy, slot(() => wing), slot(() => ST.c)]);
}
