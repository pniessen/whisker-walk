// =============================================================================
// THE FORGE JOB ON A WALK (milestone C3). createForgeJobLive(ctx) draws the three finds (a glow-cap, a cup of falls water, a rose shard) and the Crystal Circlet on the anvil, and runs the
// pure rules (world/crystalforgejob.js) for the action button. The job is open from Lumi's step 7.
//   * Interact beside an ingredient picks it up (in her mouth in front of her, like Lumi's spark stones; the job's own item, never the walk's mouth, so it never goes to the den).
//   * Interact beside the anvil puts it in the forge. The third one makes the Crystal Circlet at once: a short gentle glow (REDUCED MOTION: a still glow of the same length), a soft
//     chime, 40 paws once (AWARDS.crystalforge) and the circlet is hers (forge bit 3; the existing prize path owns it from the save; it is put on if her head is bare).
//   * A thing she is CARRYING is NEVER SAVED. However a walk ends (leaving, a teleport, a room, a reload) it is back at its own spot on the next walk; boarding the boat sets it down too.
//   * A partner bringing an ingredient (`wc-forge`) credits it here; the circlet made by anyone is made on both saves (each pays its own).
// This file's action button is one slot of the cave's prompt arbiter (after the boat, so a boat's "Hop in" always wins). It draws no random number and reads no clock (the walk's dt only).
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as J from './crystalforgejob.js';
import * as D from './crystalforgejobplan.js';
import { crystalY } from './crystalplan.js';
import { atWords } from './crystalguide.js';
import './crystalforgejobwords.js';

const SILVER = 0xd5dbe6;
const GEMS = Object.freeze([0xff6fa8, 0x62b8ff, 0xffc65a]); // rose, sky, gold: the circlet's three crystals
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const mark = (o) => { o.castShadow = false; o.receiveShadow = false; Object.assign(o.userData, { noMerge: true, noCast: true, noContactShadow: true }); return o; };
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
const itemGeometry = (key, hue) => {
  if (key === 'cap') return mergeGeometries([paint(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 6).translate(0, 0.06, 0), 0xe8dcc4), paint(new THREE.SphereGeometry(0.11, 8, 5).scale(1, 0.6, 1).translate(0, 0.14, 0), hue)]);
  if (key === 'water') return mergeGeometries([paint(new THREE.CylinderGeometry(0.08, 0.06, 0.12, 8, 1, true).translate(0, 0.06, 0), 0xe8f0ff), paint(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 8).translate(0, 0.1, 0), hue)]);
  return paint(new THREE.OctahedronGeometry(0.13, 0).scale(0.6, 1.3, 0.6).translate(0, 0.17, 0), hue);
};
// the Crystal Circlet as it lies on the anvil: a thin silver ring with three small crystals on its front (one mesh)
export function circletGeometry() {
  const ring = paint(new THREE.TorusGeometry(0.15, 0.012, 5, 18).rotateX(Math.PI / 2), SILVER);
  const gems = GEMS.map((hex, i) => paint(new THREE.OctahedronGeometry(i === 1 ? 0.03 : 0.022, 0).scale(0.8, 1.3, 0.8).translate((i - 1) * 0.07, 0.025 + (i === 1 ? 0.01 : 0), -0.14), hex));
  return mergeGeometries([ring, ...gems]);
}
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

