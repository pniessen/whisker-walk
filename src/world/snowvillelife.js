// =============================================================================
// TILLY AND THE FIRST CANDLE ON A WALK (milestone V2: chapter one). The snow hare apprentice, the first candle, the Square lantern and the meow's ring of sparkles, all drawn
// here and run by the pure rules (world/snowvillemission.js for the steps, world/snowvillestory.js for the places and her moves).
//   * TILLY waits by the court, her cheeks pink; the Interact button says hello (step 1). Then she follows at a shy distance, hopping. Her talk is a picture over her head (a
//     lit lantern, a spark), never text; the words (world/snowvillewords.js, the one NAMES table) are only the toast line beside it.
//   * THE FIRST CANDLE glints in the baker's window box. Interact picks it up (in her mouth in front of her, like the Cave's stones; the story's own item, never the walk's
//     mouth, so it never goes to the den); Interact beside the Square lantern sets it there and the lantern lights. A carried candle is NEVER SAVED: however a walk ends
//     (leaving, a teleport, a room, a reload) the next walk finds it at its own spot, and nothing is lost.
//   * THE MEOW calls her: she shows the next goal's picture and a ring of sparkles rises where it is (a column over the spot, a trail from her). No fail.
// Reduced motion: no hop, no bob, no pulse, the lantern lights at once. The lower rungs draw the same (it is a handful of meshes). Draws no random number and reads no clock of
// its own (the walk's dt only). A step done by anyone in the room is credited the same way (credit), and a step of hers is sent as an `sv-` event.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from './snowvillemission.js';
import * as S from './snowvillestory.js';
import { snowY } from './snowvilleplan.js';
import { dotTexture } from './snowvilleparts.js';
import { createPromptArbiter } from './promptarbiter.js';
import { ST } from './snowvillestages.js';

export const RING = Object.freeze({ secs: 6, bubble: 4, points: 30 }); // how long the meow's ring and the picture stay
export const LANTERN_LOOK = Object.freeze({ off: 0x8fa3ba, on: 0xffd78a, halo: 5, haloHigh: 0.55, rise: 1.4 });
const COLORS = Object.freeze({ fur: 0xf3f6fb, ear: 0xf0b8c8, eye: 0x2c2a38, cheek: 0xff9fb4, scarf: 0xc0453f, wood: 0x6a5242, wax: 0xfff1d2, glint: 0xfff2c0 });
const ICON_KEY = Object.freeze({ lantern: 'lantern', spark: 'spark', heart: 'heart', fire: 'fire', star: 'star' });
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

