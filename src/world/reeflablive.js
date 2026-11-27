// =============================================================================
// THE REEF, THE SEALAB ON A WALK (milestone R13): the hatch and what changes while she is inside. A drawing and a place she is set in, never a rule she can
// lose to: nothing here reads or writes the save.
//   * THE HATCH: standing by the ring beside the Sunken Boat offers "Climb down" (the lowest-priority offer of the Reef's prompt arbiter, so Marlo's and the
//     errand's win); inside, standing by the ladder offers "Climb up". A trip fades the picture out, sets her on the other side (the way the warm bubble sets her
//     at the ladder's foot), fades back, and puts the camera's zoom back at once (setCameraZoom, instant). Reduced motion: no fade.
//   * INSIDE: her float is off (player.setFloat(null); coming out restores the Reef's own row, so the physics table has no new row), the air gauge is paused,
//     the one real light (made at build with intensity 0) is raised and follows her, the fog eases from 6/40 m to 14/60 m (and back), the outside hull is
//     hidden and the inside shown, and only her own room's wall faces are drawn (a wall seen from the next room would stand between the camera and her).
//     The Reef's fish, seals and the rest stay as they are: they swim outside the walls, which are opaque, and the dome's glass shows them.
//   * THE LIGHTS: the panel wall's cells blink (still, all on, under reduced motion); the lower rungs leave the small props undrawn.
// =============================================================================

import { phrase } from '../clanphrases.js';
import * as L from './reeflabplan.js';
import { createTravel, startTravel, stepTravel, travelling } from './reeflabtravel.js';
import './reeflabwords.js';

export const INSIDE = Object.freeze({ fogNear: 14, fogFar: 60, light: 2.0, lightY: 3.0, lightEase: 4, fogEase: 2 });
const BLINK_EVERY = 0.15;

