import * as THREE from 'three';
import { withLocalUuids } from './localuuids.js';
import { hash01 } from './builder.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import { createLighthouseSound } from './lighthousesound.js';
import './lighthousewords.js';
import { TOWER, GALLERY_Y, LAMP_ROOM, LEVER_KIND } from './lighthouseplan.js';

// =============================================================================
// THE LIGHTHOUSE'S LIFE (milestone 2: the lamp). Made once a walk by walk.js from the area's `life`
// hook; main.js calls update(dt, t, catPos, camera, session) every frame; endWalk calls dispose().
// Part of the place's chunk.
//
// THE LAMP JOB. The lamp is unlit when she arrives. The lever in the lamp room is a tippable (kind
// LEVER_KIND): her paw tips it (tippables.tip) and a partner's `tip` event tips it by id (tipById), so
// each screen sees the entry's own `tipped`. The first frame it is tipped, on either screen, the lamp
// lights: the lens glows, the beam turns, the halo and the pool of light on the sea come on, and the
// first time on this walk the job pays AWARDS.lighthousejob under the lamp-lit line (log.awardOnce, key
// JOB_KEY: once a walk, on this device). A far ship answers HORN_AFTER walk seconds later: its horn
// (lighthousesound.js, silent while muted) and its line. No clock to beat, nothing fails, nothing is
// sent: the lever rides the existing `tip` event.
// A walk picked up again (walkresume.js restores the discovery log) finds JOB_KEY paid: the lamp is lit
// from its first frame, the lever already pulled, nothing paid again and no horn.
//
// THE BEAM is a mesh, never a light. beamAngle(walkSeconds, roomSeed) is the whole truth about where it
// points: a turn every BEAM.period seconds from a phase that comes from the room seed (hash01 and a salt,
// no random number), so two screens of one room agree to a fraction of a second. It turns on the life's own
// clock (the sum of the dt it is given), so a paused walk does not turn it. The meshes (one cone made of two
// nested ones, one flat pool of light skipped on the low tier, one halo facing the camera, one glow over the
// lens) exist from the start and are hidden until the lamp is lit.
//
// THE LAMP ROOM'S ROOF AND GLASS fade while she is inside, so the camera sees her whichever way it
// looks down: opacity eased to FADE_ROOF and FADE_GLASS inside, back to 1 and the glass's own outside.
//
// Draws no random number and reads no clock: every number is a constant here or a walk second.
// =============================================================================

export const BEAM = Object.freeze({ period: 18, length: 42, radius: 3.4, inner: 1.5, patchDist: 28, patchLen: 9, patchWid: 4.2, y: LAMP_ROOM.lensY + 0.3 });
export const LIGHT_BEAM_SALT = 0x1170b4;
export const JOB_KEY = 'lighthouse-job-lamp';
export const HORN_AFTER = 4; // walk seconds from the lamp lighting to the ship's answer
export const LIGHT_UP = 1.6; // s to come to full
export const ARM_SWING = 1.25; // rad the lever's arm falls
export const ARM_TIME = 0.45; // s
export const FADE_ROOF = 0.14;
export const FADE_GLASS = 0.08;
export const GLASS_OPACITY = 0.22;
export const INSIDE_R = 2.6;
const TAU = Math.PI * 2;

// The beam's world angle (radians, x east = 0, z south = pi/2) after `seconds` of the walk, in a room of `seed`
// (undefined, or a solo walk's none: phase 0). Pure.
export function beamAngle(seconds, seed) {
  const phase = seed === undefined || seed === null ? 0 : hash01(Number(seed) % 9973, (Number(seed) >>> 4) % 7919, LIGHT_BEAM_SALT) * TAU;
  const a = (TAU * seconds) / BEAM.period + phase;
  return ((a % TAU) + TAU) % TAU;
}

const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };

