// THE OLD HOUSE'S LIFE (Old House step 1): every frame, the walls between the
// camera and the cat sink (housewalls.js), and the levels are drawn for where she
// stands (houselevels.js). house.js hands it to the walk as areaData.life; main.js
// calls update(dt, t, cat.position, camera) after player.update, so the sink sees
// this frame's camera.
//
// A section mesh's origin is at its base (houseparts.js sectionMesh), so scale.y is
// its standing fraction. At 0 (a lintel sunk to nothing) the mesh is hidden: a
// scale of 0 would leave a flat dark sheet over the doorway (ruling R11). A pane
// shows only while its section stands at least SINK.paneHide (ruling H1), and
// sinks with its wall (scaled about the wall's base, like the wall), so it never
// hangs in the air above a wall on its way down or up.
// settle(catPos, camera) is the start of a walk (final fix F1): walk.js calls it
// once she and the camera are placed, before the Ready (or Welcome back) card,
// so the first picture already has the walls between the camera and her down
// and her own level drawn in full; nothing eases. The first update settles
// too if nothing has (a backstop). update and settle allocate nothing.
// The cellar's lid (owner's fix B, housewalls.js createCellarLid): looked at
// before the sink each frame, so the cut-away leaves the walls under it standing
// while it is on; drawn after it, hidden whenever she is down there or it would
// stand between the camera and her.
// Step 2 (Task 6): the six discoveries (housefinds.js) run here, and then the yarn
// ball is kept out of the walls (ruling D14): toy.update reads no colliders, so a
// ball that crossed a wall line since last frame (housethings.js toyStop; the shut
// bookcase is a wall, the open one is not) is put back at the wall, at rest. A step
// longer than any roll (TELEPORT) is a jump the walk made (the roll home, a co-walk
// handoff), never stopped. Task 7: the clock's tick and the creaks (housesound.js, under the
// walk's mute) and the sunbeams with their dust motes (houseair.js: none at `dusk`, still
// under reduced motion), drawn for the levels in full. `colliders` is the walk's own live list (the bookcase's
// row swaps in it); `log`, `audio` and `toy` are the walk's.
// Task 10 (from the pictures): the furniture's fade hold. The tree fade (treefade.js) fades a
// piece when its line from the camera, run on PAST_LOOK beyond her, passes it, so a piece
// just beyond her faded: the piano when she stood on its keys, the clock as she stood at it,
// a bookcase she faced. Each fading piece (house.fading) is held solid (fadeHold) unless the
// line from the camera to her look point meets its box, or, seen from above, the line from
// the camera to her (stopped HOLD_SHY short of her middle, so a piece at her back is not in
// the way) passes within HOLD_PAD of its footprint, or the camera stands over it: then the
// tree fade decides as before. The box test is the one that counts when she stands just off a
// piece's corner and the line grazes it within HOLD_SHY of her (review). The secret bookcase's leaf,
// which turns, is housefinds.js's.
// Rough edges 1 and 2: the ledges' guards (houseguards.js) in the walk's live colliders, the feet
// round every ledge piece while she is on the floor, a top's own set while she is on it, built
// for her cat's size once she is first seen (her cat is the scene's object at her position).
// Step 4 (W7): on a walk with the door home (house.parts.frontDoor), the front door's two
// leaves swing out onto the lawn by FRONT_DOOR_OPEN over FRONT_DOOR_S (at once under reduced
// motion) once she is within FRONT_DOOR_NEAR of it, and shut once she is past FRONT_DOOR_FAR.
// They swing beyond the house's bounds, so never through her: no collider. A local look:
// nothing sent, no stream. settle (a walk's start) sets it as she stands, with no swing.
// Task 6 (W12, W13): update's fifth argument is the walk's session (main.js); on a co-walk its
// partners (session.remotes.list) are watched by the finds and the front door too, and each
// frame every partner's name tag draws over the walls (no depth test, at HOUSE_TAG_ORDER), so
// she is seen wherever she is in the house. dispose puts back what each tag had. The walls
// still sink, and the levels are drawn, for this child's cat alone.

import { makeView, createWallSink, createCellarLid, SINK } from '../housewalls.js';
import { createLevelDrawing } from '../houselevels.js';
import { CAT_LOOK_Y } from '../cat/model.js';
import { createHouseFinds, HOLD_PAD } from './housefinds.js';
import { segmentHitsBox } from '../treefade.js';
import { toyStop, HOUSE_FINDS } from './housethings.js';
import { HOUSE_WINDOWS, HOUSE_ROOMS, HOUSE_STAIRS, HOUSE_FRONT_DOOR } from './houseplan.js';
import { createHouseSound } from './housesound.js';
import { createHouseAir } from './houseair.js';
import { createLedgeGuards, catScale } from './houseguards.js';

const NO_PANES = Object.freeze([]);
const NO_FADING = Object.freeze([]);
const NONE = Object.freeze([]);
// A partner's name tag: drawn after everything see-through in the house (panes and faded
// furniture 0, dust 2, slash 5), over its walls, but before chat bubbles (order 10):
// fitBubbleOnRender (nametag.js) reads the tag's matrixWorld, so the tag must draw first.
export const HOUSE_TAG_ORDER = 9;
export const HOLD_SHY = 0.3; // m: the line stops this short of her middle (her body), toward the camera

