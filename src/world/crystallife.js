// =============================================================================
// LUMI AND THE THREE SPARK STONES ON A WALK (milestone C2: chapter one; milestone C5: the sky and gold stones too). The baby glow-worm, the three spark stones, the
// three great crystals' lights and the meow's ring of sparkles, all drawn here and run by the pure rules (src/crystalmission.js for the steps, world/crystalstory.js for the places and her moves).
//   * LUMI waits just inside the entrance, her glow faint; the Interact button says hello (step 1). Then she follows at a shy distance and waits. Her talk is a
//     picture over her head (a spark, a heart), never text; the words below are only the toast line beside it.
//   * THE ROSE SPARK STONE lies behind a crystal cluster in the Rose hall, under a glint. Interact picks it up (in her mouth in front of her, like the Reef's
//     shells; the story's own item, never the walk's mouth, so it never goes to the den); Interact beside the great Rose crystal sets it there. A carried stone
//     is NEVER SAVED: however a walk ends (leaving, a teleport, a room, a reload) the next walk finds it at its own spot, and nothing is lost.
//   * THE ROSE CRYSTAL LIGHTS: a soft halo, the cave's one light turned up, one soft note (silent when muted), and Lumi's tail glows pink.
//   * THE MEOW calls her: she shows the next goal's picture and a ring of sparkles rises where it is (a column over the spot, a trail from her). No fail.
// Draws no random number and reads no clock of its own (the walk's dt only).
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from '../crystalmission.js';
import * as S from './crystalstory.js';
import { crystalY, HUE_COLOURS } from './crystalplan.js';

export const RING = Object.freeze({ secs: 6, bubble: 4, points: 30 }); // how long the meow's ring and the picture stay
export const GLINT = Object.freeze({ color: 0xfff2c0, size: 0.6 });
export const HALO = Object.freeze({ size: 9, high: 0.55, rise: 1.6, y: 2.4, light: 1.6 }); // a great crystal's glow once lit
const COLORS = Object.freeze({ body: 0xe4d6ee, eye: 0x2c2234, faint: 0x9a8fa6, bright: 0xffe7a0, pink: 0xff6fa8 });
const STONE_COLOURS = Object.freeze([0xff6fa8, 0x62b8ff, 0xffc65a]); // rose, sky blue, gold: the halo, the light and Lumi's tail after that stone
const NOTES = Object.freeze([[392, 587.3], [440, 659.3], [523.3, 784]]); // each crystal's soft note and its fifth
const PASSAGE_DELAY = 1.6; // seconds after the gold stone is set before the passages light
const ICON_BY_KIND = Object.freeze({ spark: 'spark', heart: 'heart' });
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
// ('greenhousenote' is the whole-sentence, no-points toast type the start-up HUD already knows.)