// A flat or upright disc whose colour fades from `hex` x k at its middle to black at its rim (added to the picture, so black is nothing).
function glowDisc(r, hex, k, plane, seg = 20) {
  const c = new THREE.Color(hex);
  const pos = [];
  const col = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU; const a1 = ((i + 1) / seg) * TAU;
    for (const [px, pz, f] of [[0, 0, k], [Math.cos(a0) * r, Math.sin(a0) * r, 0], [Math.cos(a1) * r, Math.sin(a1) * r, 0]]) {
      if (plane === 'xz') pos.push(px, 0, pz); else pos.push(px, pz, 0);
      col.push(c.r * f, c.g * f, c.b * f);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// A cone along +x from the origin: apex bright, the wide end black.
function coneGeometry(length, radius, hex, k, seg = 10) {
  const c = new THREE.Color(hex);
  const pos = [];
  const col = [];
  const ring = (i) => { const a = (i / seg) * TAU; return [length, Math.cos(a) * radius, Math.sin(a) * radius]; };
  for (let i = 0; i < seg; i++) {
    const a = ring(i); const b = ring(i + 1);
    pos.push(0, 0, 0, ...a, ...b);
    col.push(c.r * k, c.g * k, c.b * k, 0, 0, 0, 0, 0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

const additive = (opacity = 1, side = THREE.DoubleSide) => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, opacity, side });

// createLighthouseLife(ctx) -> { update, dispose, lit, state }. ctx is what walk.js hands an area life: { scene, ground, reducedMotion, audio, log, progression, tier, roomSeed, ... }.
export function createLighthouseLife(ctx = {}) {
  const { scene, ground = null, audio = null, log = null, tier = null } = ctx;
  const seed = ctx.roomSeed;
  const lowTier = tier?.name === 'low';
  let disposed = false;
  let t = 0; // walk seconds: the sum of the dt it has been given
  let lit = false;
  let litAt = 0;
  let shipDue = null;
  let shipDone = false;
  let lever = null;
  let arm = null;
  let roof = null;
  let glass = null;
  let roofK = 1;
  let glassK = 1;

  const parts = withLocalUuids('lighthouse-life', () => {
    const beam = new THREE.Mesh(coneGeometry(BEAM.length, BEAM.radius, 0xffd98a, 0.22), additive(0));
    // the bright core: a narrower cone inside the wide one, merged into the same draw by being a second child
    const core = new THREE.Mesh(coneGeometry(BEAM.length * 0.9, BEAM.inner, 0xfff0c4, 0.3), additive(0));
    beam.add(core);
    const halo = new THREE.Mesh(glowDisc(2.3, 0xffd48a, 0.6, 'xy', 20), additive(0));
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.5, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, fog: true }));
    const patch = lowTier ? null : new THREE.Mesh(glowDisc(1, 0xffd490, 0.55, 'xz', 20), additive(0));
    if (patch) patch.scale.set(BEAM.patchLen, 1, BEAM.patchWid);
    const all = [beam, halo, glow, patch].filter(Boolean);
    for (const m of all) { m.visible = false; m.castShadow = false; m.receiveShadow = false; m.userData.noMerge = true; m.userData.noCast = true; m.frustumCulled = false; }
    beam.position.set(TOWER.x, BEAM.y, TOWER.z);
    halo.position.set(TOWER.x, LAMP_ROOM.lensY + 0.35, TOWER.z);
    glow.position.set(TOWER.x, LAMP_ROOM.lensY + 0.2, TOWER.z);
    if (patch) patch.position.y = 0.09;
    return { beam, core, halo, glow, patch, all };
  });
  for (const m of parts.all) scene?.add(m);
  const sound = createLighthouseSound(audio);

  function findLever(session) {
    const list = session?.tippables?.list;
    if (!list) return null;
    return list.find((e) => e.kind === LEVER_KIND) ?? null;
  }

  // The lamp comes on: from the lever (fresh) or from a walk picked up again (already paid: `fresh` false).
  function light(fresh, at) {
    lit = true;
    litAt = at;
    if (lever) {
      lever.tipped = true;
      lever.anim = 0; // the arm swings itself; the whole lever does not tilt
      lever.group.rotation.z = 0;
      lever.group.position.y = lever.gy;
    }
    if (fresh) {
      log?.awardOnce('lighthousejob', JOB_KEY, phrase('lighthouse.lamp.lit'));
      shipDue = at + HORN_AFTER;
    } else {
      shipDone = true;
    }
  }

  function placeBeam(glowK, catPos, camera) {
    const a = beamAngle(t, seed);
    const { beam, halo, glow, patch } = parts;
    beam.visible = glowK > 0;
    beam.rotation.y = -a;
    beam.children[0].visible = beam.visible;
    for (const m of [beam, beam.children[0]]) m.material.opacity = glowK;
    halo.visible = glowK > 0;
    if (camera) halo.quaternion.copy(camera.quaternion);
    halo.material.opacity = glowK * (0.8 + (ctx.reducedMotion ? 0 : 0.08 * Math.sin(t * 2.1)));
    glow.visible = glowK > 0;
    glow.material.opacity = glowK * 0.5;
    if (patch) {
      const px = TOWER.x + BEAM.patchDist * Math.cos(a);
      const pz = TOWER.z + BEAM.patchDist * Math.sin(a);
      // the pool of light lies on low ground only (the sea and the cove): over the headland it is not drawn
      const low = !ground || ground.y(px, pz) < 0.5;
      patch.visible = glowK > 0 && low;
      patch.position.x = px;
      patch.position.z = pz;
      patch.rotation.y = -a;
      patch.material.opacity = glowK;
    }
    void catPos;
  }

  return {
    get lit() { return lit; },
    get state() { return { lit, litAt, t, shipDone }; },
    update(dt, _t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      t += dt > 0 ? dt : 0;
      lever ??= findLever(session);
      if (!arm && lever) arm = lever.group.getObjectByName('lever-arm') ?? null;
      roof ??= scene?.getObjectByName?.('lighthouse:lamproof') ?? null;
      glass ??= scene?.getObjectByName?.('lighthouse:glass') ?? null;

      if (!lit) {
        if (lever?.tipped) light(true, t);
        else if (lever && log && log.count(JOB_KEY) > 0) { light(false, t - LIGHT_UP - ARM_TIME); }
      }
      if (lit && lever) { // a partner's tip or a Big Swat cascade can also reach the lever's own tilt: keep it level
        if (lever.anim > 0) { lever.anim = 0; lever.group.rotation.z = 0; lever.group.position.y = lever.gy; }
      }
      if (arm) arm.rotation.z = -ARM_SWING * smooth(lit ? (t - litAt) / ARM_TIME : 0);
      placeBeam(lit ? smooth((t - litAt) / LIGHT_UP) : 0, catPos, camera);

      if (shipDue !== null && !shipDone && t >= shipDue) {
        shipDone = true;
        sound.horn();
        bus.emit('discovery', { type: 'lighthouseship', key: 'lighthouse-ship', label: phrase('lighthouse.lamp.ship'), points: 0, repeat: false });
      }

      // the roof and the glass: see-through while she is inside the lamp room
      const inside = !!catPos && Math.hypot(catPos.x - TOWER.x, catPos.z - TOWER.z) < INSIDE_R && Math.abs(catPos.y - GALLERY_Y) < 1.5;
      const k = 1 - Math.exp(-6 * (dt > 0 ? dt : 0));
      roofK += ((inside ? FADE_ROOF : 1) - roofK) * k;
      glassK += ((inside ? FADE_GLASS / GLASS_OPACITY : 1) - glassK) * k;
      if (roof) roof.material.opacity = roofK;
      if (glass) glass.material.opacity = GLASS_OPACITY * glassK;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sound.dispose();
      for (const m of parts.all) {
        scene?.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      }
      parts.core.geometry.dispose();
      parts.core.material.dispose();
      if (roof) roof.material.opacity = 1;
      if (glass) glass.material.opacity = GLASS_OPACITY;
    },
  };
}