// createForgeJobLive(ctx) -> { promptAt, interact, credit, goalFor, update, state, dispose }
// ctx: { scene, progression, audio, reducedMotion, log, send, isRiding (() => boolean), errand }
export function createForgeJobLive(ctx) {
  const { scene, reducedMotion = false, progression = null, audio = null, log = null } = ctx;
  const rec = () => progression?.state?.crystal;
  let clock = 0;
  let disposed = false;
  let carrying = null; // 0, 1, 2 or null (NEVER saved)
  let target = null;
  let makeAt = -100;
  const home = D.ITEMS.map((s) => ({ x: s.x, z: s.z }));

  const tex = softTexture();
  const meshes = D.ITEMS.map((s) => mark(new THREE.Mesh(itemGeometry(s.key, s.hue), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }))));
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const halos = mark(new THREE.Points(haloGeo, new THREE.PointsMaterial({ map: tex, alphaTest: 0.02, size: 0.9, sizeAttenuation: true, color: 0xfff2c0, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, fog: true })));
  halos.frustumCulled = false;
  const circlet = mark(new THREE.Mesh(circletGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  const glow = mark(new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xfff0c8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true })));
  glow.scale.setScalar(2.4);
  glow.visible = false;
  const objects = [...meshes, halos, circlet, glow];
  meshes.forEach((m, i) => { m.name = `crystal:forge:item${i}`; });
  circlet.name = 'crystal:forge:circlet';
  for (const o of objects) scene.add(o);

  function commit(forge) {
    const pr = progression;
    if (!pr?.state) return;
    pr.state.crystal = { ...(pr.state.crystal ?? {}), forge };
    pr.addPoints?.(0); // the save's own "persist now": it adds nothing
  }
  function perform(step, remote = false) {
    const r = remote ? J.credit(rec(), step) : J.apply(rec(), step);
    if (!r.changed) return null;
    commit(r.crystal.forge);
    return r.effect;
  }
  // the circlet is made: the glow, the paws once, the prize on her head
  function celebrate() {
    makeAt = clock;
    const st = progression?.state;
    if (st?.unlocked?.accessories && !st.unlocked.accessories.includes(D.CIRCLET_ID)) st.unlocked.accessories.push(D.CIRCLET_ID);
    if (st?.equipped && st.equipped.head == null) st.equipped.head = D.CIRCLET_ID;
    if (log) log.awardOnce('crystalforge', 'crystal-forge', phrase('crystal.wc.forge.pay'));
    audio?.chime?.();
    say('crystal-forge-made', phrase('crystal.wc.forge.made'));
  }
  const GOT = [() => phrase('crystal.wc.forge.got.cap'), () => phrase('crystal.wc.forge.got.water'), () => phrase('crystal.wc.forge.got.shard')];
  const PICK = [() => phrase('crystal.wc.forge.pick.cap'), () => phrase('crystal.wc.forge.pick.water'), () => phrase('crystal.wc.forge.pick.shard')];
  const GUIDE = [() => phrase('crystal.wc.guide.cap'), () => phrase('crystal.wc.guide.water'), () => phrase('crystal.wc.guide.shard')];

  function decide(catPos) {
    if (disposed || !catPos || !J.isOpen(rec())) return null;
    const r = rec();
    if (J.made(r)) return null;
    if (J.ready(r) && dist(catPos, D.ANVIL_AT) < D.FORGE_REACH) return { kind: 'make', line: phrase('crystal.wc.forge.make') };
    if (carrying !== null) return dist(catPos, D.ANVIL_AT) < D.FORGE_REACH ? { kind: 'give', item: carrying, line: phrase('crystal.wc.forge.give') } : null;
    for (const s of D.ITEMS) if (J.canPick(r, s.id, carrying) && dist(catPos, s) < s.reach) return { kind: 'pick', item: s.id, line: PICK[s.id]() };
    return null;
  }
  function finishBring(item) {
    const effect = perform({ kind: 'bring', item });
    if (!effect) return;
    say('crystal-forge-in', phrase('crystal.wc.forge.in'));
    audio?.chime?.();
    if (J.ready(rec())) { perform({ kind: 'make' }); celebrate(); ctx.send?.(J.wire({ kind: 'make' })); } else ctx.send?.(J.wire({ kind: 'bring', item }));
  }

  // the goal for the guide's line and arrow: { g: { kind: 'forge', line, chip, icon }, x, z, y } or null (nothing to do)
  function goalNow() {
    const r = rec();
    const g = J.nextGoal(r, carrying);
    if (g.kind === 'rest') return null;
    const at = (p, line, chip) => ({ g: { kind: 'forge', icon: 'spark', line: line.replace('{at}', atWords(p.x, p.z)), chip }, x: p.x, z: p.z, y: crystalY(p.x, p.z) + 0.5 });
    if (g.kind === 'make') return at(D.ANVIL_AT, phrase('crystal.wc.guide.make'), phrase('crystal.wc.guide.chip.give'));
    if (g.kind === 'give') return at(D.ANVIL_AT, phrase('crystal.wc.guide.give'), phrase('crystal.wc.guide.chip.give'));
    const s = D.ITEMS[g.item];
    return at(s, GUIDE[s.id](), phrase('crystal.wc.guide.chip.find'));
  }

  function place(t, catPos, session) {
    const r = rec();
    const open = J.isOpen(r);
    const hp = halos.geometry.attributes.position;
    for (let i = 0; i < 3; i++) {
      const m = meshes[i];
      const inForge = J.hasItem(r, i);
      const isCarried = carrying === i && !!catPos;
      m.visible = open && !inForge && (isCarried || carrying !== i);
      let x = home[i].x, z = home[i].z, y = crystalY(x, z) + 0.12 + (reducedMotion ? 0 : 0.05 * Math.sin(t * 1.6 + i));
      let sc = 1;
      if (isCarried) { const yaw = session?.cat?.rotation?.y ?? 0; x = catPos.x + Math.sin(yaw) * 0.5; z = catPos.z + Math.cos(yaw) * 0.5; y = catPos.y + 0.2; sc = 0.8; }
      m.position.set(x, y, z);
      m.scale.setScalar(sc);
      m.rotation.y = reducedMotion ? 0.6 : t * 0.5 + i;
      const showHalo = m.visible && !isCarried;
      hp.setXYZ(i, showHalo ? x : 0, showHalo ? y + 0.15 : -50, showHalo ? z : 0);
    }
    hp.needsUpdate = true;
    halos.visible = open && !J.made(r);
    halos.material.opacity = reducedMotion ? 0.6 : 0.45 + 0.2 * Math.sin(t * 2.3);
    circlet.visible = open && J.made(r);
    const k = clock - makeAt;
    const gl = k >= 0 && k < D.MAKE_SECS;
    circlet.position.set(D.ANVIL_AT.x, crystalY(D.ANVIL_AT.x, D.ANVIL_AT.z) + 0.78 + (reducedMotion || !gl ? 0 : 0.12 * smooth(k / D.MAKE_SECS)), D.ANVIL_AT.z);
    circlet.rotation.y = reducedMotion ? 0.4 : 0.4 + (gl ? k * 1.2 : 0);
    glow.visible = gl;
    if (gl) {
      glow.position.set(D.ANVIL_AT.x, crystalY(D.ANVIL_AT.x, D.ANVIL_AT.z) + 0.85, D.ANVIL_AT.z);
      glow.material.opacity = reducedMotion ? 0.7 : 0.8 * Math.sin(Math.PI * smooth(k / D.MAKE_SECS));
    }
  }

  return {
    get state() { return { clock, carrying, record: rec(), goal: J.nextGoal(rec(), carrying), glowing: clock - makeAt < D.MAKE_SECS && makeAt > -50 }; },
    get meshes() { return meshes; },
    get circlet() { return circlet; },
    get glow() { return glow; },
    goalNow,
    // Lumi's own goal wins; the forge's shows when hers is "rest" and no errand is waiting
    goalFor(lumiGoal) {
      if (lumiGoal?.g && lumiGoal.g.kind !== 'rest') return lumiGoal;
      const e = ctx.errand?.state;
      if (e?.eligible && !e.done) return lumiGoal;
      return goalNow() ?? lumiGoal;
    },
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'pick') {
        carrying = t.item;
        audio?.chime?.();
        say(`crystal-forge-got-${t.item}`, GOT[t.item]());
      } else if (t.kind === 'give') {
        const item = carrying;
        carrying = null;
        finishBring(item);
      } else if (t.kind === 'make') {
        if (perform({ kind: 'make' })) { celebrate(); ctx.send?.(J.wire({ kind: 'make' })); }
      }
      return t.kind;
    },
    // a step done by anyone in the room (a `wc-forge` event); anything else is nothing
    credit(ev) {
      const step = J.toStep(ev);
      if (!step || disposed) return null;
      const effect = perform(step, true);
      if (!effect) return null;
      if (carrying !== null && J.hasItem(rec(), carrying)) carrying = null;
      if (effect === 'circlet') celebrate();
      return effect;
    },
    update(dt, t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      clock += dt > 0 ? dt : 0;
      if (carrying !== null && ctx.isRiding?.()) { carrying = null; say('crystal-forge-setdown', phrase('crystal.wc.forge.setdown')); } // boarding sets it down: it is back at its own spot
      place(t, catPos, session);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      carrying = null; // a thing in her mouth when the walk ends is not kept: the next walk finds it at its own spot
      tex?.dispose();
      for (const o of objects) { scene.remove(o); o.geometry?.dispose?.(); o.material?.dispose?.(); }
    },
  };
}
