// =============================================================================
// THE LAVA TUBE AND THE DEEP CELL ON A WALK (milestone 8, wing D). Made once a walk by world/moonlife.js; update(dt, t, catPos, camera, session) every frame.
//   * THE ZONE: the cave's detail (the floor, the crystals, the pedestal: 'moon:cavefill') is drawn only within the wing's reach (world/moonzones.js, 32 m of the tube's
//     middle, six more before it is dropped); the shell and the massif are the wing's stand-in and are always drawn.
//   * INSIDE: once she is past the mouth the massif is hidden (the camera is in the rock then: the shell is seen from inside, so no wall is ever between the lens and the
//     cat); once she is DEEP_AT metres in, everything outside is hidden too (the ground, the rocks, the base, the wings: the walk's frame is the tube, the cat, Pip, the
//     cell and the sky), so a frame in the tube is a handful of draws. Out again, all of it is put back as it was. Nothing reads a mesh's visibility.
//   * THE DEEP CELL is world/moonbaselive.js's: it picks it up from the pedestal (once the base is awake), carries it and plugs it into the Core's third socket. THIS file sees
//     it go in: the Star Garden blooms (six flowers on the planters, one InstancedMesh), a line, a chime, Pip's dance; and Earth's FINALE: a bigger shimmer round it (the
//     sky's halo), which swells as Earth answers the postcard (or at once if the story is already told) and then rests as a faint halo on every later walk.
// Everything here is a pure function of the walk's seconds and the save: no random number, no clock of its own.
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as P from './moonplan.js';
import * as M from './moonmission.js';
import * as L from './moonlava.js';
import { createZones } from './moonzones.js';
import { createMoonSound } from './moonsound.js';

export const BLOOM = Object.freeze({ grow: 2.6, line: 0.4 }); // s for the flowers to open; when the line is said
export const FINALE = Object.freeze({ swell: 1.3, swells: 4, fade: 3, rest: 0.4, line: 2.8 }); // Earth's finale (seconds): four and a half slow swells (it ends on a peak), then a fade to a faint halo
export const FAR_BLOOM = 45; // m: the flowers are not drawn beyond this from the dome (one draw)
const HIDE = ['moonPlace', 'moon:ground', 'moon:rocks-small', 'moon:rocks-big', 'moon:wing', 'moon:wingC', 'moon:domeglow'];
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });

// The Earth's shimmer at k seconds into the finale (pure; `reduced`: a steady bright glow for a few seconds, no swells).
export function finaleLevel(k, reduced = false) {
  if (k < 0) return FINALE.rest;
  const swellsEnd = FINALE.swell * (FINALE.swells + 0.5);
  const fade = FINALE.rest + (1 - FINALE.rest) * (1 - smooth((k - swellsEnd) / FINALE.fade));
  if (reduced) return k < swellsEnd ? 0.9 : FINALE.rest + (0.9 - FINALE.rest) * (1 - smooth((k - swellsEnd) / FINALE.fade));
  if (k < swellsEnd) return FINALE.rest + (1 - FINALE.rest) * (0.5 - 0.5 * Math.cos((k / FINALE.swell) * Math.PI * 2)); // a trough at 0, a peak at the end
  return fade;
}
export const FINALE_LENGTH = FINALE.swell * (FINALE.swells + 0.5) + FINALE.fade;

// One flower: five petals round a bud on a stem, vertex-coloured (the instance colour tints each).
function flowerGeometry() {
  const parts = [];
  const col = (g, hex) => {
    const n = g.attributes.position.count;
    const c = new THREE.Color(hex);
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'color') ng.deleteAttribute(k);
    return ng;
  };
  parts.push(col(new THREE.CylinderGeometry(0.025, 0.03, 0.8, 5).translate(0, 0.4, 0), 0x4fb27a));
  parts.push(col(new THREE.OctahedronGeometry(0.1, 0).translate(0, 0.84, 0), 0xfff3b0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const petal = new THREE.OctahedronGeometry(0.17, 0).scale(1, 0.32, 0.55).translate(0.2, 0, 0).rotateY(-a).translate(0, 0.84, 0);
    parts.push(col(petal, 0xffffff));
  }
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const colr = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); colr.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  return g;
}
const FLOWER_TINTS = Object.freeze([0xffb6e1, 0xb690ff, 0x8affc0, 0xffe08a, 0x9fd8ff, 0xffa8a8]);