function softTexture() {
  const cv = globalThis.document?.createElement?.('canvas');
  const g = cv?.getContext?.('2d');
  if (!g) return null;
  cv.width = cv.height = 64;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const mark = (o) => { o.castShadow = false; o.receiveShadow = false; Object.assign(o.userData, { noMerge: true, noCast: true, noContactShadow: true }); return o; };

// ---- Lumi: a soft little glow-worm. Head (with its big friendly eyes, tiny highlights and two antennae, all in ONE vertex-coloured mesh), three body segments that
// shrink and bob in a gentle wave, and her glowing tail. Six draws. The tail takes the lit crystals' colours (placeGlow). ----------------------------------------
const SEGS = Object.freeze([[0.115, 0.08], [0.105, -0.045], [0.093, -0.165]]); // [radius, z] of the three body segments
const paintGeo = (geo, hex) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  return g;
};
function headGeometry() {
  const parts = [paintGeo(new THREE.SphereGeometry(0.16, 10, 8).scale(1, 0.95, 1), COLORS.body)];
  for (const s of [-1, 1]) {
    parts.push(paintGeo(new THREE.SphereGeometry(0.058, 8, 6).translate(s * 0.07, 0.04, 0.115), 0xffffff)); // a big round eye
    parts.push(paintGeo(new THREE.SphereGeometry(0.036, 7, 5).translate(s * 0.07, 0.035, 0.158), COLORS.eye)); // its pupil
    parts.push(paintGeo(new THREE.SphereGeometry(0.012, 4, 3).translate(s * 0.06, 0.056, 0.185), 0xffffff)); // the little shine
    parts.push(paintGeo(new THREE.CylinderGeometry(0.008, 0.012, 0.15, 4).rotateZ(-s * 0.35).translate(s * 0.075, 0.2, 0.05), COLORS.faint)); // an antenna
    parts.push(paintGeo(new THREE.SphereGeometry(0.024, 5, 4).translate(s * 0.115, 0.265, 0.05), COLORS.bright)); // its glowing tip
  }
  return mergeGeometries(parts);
}
function makeLumi() {
  const g = new THREE.Group();
  g.name = 'crystal:lumi';
  const bodyMat = new THREE.MeshBasicMaterial({ color: COLORS.body });
  const headMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const tailMat = new THREE.MeshBasicMaterial({ color: COLORS.faint });
  const head = new THREE.Mesh(headGeometry(), headMat);
  head.position.set(0, 0.16, 0.24);
  g.add(mark(head));
  const segs = SEGS.map(([r, z]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), bodyMat); m.position.set(0, r, z); g.add(mark(m)); return m; });
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.125, 8, 6).scale(1, 0.95, 1.15), tailMat);
  tail.position.set(0, 0.12, -0.3);
  g.add(mark(tail));
  g.userData.tail = tail;
  g.userData.head = head;
  g.userData.segs = segs;
  g.userData.mats = [bodyMat, headMat, tailMat];
  g.scale.setScalar(1.5);
  return g;
}
// a soft bob: a wave runs down her body (flat in reduced motion)
function bobLumi(g, t, moving, still) {
  const amp = still ? 0 : moving ? 0.028 : 0.012;
  const sp = moving ? 9 : 2.2;
  const { head, segs, tail } = { head: g.userData.head, segs: g.userData.segs, tail: g.userData.tail };
  head.position.y = 0.16 + amp * Math.sin(t * sp);
  segs.forEach((m, i) => { m.position.y = SEGS[i][0] + amp * Math.sin(t * sp - (i + 1) * 0.9); });
  tail.position.y = 0.12 + amp * Math.sin(t * sp - 4 * 0.9);
}

// ---- the stone: a little faceted gem ----------------------------------------------------------------------------------------
function makeStone(hue) {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(HUE_COLOURS[hue]).lerp(new THREE.Color(0xffffff), 0.3) }));
  m.scale.set(0.8, 1.15, 0.8);
  m.name = `crystal:stone:${hue}`;
  return mark(m);
}

// Lumi's picture over her head: one emoji in a round white bubble.
function makeBubble() {
  const cv = globalThis.document?.createElement?.('canvas');
  const ok = !!cv?.getContext?.('2d');
  if (ok) cv.width = cv.height = 128;
  const tex = ok ? new THREE.CanvasTexture(cv) : null;
  if (tex) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: false });
  const sprite = mark(new THREE.Sprite(mat));
  sprite.name = 'crystal:lumi:bubble';
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
      c.fillText(S.BUBBLE_ICON[ICON_BY_KIND[name] ?? 'heart'], 64, 64);
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

// One soft note, quiet, on the walk's audio context. Asks for nothing when muted (no context is requested and no node made).
export function humNote(audio, stone = 0, ratio = 1, delay = 0) {
  if (!audio || typeof audio.getContext !== 'function' || audio.isMuted?.()) return false;
  const ac = audio.getContext();
  if (!ac) return false;
  const dest = audio.getMaster?.() ?? ac.destination;
  const now = ac.currentTime + Math.max(0, delay); // (beauty round 4: a note may start a moment later, for a rising chord)
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.03, now + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
  g.connect(dest);
  // beauty round 3: a soft cave ECHO (two quieter, later repeats off one delay line), only where the context has a delay node
  if (typeof ac.createDelay === 'function') {
    try {
      const dl = ac.createDelay(1); dl.delayTime.value = 0.34;
      const fb = ac.createGain(); fb.gain.value = 0.38;
      const wet = ac.createGain(); wet.gain.value = 0.45;
      g.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(dest);
    } catch { /* an echo is a nicety; the note still sings */ }
  }
  for (const f0 of NOTES[stone] ?? NOTES[0]) { // the crystal's note and its fifth (ratio: a crystal's own colour tunes it a little)
    const f = f0 * ratio;
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(g);
    o.start(now);
    o.stop(now + 2.5);
  }
  return true;
}