// Whether the segment a-b, seen from above, meets the rectangle grown by pad (slab clipping).
export function segmentNearRect(ax, az, bx, bz, r, pad) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const k = q / p;
    if (p < 0) { if (k > t1) return false; if (k > t0) t0 = k; } else { if (k < t0) return false; if (k < t1) t1 = k; }
    return true;
  };
  return clip(-dx, ax - (r.minX - pad)) && clip(dx, r.maxX + pad - ax)
    && clip(-dz, az - (r.minZ - pad)) && clip(dz, r.maxZ + pad - az) && t0 <= t1;
}
export const FRONT_DOOR_NEAR = 2.4; // m from the door: it opens
export const FRONT_DOOR_FAR = 2.9; // m: it shuts once she is further
export const FRONT_DOOR_OPEN = 1.2; // rad each leaf turns, out onto the lawn
export const FRONT_DOOR_S = 0.4; // s to swing

// The front door's swing (null pivots: a door that never opens).
function createFrontDoor(door, reducedMotion) {
  let open = false;
  let k = 0; // 0 shut .. 1 open
  const turn = () => {
    if (!door) return;
    const a = FRONT_DOOR_OPEN * k * k * (3 - 2 * k); // eased
    door.left.rotation.y = -a; // the west leaf's meeting edge swings south
    door.right.rotation.y = a;
  };
  const from = (p) => Math.hypot(p.x - HOUSE_FRONT_DOOR.x, p.z - HOUSE_FRONT_DOOR.z);
  // the nearest cat: hers, or a partner's
  const near = (p, partners = NONE) => {
    if (!door) return;
    let d = from(p);
    for (let i = 0; i < partners.length; i++) d = Math.min(d, from(partners[i].group.position));
    if (d <= FRONT_DOOR_NEAR) open = true;
    else if (d > FRONT_DOOR_FAR) open = false;
  };
  return {
    get open() { return open; },
    settle(p) { near(p); k = open ? 1 : 0; turn(); },
    update(dt, p, partners) {
      near(p, partners);
      const step = reducedMotion ? 1 : dt / FRONT_DOOR_S;
      k = open ? Math.min(1, k + step) : Math.max(0, k - step);
      turn();
    },
    dispose() { k = 0; turn(); },
  };
}
const TELEPORT = 25; // m/s: no ball rolls this fast
const OPEN = Object.freeze({ secretOpen: true });
const SHUT = Object.freeze({ secretOpen: false });

