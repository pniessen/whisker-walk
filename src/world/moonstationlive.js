// =============================================================================
// THE MOON'S OLD RELAY STATION ON A WALK (milestone M1). What the stage brings when it is in: the drawing (world/moonstationparts.js) added to the scene, the walls, mast, console and
// dish's post joined to the walk's colliders, the tower's ledge to its perches (golden mouse 4's one-hop climb), the rocks and pebbles in its footprint taken away (the footprint is
// pushed on MOON_CLEARS for every later build, and the instances already drawn are shrunk to nothing), the detail shown only within the wing's `near` (moonzones.js E, 26 m of the
// middle), the blink lights (steady in reduced motion) and the photo subject for its journal page. No light of its own, no clock, no random number (the walls' heights are one seeded stream).
// =============================================================================
import * as THREE from 'three';
import { MOON_CLEARS } from './moonplan.js';
import { createZones } from './moonzones.js';
import { moonMaterials } from './moonparts.js';
import { drawStation } from './moonstationparts.js';
import { STATION_COLLIDERS, STATION_PERCHES, CLEAR, SPOT } from './moonstationplan.js';
import { phrase } from '../clanphrases.js';
import { ST } from './moonstages.js';
import { createSledLive } from './moonsledlive.js';

export const BLINK = Object.freeze({ period: 1.8, lo: 0.45, still: 0.85 }); // s; the glow's brightness runs lo..1 round the period; reduced motion holds `still`

/** Shrinks to nothing every rock or pebble instance standing in the footprint (the instances drawn before the stage came in); returns how many. */
export function clearDrawnRocks(scene, rect = CLEAR) {
  let n = 0;
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.name.startsWith('moon:rocks-')) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      m.decompose(p, q, s);
      const r = Math.max(s.x, s.z);
      if (p.x + r > rect.minX && p.x - r < rect.maxX && p.z + r > rect.minZ && p.z - r < rect.maxZ && r > 0) { o.setMatrixAt(i, m.makeScale(0, 0, 0)); n++; }
    }
    o.instanceMatrix.needsUpdate = true;
  });
  return n;
}

/** createStationLive({ scene, reducedMotion, tier, colliders, perches, spot }) -> { group, update(dt, t, catPos), dispose(), near, glow }. */
export function createStationLive({ scene, reducedMotion = false, tier, colliders, perches, spot }) {
  const lite = tier?.shadows === false;
  const M = moonMaterials();
  const D = drawStation(M, { lite });
  const group = new THREE.Group();
  group.name = 'moon:stationE';
  D.near.visible = false;
  group.add(D.far, D.near);
  scene.add(group);
  const mine = STATION_COLLIDERS.map((c) => ({ ...c }));
  const myPerches = STATION_PERCHES.map((p) => ({ ...p }));
  colliders?.push(...mine);
  perches?.push(...myPerches);
  if (!MOON_CLEARS.includes(CLEAR)) MOON_CLEARS.push(CLEAR); // (a later build leaves these rocks out; the ones drawn already are shrunk below)
  clearDrawnRocks(scene);
  const view = { type: 'mnstation', label: phrase('moon.ws.station.photo'), pos: new THREE.Vector3(SPOT.x, SPOT.y, SPOT.z), range: SPOT.range };
  spot?.push(view);
  const zones = createZones();
  const sled = createSledLive({ scene, reducedMotion, tier, colliders, spot, clear: (r) => clearDrawnRocks(scene, r) }); // (milestone M2) the sled lane: its slots go into the station's (read by moonlife.js)
  const slotFns = { sled: sled.slots.sled, riding: sled.slots.riding, frame: (...a) => sled.frame(...a) };
  const slots = (ST.station ??= {});
  Object.assign(slots, slotFns);
  const live = {
    group, near: D.near, far: D.far, glow: M.glow, spotView: view,
    update(dt, t, catPos) {
      if (catPos) D.near.visible = zones.update(catPos.x, catPos.z).E; // the detail within `near` metres (with the zone's hysteresis)
      M.glow.color.setScalar(reducedMotion ? BLINK.still : BLINK.lo + (1 - BLINK.lo) * (0.5 + 0.5 * Math.sin((t / BLINK.period) * Math.PI * 2)));
    },
    sled,
    dispose() {
      sled.dispose();
      for (const k of Object.keys(slotFns)) if (slots[k] === slotFns[k]) delete slots[k];
      for (const list of [[colliders, mine], [perches, myPerches], [spot, [view]]]) for (const x of list[1]) { const i = list[0]?.indexOf(x) ?? -1; if (i >= 0) list[0].splice(i, 1); }
      scene.remove(group);
      group.traverse((o) => { o.geometry?.dispose?.(); });
      for (const m of Object.values(M)) m.dispose?.();
    },
  };
  return live;
}
