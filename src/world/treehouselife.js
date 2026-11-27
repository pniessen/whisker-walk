// =============================================================================
// NUTMEG AND THE FIRST LETTER ON A WALK (milestone T2: chapter one). The red squirrel postmistress, the first letter in the post box, the Bakery's window and the meow's ring of
// sparkles, all drawn here and run by the pure rules (world/treehousemission.js for the steps, world/treehousestory.js for the places and her turn).
//   * NUTMEG waits by the post box at the roots, bushy tail up; the Interact button says hello (step 1). She turns to look at the cat. Her talk is a picture over her head (a
//     letter, a little house), never text; the words (world/treehousewords.js, the one NAMES table) are only the toast line beside it.
//   * THE FIRST LETTER sits in the post box. Interact picks it up (in her mouth in front of her; the story's own item, never the walk's mouth, so it never goes to the den);
//     Interact on the Bakery deck (the cat up on the deck, not under it) posts it and the Bakery's window glows. A carried letter is NEVER SAVED: however a walk ends (leaving,
//     a room, a reload) the next walk finds it in the box, and nothing is lost.
//   * THE MEOW calls her: she shows the next goal's picture and a ring of sparkles rises where it is (a column over the spot, a trail from the cat). No fail.
// The village's ONE PointLight (made at build, treehouselight.js) is moved to the lit window when the walk's tier can afford it; the lower rungs keep the glow sprite only.
// Reduced motion: no breathing, no bob, no pulse, the window lights at once. Draws no random number and reads no clock of its own (the walk's dt only). A step done by anyone in
// the room is credited the same way (credit), and a step of hers is sent as a `th-` event.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from './treehousemission.js';
import * as S from './treehousestory.js';
import { isLowTier } from './treehouselight.js';
import { createPromptArbiter } from './promptarbiter.js';
import { ST } from './treehousestages.js';

export const RING = Object.freeze({ secs: 6, bubble: 4, points: 30 }); // how long the meow's ring and the picture stay
export const WINDOW_LOOK = Object.freeze({ off: 0x6e5a40, on: 0xffd78a, halo: 3.2, haloHigh: 0.6, rise: 1.2, light: 1.1 });
const COLORS = Object.freeze({ fur: 0xb8582c, furLight: 0xd98a4a, belly: 0xf6e4c4, eye: 0x2c2a38, nose: 0x3a2a2a, paper: 0xfbf1d6, seal: 0xc8483a, glint: 0xfff2c0, wood: 0x7a5a3c });
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

// ---- Nutmeg: a little red squirrel sitting up, facing +z. One vertex-coloured mesh: body, cream belly, head, ear tufts, eyes, nose, paws and a big bushy tail curled over her back.
export function nutmegGeometry() {
  const parts = [
    ball(0.2, 0, 0.28, 0, 0.95, 1.2, 0.95, COLORS.fur, 10), ball(0.14, 0, 0.27, 0.1, 0.95, 1.1, 0.7, COLORS.belly, 8),
    ball(0.12, 0, 0.62, 0.05, 1, 0.95, 1, COLORS.fur, 10), ball(0.05, 0, 0.58, 0.16, 1, 0.8, 0.9, COLORS.belly, 6),
    ball(0.022, -0.05, 0.65, 0.15, 1, 1, 1, COLORS.eye, 6), ball(0.022, 0.05, 0.65, 0.15, 1, 1, 1, COLORS.eye, 6), ball(0.02, 0, 0.6, 0.2, 1, 0.8, 1, COLORS.nose, 6),
    ball(0.055, -0.09, 0.12, 0.2, 1, 0.6, 1.3, COLORS.fur, 6), ball(0.055, 0.09, 0.12, 0.2, 1, 0.6, 1.3, COLORS.fur, 6),
    ball(0.035, -0.09, 0.32, 0.2, 1, 1, 1, COLORS.furLight, 6), ball(0.035, 0.09, 0.32, 0.2, 1, 1, 1, COLORS.furLight, 6),
    ball(0.13, 0, 0.55, -0.22, 0.8, 2.2, 1, COLORS.fur, 8), ball(0.11, 0, 0.88, -0.2, 0.8, 1.4, 1, COLORS.furLight, 8), // the bushy tail, up and over
  ];
  for (const s of [-1, 1]) {
    parts.push(paint(new THREE.ConeGeometry(0.035, 0.11, 5).translate(s * 0.075, 0.78, 0.04), COLORS.fur)); // an ear
    parts.push(paint(new THREE.ConeGeometry(0.018, 0.1, 4).translate(s * 0.075, 0.86, 0.04), COLORS.eye)); // its tuft
  }
  const geo = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return geo;
}
function makeNutmeg() {
  const g = new THREE.Group();
  g.name = 'treehouse:nutmeg';
  const body = mark(new THREE.Mesh(nutmegGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true })));
  body.scale.setScalar(1.15);
  g.add(body);
  g.userData.body = body;
  return g;
}
function makeLetter() {
  const g = new THREE.Group();
  g.name = 'treehouse:letter';
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.18), new THREE.MeshBasicMaterial({ color: COLORS.paper }));
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 6), new THREE.MeshBasicMaterial({ color: COLORS.seal }));
  seal.position.y = 0.03;
  g.add(mark(paper), mark(seal));
  return g;
}