export function createHouseLife(scene, house, {
  reducedMotion = false, log = null, audio = null, toy = null, colliders = [], now, dusk = false,
} = {}) {
  const { sections, sectionMeshes, panes } = house;
  const lid = house.lid ? createCellarLid(house.lid, sections) : null;
  const lidMeshes = lid ? house.lidMeshes ?? [] : [];
  const sink = createWallSink(sections, { reducedMotion, covers: lid ? lid.covers : null });
  const drawing = createLevelDrawing(scene, { levels: house.levels, links: house.links, start: house.start });
  // step 2 (ruling D3): the levels are drawn for the floor under her, not her paws, so on
  // the wardrobe (4.45 m, nearer the attic's 4.2 than the bedroom's 2.4) she is still upstairs
  const floor = house.floor;
  const floorY = (p) => floor.y(p.x, p.z);
  const ids = sections.map((s) => s.id);
  const meshes = ids.map((id) => sectionMeshes.get(id) ?? null);
  const paneLists = ids.map((id) => panes.get(id) ?? NO_PANES);
  const bases = sections.map((s) => s.base);
  const paneRest = paneLists.map((list) => list.map((p) => p.position.y)); // each pane's standing height
  const view = {};
  let settled = false;
  const finds = createHouseFinds({
    finds: house.finds ?? [], secret: house.secret, colliders, parts: house.parts, log, audio, reducedMotion, now,
  });
  const sound = createHouseSound(audio, {
    clock: HOUSE_FINDS.find((f) => f.id === 'clock'),
    stairs: HOUSE_STAIRS,
    attic: HOUSE_ROOMS.find((r) => r.id === 'attic'),
  });
  const air = createHouseAir(scene, { windows: HOUSE_WINDOWS, rooms: HOUSE_ROOMS, levels: house.levels, dusk: !!dusk, reducedMotion });
  const guards = createLedgeGuards(colliders, floor);
  const frontDoor = createFrontDoor(house.parts?.frontDoor ?? null, reducedMotion);
  let sized = false;
  function guard(catPos) {
    if (!sized) { sized = true; guards.scale(catScale(scene, catPos)); }
    guards.update(catPos);
  }
  let ballX = 0, ballZ = 0, ballSeen = false;
  // the partners' name tags, over the walls; what each had first, for dispose
  const tagRest = new Map();
  let tagList = NONE;
  function tags(list) {
    if (list !== tagList) {
      tagList = list;
      for (const e of list) if (e.tag && !tagRest.has(e.tag)) tagRest.set(e.tag, [e.tag.material.depthTest, e.tag.renderOrder]);
    }
    for (let i = 0; i < list.length; i++) {
      const g = list[i].tag;
      if (g) { g.material.depthTest = false; g.renderOrder = HOUSE_TAG_ORDER; }
    }
  }
  const fading = house.fading ?? NO_FADING;

  // Each fading piece held solid unless it stands in the camera's line to her (see the top).
  const look = { x: 0, y: 0, z: 0 };
  function holdFades(catPos, cam) {
    look.x = catPos.x;
    look.y = catPos.y + CAT_LOOK_Y;
    look.z = catPos.z;
    const d = Math.hypot(cam.x - catPos.x, cam.z - catPos.z);
    const k = d > HOLD_SHY ? HOLD_SHY / d : 0;
    const ex = catPos.x + (cam.x - catPos.x) * k;
    const ez = catPos.z + (cam.z - catPos.z) * k;
    for (let i = 0; i < fading.length; i++) {
      const p = fading[i];
      p.obj.userData.fadeHold = !(segmentHitsBox(cam, look, p) || segmentNearRect(cam.x, cam.z, ex, ez, p, HOLD_PAD));
    }
  }

  // The yarn ball, after toy.update (main.js): stopped at a wall it rolled into since last frame.
  function keepBall(dt) {
    if (!toy?.active || toy.held) { ballSeen = false; return; }
    const p = toy.mesh.position;
    if (ballSeen && Math.hypot(p.x - ballX, p.z - ballZ) <= TELEPORT * Math.max(dt, 1 / 60)) {
      const stop = toyStop(ballX, ballZ, p.x, p.z, finds.open ? OPEN : SHUT);
      // set down on the floor under the stop (toy.setPosition lifts it onto any ledge): the
      // cellar and its stair are below the lawn, so a height of 0 had it fall from up there
      if (stop) { stop.y = floorY(stop); toy.setPosition(stop); }
    }
    ballSeen = true;
    ballX = p.x;
    ballZ = p.z;
  }

  // The meshes and the panes, as the sink stands now.
  function write() {
    for (let i = 0; i < ids.length; i++) {
      const f = sink.fraction(ids[i]);
      const m = meshes[i];
      if (m) {
        m.scale.y = f;
        m.visible = f > 0;
        if (m.userData.decoMat) m.userData.decoMat.visible = f > 0.95; // pictures and curtains would squash to strips
      }
      const list = paneLists[i];
      for (let k = 0; k < list.length; k++) {
        const p = list[k];
        p.visible = f >= SINK.paneHide;
        p.scale.y = f;
        p.position.y = bases[i] + (paneRest[i][k] - bases[i]) * f;
      }
    }
    for (let i = 0; i < lidMeshes.length; i++) lidMeshes[i].visible = lid.shown;
  }

  function settle(catPos, camera) {
    settled = true;
    makeView(catPos, camera.position, CAT_LOOK_Y, view);
    lid?.look(view);
    sink.settle(view);
    lid?.settle(sink);
    write();
    drawing.settle(floorY(catPos));
    air.update(0, 0, drawing.full);
    holdFades(catPos, camera.position);
    guard(catPos);
    frontDoor.settle(catPos);
  }

  return {
    sink,
    drawing,
    lid,
    finds,
    settle,
    get frontDoorOpen() { return frontDoor.open; },
    update(dt, t, catPos, camera, session) {
      const partners = session?.remotes?.list ?? NONE;
      tags(partners);
      if (!settled) { settle(catPos, camera); return; }
      makeView(catPos, camera.position, CAT_LOOK_Y, view);
      lid?.look(view);
      sink.update(dt, view);
      lid?.update(dt, sink);
      write();
      drawing.update(floorY(catPos));
      air.update(dt, t, drawing.full);
      finds.update(dt, t, catPos, camera.position, partners); // after the camera's move: the bookcase's fade hold
      holdFades(catPos, camera.position);
      sound.update(dt, t, catPos);
      keepBall(dt);
      guard(catPos);
      frontDoor.update(dt, catPos, partners);
    },
    guards,
    dispose() {
      tagRest.forEach((r, g) => { g.material.depthTest = r[0]; g.renderOrder = r[1]; });
      frontDoor.dispose();
      guards.dispose();
      finds.dispose();
      sound.dispose();
      air.dispose();
      for (const p of fading) p.obj.userData.fadeHold = false;
      for (const m of lidMeshes) m.visible = true;
      for (const m of meshes) {
        if (!m) continue;
        m.scale.y = 1;
        m.visible = true;
      }
      paneLists.forEach((list, i) => list.forEach((p, k) => {
        p.visible = true;
        p.scale.y = 1;
        p.position.y = paneRest[i][k];
      }));
      scene.traverse((o) => {
        if (o.userData.houseDetail || o.userData.houseSimple) o.visible = true;
      });
    },
  };
}
