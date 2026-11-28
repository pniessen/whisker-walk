import * as THREE from 'three';
import { withLocalUuids } from './localuuids.js';
import { hash01 } from './builder.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import { createLighthouseAlive } from './lighthousealive.js';
import { createLighthouseSound } from './lighthousesound.js';
import { createLighthouseWeather } from './lighthouseweather.js';
import { createLighthouseVistas } from './lighthousebeauty7.js';
import './lighthousewords.js';
import { TOWER, GALLERY_Y, LAMP_ROOM, LEVER, LEVER_KIND, BELL_KIND, BELL, GULL_ROCK, POOLS } from './lighthouseplan.js';
import { findAt, noteLighthouseFind } from './lighthousefinds.js';
import { createFindLooks } from './lighthousemoments.js';
import { createKeeperCats } from './lighthousecats.js';
import { LIGHTHOUSE_JOB_PAGES } from '../lighthousepages.js';

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
// THE LAMP PAYS WHERE SHE STANDS (milestone 3). The lever lights the lamp on every screen, but the job's 25 paws
// are paid to the screen whose cat is in the lamp room (within PAY_R of the lever) when it is lit, or comes there
// after: a partner's pull, which the log cannot tell from hers, pays only a cat who is up there to see it.
//
// THE SIX FINDS (milestone 3, world/lighthousefinds.js findAt). Every frame the life fills one spot from her paws,
// her paws' own speed, how long she has stood still, a call this frame (the bus's `tip:did` 'call', her own meow
// button) and the bell's rope going over this frame, and asks findAt which find she is at. One not yet seen this
// walk is noted on her save (noteLighthouseFind: the first time ever pays AWARDS.lighthousefind and says its line;
// every walk counts once on its page, by the discovery log's key). Then its look plays (every time she is there,
// not once a walk): the pool's crab pops up, a gull lands beside her on the gallery or Gull Rock, the cave sings
// her call back, the fog bell rings and the gulls scatter, the window's cat purrs. Re-armed when she moves 1.5 m.
//   * Without a log or a progression (the picture pages) nothing is noted; the looks still play.
//   * In a room each device runs its own walk, so each player is noted on her own save, once.
//
// THE FOG BELL'S ROPE is a tippable (kind BELL_KIND): her paw tips it and a partner's `tip` event tips it by id,
// each screen sees the entry's own `tipped`. The bell (the group 'lighthouse:bell') swings, the bell sounds, the
// gulls near it flee, once a walk. Its find is found if she is within r m of it when it goes over.
//
// THE KEEPER'S CAT AND HER KITTEN are world/lighthousecats.js; the job's prompt and interaction (promptAt,
// interact) are handed to the walk through this life (game/interactions.js asks an area life for them).
//
// Draws no random number and reads no clock: every number is a constant here or a walk second.
// =============================================================================

export const BEAM = Object.freeze({ period: 18, length: 64, radius: 5.2, inner: 2.2, patchDist: 50, patchLen: 11, patchWid: 5, y: LAMP_ROOM.lensY + 0.3 });
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
export const PAY_R = 3.2; // m from the lever she must be in for the lamp job to pay her
export const STILL_EPS = 0.05; // m: her paws within this of where she came to rest are still (the Rooftops' rule)
export const REARM_R = 1.5; // m she walks off before a look can play again
export const BELL_SWING = Object.freeze({ amp: 0.5, hz: 1.7, secs: 4 });
export const SCATTER_R = 30; // m: gulls within this of the bell flee
const TAU = Math.PI * 2;

// The beam's world angle (radians, x east = 0, z south = pi/2) after `seconds` of the walk, in a room of `seed`
// (undefined, or a solo walk's none: phase 0). Pure.
export function beamAngle(seconds, seed) {
  const phase = seed === undefined || seed === null ? 0 : hash01(Number(seed) % 9973, (Number(seed) >>> 4) % 7919, LIGHT_BEAM_SALT) * TAU;
  const a = (TAU * seconds) / BEAM.period + phase;
  return ((a % TAU) + TAU) % TAU;
}