// Nutmeg's picture over her head: one emoji in a round white bubble.
function makeBubble() {
  const cv = globalThis.document?.createElement?.('canvas');
  const ok = !!cv?.getContext?.('2d');
  if (ok) cv.width = cv.height = 128;
  const tex = ok ? new THREE.CanvasTexture(cv) : null;
  if (tex) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: false });
  const sprite = mark(new THREE.Sprite(mat));
  sprite.name = 'treehouse:nutmeg:bubble';
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

// createNutmeg(ctx) -> { promptAt, interact, credit, update, goalNow, goal, state, dispose, group }
// ctx: { scene, progression, audio, reducedMotion, send, light (treehouselight's), tier }
export function createNutmeg(ctx) {
  const { scene, reducedMotion = false } = ctx;
  const progression = ctx.progression ?? null;
  const audio = ctx.audio ?? null;
  const light = ctx.light ?? null;
  const lowTier = isLowTier(ctx.tier);
  const rec = () => M.normalize(progression?.state?.treehouse);

  let clock = 0;
  let disposed = false;
  let target = null; // what the action button would do now
  let carrying = null; // the letter in her mouth: 0 or null (NEVER saved)
  let meowed = false;
  let ringT = -100;
  let bubbleT = -100;
  let wobble = -100;
  let goalCur = null;
  let goalAt = -100;
  const told = new Set();
  const nutmeg = { x: S.NUTMEG.start.x, z: S.NUTMEG.start.z, yaw: Math.PI, moving: false };
  const lit = S.HOUSES.map((h) => (M.delivered(progression?.state?.treehouse, h.id) ? 1 : 0)); // each window's light, 0 to 1 (rises when posted)

  const group = makeNutmeg();
  group.position.set(nutmeg.x, 0, nutmeg.z);
  const tex = dotTexture();
  const letters = S.LETTERS.map(() => makeLetter());
  const glints = S.LETTERS.map(() => { const s = glow(COLORS.glint, 0.8, 0.6, tex); s.name = 'treehouse:letter:glint'; return s; });
  const halos = S.HOUSES.map((h) => { const s = glow(WINDOW_LOOK.on, 0, WINDOW_LOOK.halo, tex); s.name = `treehouse:window${h.id}:halo`; s.visible = false; s.position.set(h.glow.x, h.glow.y, h.glow.z); return s; });
  const bubble = makeBubble();
  const ring = sparkles(RING.points, 0.2, 0xfff0d0, 0.9, tex);
  ring.name = 'treehouse:meowRing';
  const objects = [group, ...letters, ...glints, ...halos, bubble.sprite, ring];
  for (const o of objects) scene.add(o);

  const letterMode = (i) => (M.delivered(progression?.state?.treehouse, i) ? 'posted' : carrying === i ? 'carried' : 'home');
  const wanted = () => M.wantedLetter(progression?.state?.treehouse);

  // The goal now: where the meow's ring rises and which picture Nutmeg shows. { g: { kind, letter?, icon }, x, z, y }
  function goalPoint() {
    const g = M.nextGoal(progression?.state?.treehouse, carrying);
    const l = g.letter !== undefined ? S.LETTERS[g.letter] : null;
    const h = g.letter !== undefined ? S.HOUSES[g.letter] : null;
    if (g.kind === 'letter' && l) return { g, x: l.x, z: l.z, y: 0.9 };
    if (g.kind === 'deliver' && h) return { g, x: h.x, z: h.z, y: h.y };
    return { g, x: nutmeg.x, z: nutmeg.z, y: 0 };
  }
  const goal = () => (goalCur ?? (goalCur = goalPoint()));

  function commit(next) {
    const pr = progression;
    if (!pr?.state) return;
    pr.state.treehouse = { ...(pr.state.treehouse ?? {}), step: next.step, letters: next.letters };
    pr.addPoints?.(0); // the save's own "persist now": it adds nothing
  }
  function perform(ev, { remote = false } = {}) {
    const r = remote ? M.credit(progression?.state?.treehouse, ev) : M.apply(progression?.state?.treehouse, ev);
    if (!r.changed) return null;
    commit(r.treehouse);
    goalCur = null;
    return r.effect;
  }
  function showBubble(kind) { bubble.show(kind); bubbleT = clock; }
  function callNutmeg() {
    const gp = goal();
    ringT = clock;
    showBubble(gp.g.icon);
    audio?.chime?.();
    const hintKey = 'hint-' + gp.g.kind + (gp.g.letter ?? '');
    if (!told.has(hintKey)) {
      told.add(hintKey);
      if (gp.g.kind === 'letter') say('treehouse-letter-find', phrase('treehouse.letter.find'));
    }
  }
  const offMeow = bus.on('tip:did', (e) => { if (e && e.id === 'call') meowed = true; });

  // ---- the action button -------------------------------------------------------------------------------------------------------
  function decide(catPos) {
    if (disposed || !catPos) return null;
    const r = rec();
    if (r.step < M.STEP.met && dist(catPos, nutmeg) < S.NUTMEG.reach) return { kind: 'meet', line: phrase('treehouse.nutmeg.prompt') };
    if (carrying !== null) {
      const h = S.HOUSES[carrying];
      if (h && dist(catPos, h) < h.reach && (catPos.y ?? h.y) >= h.minY) return { kind: 'give', letter: carrying, line: phrase('treehouse.letter.give') };
    }
    if (carrying === null && wanted() >= 0) {
      const l = S.LETTERS[wanted()];
      if (l && dist(catPos, l) < l.reach) return { kind: 'pick', letter: l.id, line: phrase('treehouse.letter.prompt') };
    }
    return null;
  }

  function placeLetter(i, t, catPos, session) {
    const l = S.LETTERS[i];
    const mode = letterMode(i);
    const g = letters[i];
    let x = l.x; let z = l.z; let y = l.y + 0.02;
    if (mode === 'carried' && catPos) {
      const yaw = session?.cat?.rotation?.y ?? 0;
      x = catPos.x + Math.sin(yaw) * 0.5; z = catPos.z + Math.cos(yaw) * 0.5; y = (catPos.y ?? 0) + 0.18;
    } else if (mode === 'posted') { const h = S.HOUSES[i]; x = h.sill.x; y = h.sill.y; z = h.sill.z; }
    g.position.set(x, y, z);
    g.visible = true;
    const gl = glints[i];
    gl.visible = mode === 'home' && wanted() === i;
    if (gl.visible) {
      gl.position.set(x, y + 0.45, z);
      gl.material.opacity = reducedMotion ? 0.75 : 0.45 + 0.4 * Math.sin(t * 3.1 + i * 2);
    }
  }
  const _on = new THREE.Color();
  function placeWindows(dt) {
    let top = 0;
    let at = null;
    for (let i = 0; i < halos.length; i++) {
      const want = M.delivered(progression?.state?.treehouse, i) ? 1 : 0;
      lit[i] = reducedMotion ? want : lit[i] + Math.sign(want - lit[i]) * Math.min(Math.abs(want - lit[i]), dt / WINDOW_LOOK.rise);
      const k = smooth(lit[i]);
      const h = halos[i];
      h.visible = lit[i] > 0.001;
      h.material.opacity = WINDOW_LOOK.haloHigh * k;
      if (k >= top && k > 0) { top = k; at = S.HOUSES[i]; }
    }
    // the village's one light sits at the newest lit window (not on the low rungs: the glow sprite is enough there)
    if (light && !lowTier) {
      if (at) light.setGlow(at.glow.x, at.glow.y + 0.2, at.glow.z + 0.8, WINDOW_LOOK.light * top);
      else light.setGlow(light.light?.position.x ?? 0, light.light?.position.y ?? 0, light.light?.position.z ?? 0, 0);
    }
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
    const sx = catPos ? catPos.x : nutmeg.x; const sz = catPos ? catPos.z : nutmeg.z; const sy = catPos?.y ?? 0;
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
    get state() { return { clock, carrying, nutmeg: { ...nutmeg }, record: rec(), letterModes: S.LETTERS.map((l) => letterMode(l.id)), bubble: bubble.icon, lit: [...lit] }; },
    get nutmeg() { return nutmeg; },
    get group() { return group; },
    get letters() { return letters; },
    get halos() { return halos; },
    get bubble() { return bubble; },
    goalNow: goalPoint,
    goal,
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
          showBubble('letter');
          say('treehouse-nutmeg-met', phrase('treehouse.nutmeg.met'));
        }
      } else if (t.kind === 'pick') {
        carrying = t.letter;
        audio?.chime?.();
        say('treehouse-letter-got', phrase('treehouse.letter.got'));
        showBubble('house');
      } else if (t.kind === 'give') {
        const id = t.letter;
        carrying = null;
        const effect = perform({ kind: 'deliver', letter: id });
        wobble = clock;
        if (effect) {
          ctx.send?.(M.wire({ kind: 'deliver', letter: id }));
          audio?.chime?.();
          say('treehouse-bakery-delivered', phrase('treehouse.bakery.delivered'));
          showBubble('heart');
        }
      }
      return t.kind;
    },
    // a step done by anyone in the room (a `th-` event): the same effects as her own; the letter she was holding is gone from her mouth if it was the one just posted
    credit(ev) {
      const step = M.toStep(ev);
      if (!step || disposed) return null;
      const effect = perform(step, { remote: true });
      if (!effect) return null;
      if (carrying !== null && M.delivered(progression?.state?.treehouse, carrying)) carrying = null;
      wobble = clock;
      return effect;
    },
    update(dt, t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      const r = rec();
      const near = catPos ? dist(catPos, nutmeg) : 1e9;

      // Nutmeg: stands, turns to the cat
      S.nutmegStep(nutmeg, catPos, step);
      if (catPos && !told.has('seen') && r.step < M.STEP.met && near < S.NUTMEG.seen) { told.add('seen'); showBubble('letter'); say('treehouse-nutmeg-hello', phrase('treehouse.nutmeg.hello')); }
      const wob = clock - wobble < 1.2 && !reducedMotion ? Math.sin((clock - wobble) * 12) * 0.25 * (1 - (clock - wobble) / 1.2) : 0;
      const breathe = reducedMotion ? 0 : 0.02 * Math.sin(clock * 2.2);
      group.position.set(nutmeg.x, 0, nutmeg.z);
      group.rotation.y = nutmeg.yaw + wob;
      group.userData.body.scale.set(1.15, 1.15 * (1 + breathe), 1.15);
      group.visible = !catPos || near < 60;

      for (let i = 0; i < letters.length; i++) placeLetter(i, t, catPos, session);
      placeWindows(step);

      // the meow: Nutmeg shows the next picture and the ring rises
      if (meowed) { meowed = false; callNutmeg(); }

      // the picture over her head
      const bk = clock - bubbleT;
      if (bk >= 0 && bk < RING.bubble) {
        bubble.sprite.visible = true;
        bubble.sprite.position.set(nutmeg.x, 1.6 + (reducedMotion ? 0 : 0.05 * Math.sin(t * 4)), nutmeg.z);
        bubble.sprite.material.opacity = smooth(bk / 0.25) * (1 - smooth((bk - (RING.bubble - 0.6)) / 0.6));
      } else bubble.sprite.visible = false;

      placeRing(t, catPos);
      if (clock - goalAt > 0.5) { goalCur = null; goalAt = clock; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      offMeow?.();
      carrying = null; // a letter in her mouth when the walk ends is not kept: the next walk finds it in the box
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

// The action button's one arbiter for the place: Nutmeg first, then the stages' own offers (stage slots that answer null until a stage fills them, so later milestones add to the
// list and never fight over it).
export function createTreehousePrompts(nutmeg) {
  const slot = (get) => ({ promptAt: (p) => get()?.promptAt?.(p) ?? null, interact: () => get()?.interact?.() ?? null });
  return createPromptArbiter([nutmeg, slot(() => ST.branches), slot(() => ST.lift)]);
}