// createLumi(ctx) -> { promptAt, interact, credit, update, goal, state, dispose }
// ctx: { scene, progression, audio, reducedMotion, colliders }
export function createLumi(ctx) {
  const { scene, reducedMotion = false } = ctx;
  const progression = ctx.progression ?? null;
  const audio = ctx.audio ?? null;
  const colliders = ctx.colliders ?? S.storyColliders();
  const rec = () => M.normalize(progression?.state?.crystal);

  let clock = 0;
  let disposed = false;
  let target = null; // what the action button would do now
  let carrying = null; // the stone in her mouth: 0 or null (NEVER saved)
  let meowed = false;
  let ringT = -100;
  let bubbleT = -100;
  let wobble = -100;
  const glows = S.CRYSTALS.map((c, i) => (M.stoneBrought(progression?.state?.crystal, i) ? 1 : 0)); // each great crystal's light, 0 to 1 (rises when lit)
  let litAt = -1; // when the passages light (after the gold stone is set)
  let override = null; // the light show's hold on the cave's one light: { x, y, z, color, intensity } or null
  let goalCur = null;
  let goalAt = -100;
  const told = new Set();
  const lumi = { x: S.LUMI.start.x, z: S.LUMI.start.z, yaw: Math.PI, moving: false, chasing: false };

  const group = makeLumi();
  const stones = S.STONES.map((s) => makeStone(s.hue));
  const tex = softTexture();
  const glints = S.STONES.map((s, i) => {
    const sp = mark(new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: GLINT.color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: true })));
    sp.name = `crystal:glint${i}`;
    sp.scale.setScalar(GLINT.size);
    return sp;
  });
  const tailHalo = mark(new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: COLORS.bright, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: true })));
  tailHalo.name = 'crystal:lumi:halo';
  tailHalo.scale.setScalar(0.9);
  const halos = S.CRYSTALS.map((c, i) => {
    const h = mark(new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: STONE_COLOURS[i], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true })));
    h.name = i === 0 ? 'crystal:rose:halo' : `crystal:${c.id}:halo`;
    h.scale.setScalar(HALO.size);
    h.visible = false;
    return h;
  });
  const bubble = makeBubble();
  const ring = sparkles(RING.points, 0.2, 0xffe6ff, 0.9, tex);
  ring.name = 'crystal:meowRing';
  const light = scene.getObjectByName?.('crystal:light') ?? null;
  const lightHome = light ? { x: light.position.x, y: light.position.y, z: light.position.z, color: light.color.getHex() } : null;
  const objects = [group, ...stones, ...glints, tailHalo, ...halos, bubble.sprite, ring];
  const lightNow = { x: lightHome?.x ?? 0, y: lightHome?.y ?? 0, z: lightHome?.z ?? 0, color: new THREE.Color(lightHome?.color ?? 0xffc890), at: 0 };
  for (const o of objects) scene.add(o);

  const stoneMode = (i) => (M.stoneBrought(progression?.state?.crystal, i) ? 'given' : carrying === i ? 'carried' : 'home');
  const wanted = () => M.wantedStone(progression?.state?.crystal);

  // The goal now: where the meow's ring rises and which picture Lumi shows. { g: { kind, stone?, icon }, x, z, y }
  function goalPoint() {
    const g = M.nextGoal(progression?.state?.crystal, carrying);
    const s = g.stone !== undefined ? S.STONES[g.stone] : null;
    if (g.kind === 'stone' && s) return { g, x: s.x, z: s.z, y: S.stoneWorldY(s) };
    if (g.kind === 'deliver' && S.CRYSTALS[g.stone]) { const c = S.CRYSTALS[g.stone]; return { g, x: c.x, z: c.z, y: crystalY(c.x, c.z) + 0.6 }; }
    if (g.kind === 'heart') return { g, x: S.HEART.x, z: S.HEART.z, y: crystalY(S.HEART.x, S.HEART.z) + 0.6 };
    return { g: g.kind === 'stone' ? { ...g, icon: 'heart' } : g, x: lumi.x, z: lumi.z, y: crystalY(lumi.x, lumi.z) };
  }
  const goal = () => (goalCur ?? (goalCur = goalPoint()));

  function commit(next) {
    const pr = progression;
    if (!pr?.state) return;
    pr.state.crystal = { ...(pr.state.crystal ?? {}), step: next.step, sparks: next.sparks };
    pr.addPoints?.(0); // the save's own "persist now": it adds nothing
  }
  function perform(ev, { remote = false } = {}) {
    const r = remote ? M.credit(progression?.state?.crystal, ev) : M.apply(progression?.state?.crystal, ev);
    if (!r.changed) return null;
    commit(r.crystal);
    goalCur = null;
    return r.effect;
  }
  function showBubble(kind) { bubble.show(kind); bubbleT = clock; }
  function callLumi() {
    const gp = goal();
    ringT = clock;
    showBubble(gp.g.icon);
    audio?.chime?.();
    const hintKey = 'hint-' + gp.g.kind + (gp.g.stone ?? '');
    if (!told.has(hintKey)) {
      told.add(hintKey);
      if (gp.g.kind === 'stone') {
        if (gp.g.stone === 1) say('crystal-sky-find', phrase('crystal.sky.find'));
        else if (gp.g.stone === 2) say('crystal-gold-find', phrase('crystal.gold.find'));
        else say('crystal-stone-find', phrase('crystal.stone.find'));
      }
    }
  }
  const offMeow = bus.on('tip:did', (e) => { if (e && e.id === 'call') meowed = true; });

  // ---- the action button -------------------------------------------------------------------------------------------------------
  function decide(catPos) {
    if (disposed || !catPos) return null;
    const r = rec();
    if (r.step < M.STEP.met && dist(catPos, lumi) < S.LUMI.reach) return { kind: 'meet', line: phrase('crystal.lumi.prompt') };
    if (carrying !== null) {
      const c = S.CRYSTALS[carrying];
      if (c && dist(catPos, c) < c.reach) return { kind: 'give', stone: carrying, line: phrase('crystal.stone.give') };
    }
    if (carrying === null && wanted() >= 0) {
      const s = S.STONES[wanted()];
      if (s && dist(catPos, s) < s.reach) return { kind: 'pick', stone: s.id, line: phrase('crystal.stone.prompt') };
    }
    return null;
  }

  // ---- placing things each frame ---------------------------------------------------------------------------------------------
  function placeStone(i, t, catPos, session) {
    const s = S.STONES[i];
    const mode = stoneMode(i);
    const g = stones[i];
    let x = s.x; let z = s.z; let y = S.stoneWorldY(s);
    let scale = 1;
    if (mode === 'carried' && catPos) {
      const yaw = session?.cat?.rotation?.y ?? 0;
      x = catPos.x + Math.sin(yaw) * 0.5; z = catPos.z + Math.cos(yaw) * 0.5; y = catPos.y + 0.2;
      scale = 0.8;
    } else if (mode === 'given') {
      const c = S.CRYSTALS[i];
      x = c.x + 0.9; z = c.z + 1.1; y = crystalY(x, z) + 0.25; // set at the crystal's foot
    } else if (!reducedMotion) y += 0.06 * Math.sin(t * 1.6 + i);
    g.position.set(x, y, z);
    g.rotation.y = mode === 'home' ? (reducedMotion ? 0.6 : t * 0.5 + i) : 0.6;
    g.scale.set(0.8 * scale, 1.15 * scale, 0.8 * scale);
    const gl = glints[i];
    gl.visible = mode === 'home' && wanted() === i;
    if (gl.visible) {
      gl.position.set(x, y + 0.5, z);
      gl.material.opacity = reducedMotion ? 0.75 : 0.45 + 0.4 * Math.sin(t * 3.1 + i * 2);
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
    const sx = catPos ? catPos.x : lumi.x; const sz = catPos ? catPos.z : lumi.z;
    const dx = gp.x - sx; const dz = gp.z - sz;
    const dd = Math.hypot(dx, dz) || 1;
    for (let i = 0; k < RING.points; i++, k++) { // a trail from her toward it
      const along = Math.min(dd, 1.6 + i * 1.3);
      pos.setXYZ(k, sx + (dx / dd) * along, crystalY(sx + (dx / dd) * along, sz + (dz / dd) * along) + 0.5 + (reducedMotion ? 0 : 0.15 * Math.sin(bob * 2 + i)), sz + (dz / dd) * along);
    }
    pos.needsUpdate = true;
  }

  // The great crystals' glow, the cave's one light and Lumi's tail, from the saved step: faint at first, brighter once met, then the colour of the last stone set.
  const tailColour = new THREE.Color();
  const _want = new THREE.Color();
  const _mix = new THREE.Color();
  const _bright = new THREE.Color();
  const greats = scene.getObjectByName?.('crystal:greats')?.material?.userData?.great ?? null;
  function placeGlow(step, dt, catPos) {
    const lit = step >= M.STEP.rose;
    const base = step >= M.STEP.met ? 0.5 : 0;
    tailColour.set(COLORS.faint).lerp(_bright.set(COLORS.bright), base);
    if (lit) { // the lit crystals' colours, blended (and her own warm white once every passage is lit)
      let w = 0; _want.setRGB(0, 0, 0);
      for (let i = 0; i < 3; i++) { const q = smooth(glows[i]); _want.r += _mix.set(STONE_COLOURS[i]).r * q; _want.g += _mix.g * q; _want.b += _mix.b * q; w += q; }
      if (w > 0) tailColour.setRGB(_want.r / w, _want.g / w, _want.b / w);
      if (step >= M.STEP.lit) tailColour.set(0xfff2d0);
    }
    group.userData.tail.material.color.copy(tailColour);
    tailHalo.material.color.copy(tailColour);
    const pulse = reducedMotion ? 0 : 0.08 * Math.sin(clock * 2.2);
    tailHalo.material.opacity = (lit ? 0.75 : step >= M.STEP.met ? 0.4 : 0.22) + pulse;
    tailHalo.scale.setScalar(lit ? 1.5 : 0.9);
    let near = -1; let nearD = Infinity;
    for (let i = 0; i < halos.length; i++) {
      const c = S.CRYSTALS[i];
      const want = M.stoneBrought(progression?.state?.crystal, i) ? 1 : 0;
      glows[i] = reducedMotion ? want : glows[i] + Math.sign(want - glows[i]) * Math.min(Math.abs(want - glows[i]), dt / HALO.rise);
      const h = halos[i];
      h.visible = glows[i] > 0.001;
      h.position.set(c.x, crystalY(c.x, c.z) + HALO.y, c.z);
      h.material.opacity = HALO.high * smooth(glows[i]);
      if (want) { const d = catPos ? dist(catPos, c) : i; if (d < nearD) { nearD = d; near = i; } }
    }
    if (greats) { greats.uLit.value.set(smooth(glows[0]), smooth(glows[1]), smooth(glows[2])); greats.uPulse.value = reducedMotion ? 0 : Math.sin(clock * 0.9); }
    if (!light) return;
    // the one light stands by the lit crystal nearest the cat (or the light show's own hold), and eases from place to place
    let tx = lightHome.x; let ty = lightHome.y; let tz = lightHome.z; let ti = 0;
    _want.setHex(lightHome.color);
    if (override) { tx = override.x; ty = override.y; tz = override.z; ti = override.intensity; _want.setHex(override.color); }
    else if (near >= 0) {
      const c = S.CRYSTALS[near];
      tx = c.x + 1.5; ty = crystalY(c.x, c.z) + 3.4; tz = c.z + 2.5; ti = HALO.light * smooth(glows[near]);
      _want.setHex(STONE_COLOURS[near]);
    }
    const k = reducedMotion || lightNow.at === 0 ? 1 : Math.min(1, dt * 3);
    lightNow.at = 1;
    lightNow.x += (tx - lightNow.x) * k; lightNow.y += (ty - lightNow.y) * k; lightNow.z += (tz - lightNow.z) * k;
    lightNow.color.lerp(_want, k);
    light.position.set(lightNow.x, lightNow.y, lightNow.z);
    light.color.copy(lightNow.color);
    light.intensity = ti;
  }

  return {
    get state() { return { clock, carrying, lumi: { ...lumi }, record: rec(), stoneModes: S.STONES.map((s) => stoneMode(s.id)), bubble: bubble.icon, glow: glows[0], glows: [...glows] }; },
    get halos() { return halos; },
    get glows() { return glows; },
    // the light show's hold on the cave's one light (null lets go)
    holdLight(o) { override = o; },
    get lumi() { return lumi; },
    get group() { return group; },
    get stones() { return stones; },
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
          audio?.chime?.();
          showBubble('spark');
          say('crystal-lumi-met', phrase('crystal.lumi.met'));
        }
      } else if (t.kind === 'pick') {
        carrying = t.stone;
        audio?.chime?.();
        if (t.stone === 1) say('crystal-sky-got', phrase('crystal.sky.got'));
        else if (t.stone === 2) say('crystal-gold-got', phrase('crystal.gold.got'));
        else say('crystal-stone-got', phrase('crystal.stone.got'));
        showBubble('heart');
      } else if (t.kind === 'give') {
        const id = t.stone;
        carrying = null;
        const effect = perform({ kind: 'bring', stone: id });
        wobble = clock;
        if (effect === 'rose' || effect === 'sky' || effect === 'gold') {
          humNote(audio, id);
          if (effect === 'rose') say('crystal-rose-lit', phrase('crystal.rose.lit'));
          else if (effect === 'sky') say('crystal-sky-lit', phrase('crystal.sky.lit'));
          else say('crystal-gold-lit', phrase('crystal.gold.lit'));
          showBubble('heart');
        }
      }
      return t.kind;
    },
    // one step of the story taken by the wing's life (the Heart, the light show): the same machine and the same save as her own, so there is one of each
    step(ev, remote = false) { return perform(ev, { remote }); },
    // a step done by anyone in the room: the same effects as her own; the stone she was holding is gone from her mouth if it was the one just brought
    credit(ev) {
      const effect = perform(ev, { remote: true });
      if (!effect) return null;
      if (carrying !== null && M.stoneBrought(progression?.state?.crystal, carrying)) carrying = null;
      wobble = clock;
      return effect;
    },
    update(dt, t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      const r = rec();
      const near = catPos ? dist(catPos, lumi) : 1e9;

      // Lumi: waits until met, then follows
      if (catPos) S.lumiStep(lumi, catPos, step, { follow: r.step >= M.STEP.met, colliders });
      else lumi.moving = false;
      if (catPos && !told.has('seen') && r.step < M.STEP.met && near < S.LUMI.seen) { told.add('seen'); showBubble('spark'); say('crystal-lumi-hello', phrase('crystal.lumi.hello')); }
      const wob = clock - wobble < 1.2 && !reducedMotion ? Math.sin((clock - wobble) * 12) * 0.25 * (1 - (clock - wobble) / 1.2) : 0;
      const bobY = lumi.moving && !reducedMotion ? 0.025 * Math.abs(Math.sin(clock * 9)) : 0;
      group.position.set(lumi.x, crystalY(lumi.x, lumi.z) + bobY, lumi.z);
      group.rotation.y = lumi.yaw + wob;
      bobLumi(group, clock, lumi.moving, reducedMotion);
      group.visible = !catPos || near < 60;
      tailHalo.visible = group.visible;
      tailHalo.position.set(lumi.x - Math.sin(lumi.yaw) * 0.5, crystalY(lumi.x, lumi.z) + 0.25 + bobY, lumi.z - Math.cos(lumi.yaw) * 0.5);

      for (let i = 0; i < stones.length; i++) placeStone(i, t, catPos, session);
      placeGlow(r.step, step, catPos);
      // all three stones set: a moment later the passages light (taken once, saved as step 5)
      if (r.step === M.STEP.gold) {
        if (litAt < 0) litAt = clock + PASSAGE_DELAY;
        else if (clock >= litAt && perform({ kind: 'lit' })) { audio?.chime?.(); say('crystal-passages-lit', phrase('crystal.passages.lit')); showBubble('spark'); }
      }

      // the meow: Lumi shows the next picture and the ring rises
      if (meowed) { meowed = false; callLumi(); }

      // the picture over her head
      const bk = clock - bubbleT;
      if (bk >= 0 && bk < RING.bubble) {
        bubble.sprite.visible = true;
        bubble.sprite.position.set(lumi.x, crystalY(lumi.x, lumi.z) + 1.1 + (reducedMotion ? 0 : 0.05 * Math.sin(t * 4)), lumi.z);
        bubble.sprite.material.opacity = smooth(bk / 0.25) * (1 - smooth((bk - (RING.bubble - 0.6)) / 0.6));
      } else bubble.sprite.visible = false;

      placeRing(t, catPos);
      if (clock - goalAt > 0.5) { goalCur = null; goalAt = clock; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      offMeow?.();
      carrying = null; // a stone in her mouth when the walk ends is not kept: the next walk finds it at its own spot
      if (light) { light.intensity = 0; light.color.setHex(lightHome.color); light.position.set(lightHome.x, lightHome.y, lightHome.z); }
      bubble.dispose();
      tex?.dispose();
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