// createLabLive(ctx) -> { promptAt, interact, update, dispose, inside }; ctx: { scene, reefY, look (the Reef's WATER_LOOK), player, reducedMotion, tier, say, setPaused, doc }.
// (It takes the Reef's seabed height and look from the caller, so this stage's chunk imports nothing of the Reef's plan: the build keeps one shared plan chunk out of start-up.)
export function createLabLive({ scene, reefY, look, player = null, reducedMotion = false, tier = null, say = null, setPaused = null, doc = globalThis.document }) {
  const lowTier = !!tier && (tier.name === 'low' || tier.shadows === false || (tier.rung ?? 0) >= 3);
  const get = (n) => scene.getObjectByName(n) ?? null;
  const interior = get('lab:interior');
  const hull = get('lab:hull');
  const detail = get('lab:detail');
  const walls = get('lab:walls');
  const glow = get('lab:glow');
  const light = get('lab:light');
  const travel = createTravel();
  let inside = false;
  let home = null; // the Reef's own float row, kept while she is inside (the player hands it back: no new physics row, no import of the table here)
  let want = null; // what the action button would do now: 'down' | 'up'
  let session = null;
  let clock = 0;
  let acc = 0;

  // the fade: one full-screen veil in the walk's own HUD, drawn only while a trip lasts
  const veil = doc?.createElement?.('div') ?? null;
  if (veil?.style) {
    veil.className = 'reef-fade';
    veil.style.cssText = 'position:fixed;inset:0;background:#0a3a4a;opacity:0;pointer-events:none;z-index:9';
    (doc.getElementById?.('hud') ?? doc.body)?.appendChild?.(veil);
  }

  // the blinking cells: the glow mesh's vertex colours from the first cell on, kept as they were drawn and scaled by each cell's level
  const led = glow?.userData?.led ?? null;
  const ledCol = glow && led ? glow.geometry.attributes.color : null;
  const ledOrig = ledCol ? Float32Array.from(ledCol.array.subarray(led.start * 3, (led.start + led.verts * led.count) * 3)) : null;
  function blink(t, still) {
    if (!ledCol) return;
    for (let i = 0; i < led.count; i++) {
      const k = still ? 1 : L.blinkLevel(i, t);
      for (let v = 0; v < led.verts; v++) {
        const o = (i * led.verts + v) * 3;
        const a = (led.start + i * led.verts + v) * 3;
        ledCol.array[a] = ledOrig[o] * k; ledCol.array[a + 1] = ledOrig[o + 1] * k; ledCol.array[a + 2] = ledOrig[o + 2] * k;
      }
    }
    ledCol.needsUpdate = true;
  }

  function place(dir, s) {
    const cat = s.cat;
    if (dir === 'down') {
      const a = L.HATCH.inside.arrive;
      cat.position.set(a.x, reefY(a.x, a.z), a.z);
      inside = true;
      player?.halt?.();
      home ??= player?.floatRow ?? null;
      player?.setFloat?.(null); // no float inside: the Reef's own row is put back on the way out
      setPaused?.(true);
      say?.(phrase('reef.lab.in'));
    } else {
      const a = L.HATCH.outside.landing;
      cat.position.set(a.x, reefY(a.x, a.z), a.z);
      leave();
    }
    player?.clearFloat?.();
    player?.setCameraZoom?.(player.cameraZoomStep, { instant: true });
  }
  function leave() {
    inside = false;
    player?.halt?.();
    if (home) player?.setFloat?.(home); // the Reef's float row, as it was
    setPaused?.(false);
  }

  function show(catPos, dt) {
    if (interior) interior.visible = inside;
    if (hull) hull.visible = !inside;
    if (detail) detail.visible = inside && !lowTier;
    const k = reducedMotion ? 1 : Math.min(1, dt * INSIDE.fogEase);
    if (scene.fog) {
      scene.fog.near += ((inside ? INSIDE.fogNear : look.fogNear) - scene.fog.near) * k;
      scene.fog.far += ((inside ? INSIDE.fogFar : look.fogFar) - scene.fog.far) * k;
    }
    if (light) {
      const lk = reducedMotion ? 1 : Math.min(1, dt * INSIDE.lightEase);
      light.intensity += ((inside ? INSIDE.light : 0) - light.intensity) * lk;
      if (inside) light.position.set(catPos.x, Math.min(L.LAB_FLOOR_Y + INSIDE.lightY, L.labCeilAt(catPos.x, catPos.z) - 1.2), catPos.z);
    }
    if (inside && walls) {
      const vis = L.visibleRooms(catPos.x, catPos.z);
      walls.userData.rooms.forEach((id, i) => { walls.material[i].visible = vis.includes(id); });
    }
  }

  blink(0, true);
  show({ x: 0, z: 0 }, 1);
  return {
    get inside() { return inside; },
    get travelling() { return travelling(travel); },
    promptAt(catPos) {
      want = null;
      if (!catPos || travelling(travel)) return null;
      if ((player?.floatY ?? 0) > 1.0) return null; // she climbs from the sand, not from high over it
      if (!inside) {
        const o = L.HATCH.outside;
        if (Math.hypot(catPos.x - o.x, catPos.z - o.z) < o.reach) { want = 'down'; return phrase('reef.lab.down'); }
      } else {
        const e = L.HATCH.inside;
        if (Math.hypot(catPos.x - e.exit.x, catPos.z - e.exit.z) < e.reach) { want = 'up'; return phrase('reef.lab.up'); }
      }
      return null;
    },
    interact() {
      const dir = want;
      want = null;
      if (dir) startTravel(travel, dir);
      return null;
    },
    update(dt, t, catPos, camera, s) {
      session = s ?? session;
      clock += Math.max(dt, 0);
      const step = stepTravel(travel, dt, reducedMotion);
      if (travelling(travel)) player?.halt?.();
      if (step.place && session?.cat) place(step.dir, session);
      if (veil?.style) veil.style.opacity = String(reducedMotion ? 0 : step.alpha);
      // set down somewhere else while inside (a lift, a reset): the inside state ends with it
      if (inside && !travelling(travel) && !L.insideLab(catPos.x, catPos.z, 1.0)) leave();
      show(catPos, dt);
      if (inside && !reducedMotion) {
        acc += dt;
        if (acc >= BLINK_EVERY) { acc = 0; blink(clock, false); }
      }
    },
    dispose() {
      veil?.remove?.();
      if (scene.fog) { scene.fog.near = look.fogNear; scene.fog.far = look.fogFar; }
      if (light) light.intensity = 0;
    },
  };
}