// createDeepLive(ctx) -> { update, state, inside, dispose, ... }
// ctx: { scene, reducedMotion, ground, audio, progression, sky, launch (the launch life, for its `state.reply`), pip }
export function createDeepLive(ctx) {
  const { scene, reducedMotion = false, progression = null } = ctx;
  const ground = ctx.ground ?? { y: P.moonY };
  const sound = createMoonSound(ctx.audio ?? null);
  const zones = createZones();
  const byName = (n) => scene.getObjectByName(n) ?? null;
  let massif = byName('moon:massif');
  let fill = byName('moon:cavefill');
  const rec = () => progression?.state?.moon ?? {};
  let clock = 0;
  let disposed = false;
  let wasIn = M.deepIn(rec());
  let bloomT0 = wasIn ? -100 : null; // a walk that opens on a bloomed garden has it in full
  let finaleT0 = null;
  let wasReply = false;
  let mIn = false;
  let deepNow = false;
  let hidden = null; // Map(object -> what it was) while the outside is not drawn
  let bloomK = wasIn ? 1 : 0;
  const timers = [];
  const later = (secs, fn) => timers.push({ at: clock + secs, fn });

  // the Star Garden's flowers: one InstancedMesh over the six planters, scaled up from nothing
  const geo = flowerGeometry();
  const flowers = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }), P.PLANTERS.length);
  flowers.name = 'moon:bloom';
  flowers.castShadow = false;
  flowers.receiveShadow = false;
  Object.assign(flowers.userData, { noMerge: true, noCast: true, noContactShadow: true });
  const tint = new THREE.Color();
  P.PLANTERS.forEach((p, i) => flowers.setColorAt(i, tint.setHex(FLOWER_TINTS[i % FLOWER_TINTS.length])));
  const m4 = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const bv = new THREE.Vector3(), bs = new THREE.Vector3();
  let lastBloom;
  const setBloom = (k) => {
    if (k !== lastBloom) {
      lastBloom = k;
      bs.setScalar(Math.max(0.0001, smooth(k)));
      P.PLANTERS.forEach((p, i) => {
        // each planter's flower stands a little off the middle (the glow plants are on it), turned a different way
        const a = i * 1.9;
        flowers.setMatrixAt(i, m4.compose(bv.set(p.x + Math.cos(a) * 0.18, ground.y(p.x, p.z) + 0.52, p.z + Math.sin(a) * 0.18), q0.set(0, Math.sin(a / 2), 0, Math.cos(a / 2)), bs));
      });
      flowers.instanceMatrix.needsUpdate = true;
      if (!flowers.boundingSphere) { flowers.computeBoundingSphere(); flowers.boundingSphere.radius += 1.2; } // frustum-culled like any mesh (it is a draw, and the dome's frame is the Moon's heaviest): the sphere is measured once, from the planters, and padded by the flowers' reach
    }
    flowers.visible = k > 0;
  };
  setBloom(wasIn ? 1 : 0);
  scene.add(flowers);

  // Outside undrawn: every frame she is deep inside the named things are put back to hidden (the wings' own lives set their visibility each frame), remembering what each was.
  function setOutside(on) {
    if (!on) {
      hidden = hidden ?? new Map();
      for (const n of HIDE) {
        const o = byName(n);
        if (!o) continue;
        if (!hidden.has(o)) hidden.set(o, o.visible);
        o.visible = false;
      }
    } else if (hidden) {
      for (const [o, was] of hidden) o.visible = was;
      hidden = null;
    }
  }

  function startFinale() {
    finaleT0 = clock;
    sound.reply();
    ctx.pip?.dance?.();
    later(FINALE.line, () => say('moon-deep-finale', phrase('moon.deep.finale')));
  }
  function startBloom() {
    bloomT0 = clock;
    sound.traced();
    ctx.pip?.dance?.();
    later(BLOOM.line, () => say('moon-deep-bloom', phrase('moon.deep.bloom')));
    if (M.storyDone(rec())) startFinale(); // the story is told: Earth shines at once
  }

  return {
    /** (background loading) the rover stage arrived: find the massif and the cave's fill it brought */
    refresh() { massif ??= byName('moon:massif'); fill ??= byName('moon:cavefill'); },
    get inside() { return deepNow; },
    get mouthIn() { return mIn; },
    get hiddenOutside() { return !!hidden; },
    get state() { return { clock, bloom: bloomK, finale: finaleT0 === null ? null : clock - finaleT0, mouthIn: mIn, inside: deepNow, zone: zones.near('D'), shimmer: ctx.sky?.shimmer ?? 0 }; },
    get flowers() { return flowers; },
    update(dt, t, catPos = null) {
      if (disposed) return;
      clock += dt > 0 ? dt : 0;
      for (let i = timers.length - 1; i >= 0; i--) if (clock >= timers[i].at) { const f = timers.splice(i, 1)[0].fn; f(); }
      const r = rec();
      const inNow = M.deepIn(r);
      if (inNow && !wasIn) startBloom();
      wasIn = inNow;
      // the zone and the inside
      if (catPos) {
        const near = zones.update(catPos.x, catPos.z).D;
        if (fill) fill.visible = near;
        mIn = L.mouthIn(catPos.x, catPos.z);
        deepNow = L.insideDeep(catPos.x, catPos.z);
        if (massif) massif.visible = !mIn;
        setOutside(!deepNow);
        if (fill && deepNow) fill.visible = true;
      }
      // the flowers
      const k = bloomT0 === null ? 0 : reducedMotion ? 1 : Math.min(1, (clock - bloomT0) / BLOOM.grow);
      bloomK = smooth(k);
      setBloom(k);
      if (catPos && flowers.visible) flowers.visible = Math.hypot(catPos.x - P.DOME.x, catPos.z - P.DOME.z) <= FAR_BLOOM && !deepNow;
      // Earth's finale: it swells when the postcard's answer begins (or when the cell goes in after the story), then rests as a faint halo
      const reply = !!ctx.launch?.state?.reply;
      if (reply && !wasReply && inNow && M.storyDone(rec())) startFinale();
      wasReply = reply;
      const done = inNow && M.storyDone(r);
      const level = !done ? 0 : finaleT0 !== null && clock - finaleT0 < FINALE_LENGTH ? finaleLevel(clock - finaleT0, reducedMotion) : FINALE.rest;
      ctx.sky?.setShimmer?.(level);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      setOutside(true);
      if (massif) massif.visible = true;
      scene.remove(flowers);
      geo.dispose();
      flowers.material.dispose();
      flowers.dispose?.();
      sound.dispose();
    },
  };
}