// ---- Tilly: a soft little snow hare facing +z. One vertex-coloured mesh: body, haunches, head, two long ears, tail, eyes, pink cheeks, nose, scarf. -------------------
export function tillyGeometry() {
  const parts = [
    ball(0.26, 0, 0.3, 0, 0.9, 0.9, 1.3, COLORS.fur, 10), ball(0.17, -0.15, 0.22, -0.14, 1, 1, 1.1, COLORS.fur), ball(0.17, 0.15, 0.22, -0.14, 1, 1, 1.1, COLORS.fur),
    ball(0.15, 0, 0.52, 0.27, 1, 0.95, 1.05, COLORS.fur, 10), ball(0.075, 0, 0.28, -0.4, 1, 1, 1, COLORS.fur, 6),
    ball(0.028, -0.075, 0.57, 0.4, 1, 1, 1, COLORS.eye, 6), ball(0.028, 0.075, 0.57, 0.4, 1, 1, 1, COLORS.eye, 6), ball(0.026, 0, 0.5, 0.43, 1, 0.8, 1, COLORS.cheek, 6),
    ball(0.04, -0.12, 0.49, 0.36, 1, 0.8, 0.6, COLORS.cheek, 6), ball(0.04, 0.12, 0.49, 0.36, 1, 0.8, 0.6, COLORS.cheek, 6),
    ball(0.075, -0.1, 0.1, 0.28, 1, 0.6, 1.3, COLORS.fur, 6), ball(0.075, 0.1, 0.1, 0.28, 1, 0.6, 1.3, COLORS.fur, 6),
  ];
  for (const s of [-1, 1]) {
    parts.push(paint(new THREE.SphereGeometry(0.06, 7, 5).scale(0.7, 3.4, 0.45).rotateX(-0.3).translate(s * 0.075, 0.82, 0.2), COLORS.fur)); // a long ear
    parts.push(paint(new THREE.SphereGeometry(0.04, 6, 4).scale(0.6, 3.0, 0.3).rotateX(-0.3).translate(s * 0.075, 0.82, 0.225), COLORS.ear)); // its pink inside
  }
  parts.push(paint(new THREE.TorusGeometry(0.115, 0.034, 5, 10).rotateX(Math.PI / 2 - 0.35).translate(0, 0.4, 0.2), COLORS.scarf)); // the lamplighter's apprentice's scarf
  return mergeGeometries(parts);
}
function makeTilly() {
  const g = new THREE.Group();
  g.name = 'snowville:tilly';
  const body = new THREE.Mesh(tillyGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  g.add(mark(body));
  g.userData.body = body;
  g.scale.setScalar(1.6);
  return g;
}

// ---- the candle, and the lantern -----------------------------------------------------------------------------------------------------
function makeCandle() {
  const g = new THREE.Group();
  g.name = 'snowville:candle';
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.22, 7), new THREE.MeshBasicMaterial({ color: COLORS.wax }));
  wax.position.y = 0.11;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4).scale(0.8, 1.5, 0.8), new THREE.MeshBasicMaterial({ color: 0xffc64a }));
  flame.position.y = 0.26;
  g.add(mark(wax), mark(flame));
  return g;
}
function makeLantern(l) {
  const g = new THREE.Group();
  g.name = `snowville:lantern${l.id}`;
  const wood = new THREE.MeshLambertMaterial({ color: COLORS.wood });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, l.h, 6), wood);
  post.position.y = l.h / 2;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.06), wood);
  arm.position.set(0.25, l.h - 0.1, 0);
  const glassMat = new THREE.MeshBasicMaterial({ color: LANTERN_LOOK.off });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.3), glassMat);
  glass.position.set(0.5, l.h - 0.4, 0);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 4).rotateY(Math.PI / 4), wood);
  cap.position.set(0.5, l.h - 0.09, 0);
  g.add(mark(post), mark(arm), mark(glass), mark(cap));
  g.userData.glass = glassMat;
  g.userData.halo = new THREE.Vector3(0.5, l.h - 0.4, 0);
  g.position.set(l.x, snowY(l.x, l.z), l.z);
  return g;
}

// Tilly's picture over her head: one emoji in a round white bubble.
function makeBubble() {
  const cv = globalThis.document?.createElement?.('canvas');
  const ok = !!cv?.getContext?.('2d');
  if (ok) cv.width = cv.height = 128;
  const tex = ok ? new THREE.CanvasTexture(cv) : null;
  if (tex) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: false });
  const sprite = mark(new THREE.Sprite(mat));
  sprite.name = 'snowville:tilly:bubble';
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
      c.fillText(S.BUBBLE_ICON[ICON_KEY[name] ?? 'heart'], 64, 64);
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