const nearestPool = (p) => POOLS.reduce((best, q) => (Math.hypot(p.x - q.x, p.z - q.z) - q.r < Math.hypot(p.x - best.x, p.z - best.z) - best.r ? q : best), POOLS[0]);
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
  const { scene, ground = null, audio = null, log = null, tier = null, progression = null, critters = null } = ctx;
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
    const beam = new THREE.Mesh(coneGeometry(BEAM.length, BEAM.radius, 0xffd98a, 0.17), additive(0));
    // the bright core: a narrower cone inside the wide one, merged into the same draw by being a second child
    const core = new THREE.Mesh(coneGeometry(BEAM.length * 0.9, BEAM.inner, 0xfff0c4, 0.3), additive(0));
    beam.add(core);
    const halo = new THREE.Mesh(glowDisc(2.3, 0xffd48a, 0.3, 'xy', 20), additive(0));
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.5, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, fog: true }));
    const patch = lowTier ? null : new THREE.Mesh(glowDisc(1, 0xffd490, 0.3, 'xz', 20), additive(0));
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
  // the weather as events (lighthouseweather.js, beauty pass 6): storm, fog, the golden sunset, a starry night; its state is read by the beam and the sea
  const wx = withLocalUuids('lighthouse-weather', () => createLighthouseWeather({ scene, sun: ctx.sun ?? null, fill: ctx.fill ?? null, waterFx: ctx.waterFx ?? [], weather: ctx.weather ?? null, hour: ctx.hour, night: ctx.night ?? 0, seed, reducedMotion: !!ctx.reducedMotion, lite: lowTier, force: ctx.wx ?? (ctx.hour === undefined ? 'off' : null), waters: ctx.waters ?? [] }));
  // the five photogenic vistas (lighthousebeauty7.js, beauty pass 7): a grade, haze and a golden moment where she stands still
  const vistas = withLocalUuids('lighthouse-vistas', () => createLighthouseVistas({ scene, ground, reducedMotion: !!ctx.reducedMotion, lite: lowTier, low: tier?.name === 'medium' }));
  const alive = withLocalUuids('lighthouse-alive', () => createLighthouseAlive({ scene, reducedMotion: !!ctx.reducedMotion, tier, sound, seed, wonder: ctx.wonder ?? null, tone: ctx.tone ?? null, night: ctx.night ?? 0, wx: wx.state }));
  const looks = createFindLooks({ scene, ground, reducedMotion: !!ctx.reducedMotion });
  const cats = createKeeperCats({ scene, ground, colliders: ctx.colliders, waters: ctx.waters, sound, log, progression, roomSeed: seed, visits: ctx.visits, reducedMotion: !!ctx.reducedMotion });
  // her own meow button (game/interactions.js doMeow tells the bus): the cave's echo answers it
  let meowed = false;
  const offMeow = bus.on('tip:did', (e) => { if (e && e.id === 'call') meowed = true; });
  let payDue = false;
  let bellEntry = null;
  let bellMesh = null;
  let bellRungAt = null;
  // stillness (the Rooftops' rule): her paws within STILL_EPS of where she came to rest
  const rest = { x: 0, z: 0, y: 0, since: 0, set: false };
  const armed = { pool: true, gull: true, window: true };
  const armPos = { pool: null, gull: null, window: null };
  const spot = { x: 0, y: 0, z: 0, still: 0, meow: false, belled: false };

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
      payDue = true; // paid to the cat who is in the lamp room (update), not to whoever's paw it was
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
    const wk = wx.state; const murk = Math.min(1.4, wk.storm * 0.85 + wk.fog); // in rain and fog the cone shows
    beam.scale.set(1, 1 + 0.45 * murk, 1 + 0.45 * murk);
    beam.children[0].visible = beam.visible;
    for (const m of [beam, beam.children[0]]) m.material.opacity = glowK * (1 + 1.1 * murk);
    halo.visible = glowK > 0;
    halo.scale.setScalar(1 + 0.9 * murk);
    if (camera) halo.quaternion.copy(camera.quaternion);
    halo.material.opacity = glowK * (0.8 + (ctx.reducedMotion ? 0 : 0.08 * Math.sin(t * 2.1)));
    glow.visible = glowK > 0;
    glow.material.opacity = glowK * 0.22;
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

  function scatterGulls(x, z) {
    for (const c of critters?.list ?? []) {
      if (c.type !== 'seagull' || c.hidden) continue;
      if (Math.hypot(c.group.position.x - x, c.group.position.z - z) < SCATTER_R) { c.fleeing = true; c.cooldown = 18; }
    }
  }

  function updateBellAndFinds(dt, catPos, session) {
    // the bell's rope: tipped by her paw or her partner's; the bell swings once, the gulls flap off
    bellEntry ??= session?.tippables?.list?.find((e) => e.kind === BELL_KIND) ?? null;
    bellMesh ??= scene?.getObjectByName?.('lighthouse:bell') ?? null;
    let belled = false;
    if (bellEntry && bellEntry.anim > 0) { bellEntry.anim = 0; bellEntry.group.rotation.z = 0; bellEntry.group.position.y = bellEntry.gy; } // the rope stays up
    if (bellEntry?.tipped && bellRungAt === null) {
      bellRungAt = t;
      belled = true;
      sound.bell();
      scatterGulls(BELL.x, BELL.z);
    }
    if (bellMesh) {
      const k = bellRungAt === null ? -1 : (t - bellRungAt) / BELL_SWING.secs;
      bellMesh.rotation.x = k < 0 || k >= 1 || ctx.reducedMotion ? 0 : BELL_SWING.amp * Math.exp(-3.2 * k) * Math.sin(TAU * BELL_SWING.hz * (t - bellRungAt));
    }

    // how long she has stood still
    if (!rest.set || Math.hypot(catPos.x - rest.x, catPos.z - rest.z) > STILL_EPS || Math.abs(catPos.y - rest.y) > 0.3) { rest.x = catPos.x; rest.z = catPos.z; rest.y = catPos.y; rest.since = t; rest.set = true; }
    spot.x = catPos.x; spot.y = catPos.y; spot.z = catPos.z;
    spot.still = t - rest.since;
    spot.meow = meowed;
    spot.belled = belled && Math.hypot(catPos.x - BELL.x, catPos.z - BELL.z) < 3.5;
    meowed = false;
    const id = findAt(spot);

    // re-arm a look once she has walked off from where it played
    for (const k of Object.keys(armPos)) {
      if (!armed[k] && Math.hypot(catPos.x - armPos[k].x, catPos.z - armPos[k].z) > REARM_R) armed[k] = true;
    }
    if (!id) return;
    if (log && progression) noteLighthouseFind(id, { log, progression });
    if (id === 'echo') sound.echo();
    else if (id === 'pool' && armed.pool) {
      armed.pool = false; armPos.pool = { x: catPos.x, z: catPos.z };
      // the crab comes up at the pool's rim a little way round from her
      const pool = nearestPool(catPos);
      const a = Math.atan2(catPos.z - pool.z, catPos.x - pool.x) + 0.9; // a little round the rim from her, so it is seen, not trodden on
      const rx = pool.x + Math.cos(a) * (pool.r + 0.15); const rz = pool.z + Math.sin(a) * (pool.r + 0.15);
      looks.crab(rx, ground ? ground.y(rx, rz) : 0, rz, Math.atan2(catPos.x - rx, catPos.z - rz));
    } else if (id === 'gull' && armed.gull) {
      armed.gull = false; armPos.gull = { x: catPos.x, z: catPos.z };
      // beside her, out toward the sea (away from the tower, or from Gull Rock's middle), facing her way in
      const cx = catPos.y > GALLERY_Y - 2 ? TOWER.x : GULL_ROCK.x; const cz = catPos.y > GALLERY_Y - 2 ? TOWER.z : GULL_ROCK.z;
      const a = Math.atan2(catPos.z - cz, catPos.x - cx) + Math.PI / 2; // a quarter turn along the rail from her
      const ux = Math.cos(a); const uz = Math.sin(a);
      if (looks.gull(catPos.x + ux * 1.1, catPos.y, catPos.z + uz * 1.1, -ux, -uz)) sound.gull();
    } else if (id === 'window' && armed.window) {
      armed.window = false; armPos.window = { x: catPos.x, z: catPos.z };
      sound.purr();
    }
  }

  return {
    get lit() { return lit; },
    promptAt: (catPos) => cats.promptAt(catPos),
    interact: () => cats.interact(),
    get cats() { return cats; },
    get looks() { return looks; },
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
      const glowK = lit ? smooth((t - litAt) / LIGHT_UP) : 0;
      wx.update(dt, t, camera, catPos, sound, beamAngle(t, seed), lit);
      vistas.update(dt, t, catPos, wx, sound);
      placeBeam(glowK, catPos, camera);
      alive.update(dt, t, camera, beamAngle(t, seed), glowK, catPos);
      sound.beds?.(dt, catPos);

      if (shipDue !== null && !shipDone && t >= shipDue) {
        shipDone = true;
        sound.horn();
        bus.emit('discovery', { type: 'lighthouseship', key: 'lighthouse-ship', label: phrase('lighthouse.lamp.ship'), points: 0, repeat: false });
      }

      if (catPos) {
        if (payDue && Math.hypot(catPos.x - LEVER.x, catPos.z - LEVER.z) < PAY_R && Math.abs(catPos.y - GALLERY_Y) < 1.5) {
          payDue = false;
          const paid = log?.awardOnce('lighthousejob', JOB_KEY, phrase('lighthouse.lamp.lit')) ?? 0;
          if (paid > 0) progression?.recordSighting?.(LIGHTHOUSE_JOB_PAGES.lamp);
        }
        updateBellAndFinds(dt, catPos, session);
        cats.update(dt, catPos);
      }
      looks.update(dt);

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
      alive.dispose();
      vistas.dispose();
      wx.dispose();
      offMeow?.();
      looks.dispose();
      cats.dispose();
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