// createTilly(ctx) -> { promptAt, interact, credit, update, goalNow, goal, state, dispose, group }
// ctx: { scene, progression, audio, reducedMotion, send, colliders }
export function createTilly(ctx) {
  const { scene, reducedMotion = false } = ctx;
  const progression = ctx.progression ?? null;
  const audio = ctx.audio ?? null;
  const colliders = ctx.colliders ?? S.storyColliders();
  const CAND = S.allCandles(); // all three once stage B is in (milestone V5)
  const LANT = S.allLanterns();
  const rec = () => M.normalize(progression?.state?.snowville);

  let clock = 0;
  let disposed = false;
  let target = null; // what the action button would do now
  let carrying = null; // the candle in her mouth: 0 or null (NEVER saved)
  let meowed = false;
  let ringT = -100;
  let bubbleT = -100;
  let wobble = -100;
  let goalCur = null;
  let goalAt = -100;
  const told = new Set();
  const tilly = { x: S.TILLY.start.x, z: S.TILLY.start.z, yaw: Math.PI, moving: false, chasing: false };
  const lit = LANT.map((l) => (M.candleLit(progression?.state?.snowville, l.id) ? 1 : 0)); // each lantern's light, 0 to 1 (rises when lit)

  const group = makeTilly();
  const tex = dotTexture();
  const candles = CAND.map(() => makeCandle());
  const glints = CAND.map(() => { const s = glow(COLORS.glint, 0.8, 0.6, tex); s.name = 'snowville:candle:glint'; return s; });
  const lanterns = LANT.map(makeLantern);
  const halos = LANT.map((l) => { const h = glow(LANTERN_LOOK.on, 0, LANTERN_LOOK.halo, tex); h.name = `snowville:lantern${l.id}:halo`; h.visible = false; return h; });
  const bubble = makeBubble();
  const ring = sparkles(RING.points, 0.2, 0xfff0d0, 0.9, tex);
  ring.name = 'snowville:meowRing';
  const objects = [group, ...candles, ...glints, ...lanterns, ...halos, bubble.sprite, ring];
  for (const o of objects) scene.add(o);

  const candleMode = (i) => (M.candleLit(progression?.state?.snowville, i) ? 'given' : carrying === i ? 'carried' : 'home');
  const wanted = () => M.wantedCandle(progression?.state?.snowville);

  // The goal now: where the meow's ring rises and which picture Tilly shows. { g: { kind, candle?, icon }, x, z, y }
  function goalPoint() {
    const g = M.nextGoal(progression?.state?.snowville, carrying);
    const c = g.candle !== undefined ? CAND[g.candle] : null;
    const l = g.candle !== undefined ? LANT[g.candle] : null;
    if (g.kind === 'candle' && c) return { g, x: c.x, z: c.z, y: S.candleWorldY(c) };
    if (g.kind === 'deliver' && l) return { g, x: l.x + 0.5, z: l.z, y: snowY(l.x, l.z) + l.h * 0.6 };
    const sp = ST.b?.story?.spots?.[g.kind]; // the hearth, the village fir: stage B's
    if (sp) return { g, x: sp.x, z: sp.z, y: snowY(sp.x, sp.z) + (sp.up ?? 0) };
    return { g, x: tilly.x, z: tilly.z, y: snowY(tilly.x, tilly.z) };
  }
  const goal = () => (goalCur ?? (goalCur = goalPoint()));

  function commit(next) {
    const pr = progression;
    if (!pr?.state) return;
    pr.state.snowville = { ...(pr.state.snowville ?? {}), step: next.step, candles: next.candles };
    pr.addPoints?.(0); // the save's own "persist now": it adds nothing
  }
  function perform(ev, { remote = false } = {}) {
    const r = remote ? M.credit(progression?.state?.snowville, ev) : M.apply(progression?.state?.snowville, ev);
    if (!r.changed) return null;
    const before = rec().step;
    commit(r.snowville);
    goalCur = null;
    if (before < M.STEP.third && r.snowville.step >= M.STEP.third) progression?.recordSighting?.('sv7'); // the journal's candles page: all three are lit
    return r.effect;
  }
  function showBubble(kind) { bubble.show(kind); bubbleT = clock; }
  function callTilly() {
    const gp = goal();
    ringT = clock;
    showBubble(gp.g.icon);
    audio?.chime?.();
    const hintKey = 'hint-' + gp.g.kind + (gp.g.candle ?? '');
    if (!told.has(hintKey)) {
      told.add(hintKey);
      if (gp.g.kind === 'candle') say('snowville-candle-find' + (gp.g.candle || ''), gp.g.candle === 0 ? phrase('snowville.candle.find') : gp.g.candle === 1 ? phrase('snowville.pond.find') : phrase('snowville.hill.find'));
    }
  }
  const offMeow = bus.on('tip:did', (e) => { if (e && e.id === 'call') meowed = true; });

  // ---- the action button -------------------------------------------------------------------------------------------------------
  function decide(catPos) {
    if (disposed || !catPos) return null;
    const r = rec();
    if (r.step < M.STEP.met && dist(catPos, tilly) < S.TILLY.reach) return { kind: 'meet', line: phrase('snowville.tilly.prompt') };
    if (carrying !== null) {
      const l = LANT[carrying];
      if (l && dist(catPos, l) < l.reach) return { kind: 'give', candle: carrying, line: phrase('snowville.candle.give') };
    }
    if (carrying === null && wanted() >= 0) {
      const c = CAND[wanted()];
      if (c && dist(catPos, c) < c.reach) return { kind: 'pick', candle: c.id, line: phrase('snowville.candle.prompt') };
    }
    return null;
  }

  function placeCandle(i, t, catPos, session) {
    const c = CAND[i];
    const mode = candleMode(i);
    const g = candles[i];
    let x = c.x; let z = c.z; let y = S.candleWorldY(c) - S.CANDLE_Y + 0.02;
    if (mode === 'carried' && catPos) {
      const yaw = session?.cat?.rotation?.y ?? 0;
      x = catPos.x + Math.sin(yaw) * 0.5; z = catPos.z + Math.cos(yaw) * 0.5; y = catPos.y + 0.18;
    } else if (mode === 'given') { const l = LANT[i]; x = l.x + 0.5; z = l.z; y = snowY(l.x, l.z) + l.h - 0.6; }
    g.position.set(x, y, z);
    g.visible = mode !== 'given'; // a lit candle is inside its lantern
    const gl = glints[i];
    gl.visible = mode === 'home' && wanted() === i;
    if (gl.visible) {
      gl.position.set(x, y + 0.55, z);
      gl.material.opacity = reducedMotion ? 0.75 : 0.45 + 0.4 * Math.sin(t * 3.1 + i * 2);
    }
  }
  function placeLanterns(dt) {
    for (let i = 0; i < lanterns.length; i++) {
      const want = M.candleLit(progression?.state?.snowville, i) ? 1 : 0;
      lit[i] = reducedMotion ? want : lit[i] + Math.sign(want - lit[i]) * Math.min(Math.abs(want - lit[i]), dt / LANTERN_LOOK.rise);
      const k = smooth(lit[i]);
      lanterns[i].userData.glass.color.setHex(LANTERN_LOOK.off).lerp(_on.setHex(LANTERN_LOOK.on), k);
      const h = halos[i];
      h.visible = lit[i] > 0.001;
      h.position.copy(lanterns[i].userData.halo).add(lanterns[i].position);
      h.material.opacity = LANTERN_LOOK.haloHigh * k;
    }
  }
  const _on = new THREE.Color();

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
    const sx = catPos ? catPos.x : tilly.x; const sz = catPos ? catPos.z : tilly.z;
    const dx = gp.x - sx; const dz = gp.z - sz;
    const dd = Math.hypot(dx, dz) || 1;
    for (let i = 0; k < RING.points; i++, k++) { // a trail from her toward it
      const along = Math.min(dd, 1.6 + i * 1.3);
      const px = sx + (dx / dd) * along; const pz = sz + (dz / dd) * along;
      pos.setXYZ(k, px, snowY(px, pz) + 0.5 + (reducedMotion ? 0 : 0.15 * Math.sin(bob * 2 + i)), pz);
    }
    pos.needsUpdate = true;
  }

  return {
    get state() { return { clock, carrying, tilly: { ...tilly }, record: rec(), candleModes: CAND.map((c) => candleMode(c.id)), bubble: bubble.icon, lit: [...lit] }; },
    get tilly() { return tilly; },
    get group() { return group; },
    get candles() { return candles; },
    get lanterns() { return lanterns; },
    get halos() { return halos; },
    get bubble() { return bubble; },
    goalNow: goalPoint,
    goal,
    // a step of the story that is not a button here (stage B's: 'warm' by the hearth): the same effects and the same wire as her own; the show's own steps go with the show
    step(ev, remote = false) {
      if (disposed) return null;
      const effect = perform(ev, { remote });
      if (effect && !remote && ev.kind === 'warm') ctx.send?.(M.wire(ev));
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
          showBubble('lantern');
          say('snowville-tilly-met', phrase('snowville.tilly.met'));
        }
      } else if (t.kind === 'pick') {
        carrying = t.candle;
        audio?.chime?.();
        say('snowville-candle-got' + (t.candle || ''), t.candle === 0 ? phrase('snowville.candle.got') : t.candle === 1 ? phrase('snowville.pond.got') : phrase('snowville.hill.got'));
        showBubble('lantern');
      } else if (t.kind === 'give') {
        const id = t.candle;
        carrying = null;
        const effect = perform({ kind: 'light', candle: id });
        wobble = clock;
        if (effect) {
          ctx.send?.(M.wire({ kind: 'light', candle: id }));
          audio?.chime?.();
          say('snowville-lantern-lit', phrase('snowville.lantern.lit'));
          showBubble('heart');
        }
      }
      return t.kind;
    },
    // a step done by anyone in the room (an `sv-` event): the same effects as her own; the candle she was holding is gone from her mouth if it was the one just lit
    credit(ev) {
      const step = M.toStep(ev);
      if (!step || disposed) return null;
      const effect = perform(step, { remote: true });
      if (!effect) return null;
      if (carrying !== null && M.candleLit(progression?.state?.snowville, carrying)) carrying = null;
      wobble = clock;
      return effect;
    },
    update(dt, t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      const r = rec();
      const near = catPos ? dist(catPos, tilly) : 1e9;

      // Tilly: waits until met, then follows
      if (catPos) S.tillyStep(tilly, catPos, step, { follow: r.step >= M.STEP.met, colliders });
      else tilly.moving = false;
      if (catPos && !told.has('seen') && r.step < M.STEP.met && near < S.TILLY.seen) { told.add('seen'); showBubble('lantern'); say('snowville-tilly-hello', phrase('snowville.tilly.hello')); }
      const wob = clock - wobble < 1.2 && !reducedMotion ? Math.sin((clock - wobble) * 12) * 0.25 * (1 - (clock - wobble) / 1.2) : 0;
      const hop = tilly.moving && !reducedMotion ? 0.14 * Math.abs(Math.sin(clock * 7)) : 0;
      group.position.set(tilly.x, snowY(tilly.x, tilly.z) + hop, tilly.z);
      group.rotation.y = tilly.yaw + wob;
      group.visible = !catPos || near < 60;

      for (let i = 0; i < candles.length; i++) placeCandle(i, t, catPos, session);
      placeLanterns(step);

      // the meow: Tilly shows the next picture and the ring rises
      if (meowed) { meowed = false; callTilly(); }

      // the picture over her head
      const bk = clock - bubbleT;
      if (bk >= 0 && bk < RING.bubble) {
        bubble.sprite.visible = true;
        bubble.sprite.position.set(tilly.x, snowY(tilly.x, tilly.z) + 1.5 + (reducedMotion ? 0 : 0.05 * Math.sin(t * 4)), tilly.z);
        bubble.sprite.material.opacity = smooth(bk / 0.25) * (1 - smooth((bk - (RING.bubble - 0.6)) / 0.6));
      } else bubble.sprite.visible = false;

      placeRing(t, catPos);
      if (clock - goalAt > 0.5) { goalCur = null; goalAt = clock; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      offMeow?.();
      carrying = null; // a candle in her mouth when the walk ends is not kept: the next walk finds it at its own spot
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

// The action button's one arbiter for the place: Tilly first, then stage B's wing (Lantern Night), then the sled run's slot (answers null until the stage fills it, so later milestones add to the
// list and never fight over it).
export function createSnowvillePrompts(tilly, wing = null) {
  const slot = (get) => ({ promptAt: (p) => get()?.promptAt?.(p) ?? null, interact: () => get()?.interact?.() ?? null });
  return createPromptArbiter([tilly, slot(() => wing), slot(() => ST.c)]);
}
