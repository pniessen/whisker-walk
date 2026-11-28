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
// still sink, and the levels are drawn, for this child's cat alone; except in couch play (a
// partner marked `local`, src/coop/second.js), where the one camera shows both cats: the walls
// sink for either and the levels either stands on are drawn (M5(d)).

import * as THREE from 'three';
import { makeView, createWallSink, createCellarLid, SINK } from '../housewalls.js';
import { createLevelDrawing } from '../houselevels.js';
import { CAT_LOOK_Y } from '../cat/model.js';
import { createHouseFinds, HOLD_PAD } from './housefinds.js';
import { ST } from './housestages.js'; // the wing's discoveries' life and the sun's colours (the lazy wing stage, housestagewing.js), and the glow, sound, air and stories (the lazy story stage, housestagestory.js)
import { segmentHitsBox } from '../treefade.js';
import { toyStop, HOUSE_FINDS } from './housethings.js';
import { OLD_HOUSE_PLAN, SECRET_WARDROBE } from './houseplan.js';
import { hash01 } from './builder.js';
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
function createFrontDoor(door, reducedMotion, HOUSE_FRONT_DOOR) {
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
// which of the two secret doors stand open (the library's bookcase, the kids' wardrobe), as toyStop reads them
const DOORS = [false, true].map((a) => [false, true].map((b) => Object.freeze({ secretOpen: a, wardrobeOpen: b })));

export function createHouseLife(scene, house, {
  reducedMotion = false, log = null, audio = null, toy = null, colliders = [], now, dusk = false, tier = null, rain = null, sun = null, fill = null,
} = {}) {
  const { sections, sectionMeshes, panes } = house;
  const P = house.plan ?? OLD_HOUSE_PLAN; // the plan this house was built from (house.js)
  const lid = house.lid ? createCellarLid(house.lid, sections) : null;
  const lidMeshes = lid ? house.lidMeshes ?? [] : [];
  const sink = createWallSink(sections, { reducedMotion, covers: lid ? lid.covers : null });
  const drawing = createLevelDrawing(scene, { levels: house.levels, links: house.links, start: house.start, wing: house.wing ?? null, joinOpen: () => wingFinds.open });
  // step 2 (ruling D3): the levels are drawn for the floor under her, not her paws, so on
  // the wardrobe (4.45 m, nearer the attic's 4.2 than the bedroom's 2.4) she is still upstairs
  const floor = house.floor;
  const floorY = (p) => floor.y(p.x, p.z);
  const ids = sections.map((s) => s.id);
  const meshes = ids.map((id) => sectionMeshes.get(id) ?? null);
  const paneLists = ids.map((id) => panes.get(id) ?? NO_PANES);
  const bases = sections.map((s) => s.base);
  const paneRest = paneLists.map((list) => list.map((p) => p.position.y)); // each pane's standing height
  const paneZone = paneLists.map((list) => list.map((p) => p.userData.paneZone ?? null)); // a wing pane is shown with its zone
  const view = {};
  const view2 = {}, pos2 = { x: 0, y: 0, z: 0 }; // couch play's second cat: its own view of the same camera, and its floor
  const second = (partners) => { for (let i = 0; i < partners.length; i++) if (partners[i].local && partners[i].group) return partners[i].group.position; return null; };
  let settled = false;
  const finds = createHouseFinds({
    finds: house.finds ?? [], secret: house.secret, colliders, parts: house.parts, log, audio, reducedMotion, now,
  });
  // the east wing's discoveries and its sunny slots (milestone 2): the slots' light is gold by day and pale blue at dusk
  const wingFinds = ST.wing.createFinds({ finds: house.wingFinds ?? [], slots: house.wingSlots ?? [], log, audio, reducedMotion, wardrobe: house.wardrobe ?? null, colliders, wonder: house.wonder ?? null, reveal: house.reveal ?? null });
  const lightUnder = house.wonder?.lightUnder ?? null;
  const sunMat = house.sun?.material ?? null;
  const sunColour = dusk ? ST.wing.sunDusk : ST.wing.sunDay;
  const paintSun = (t) => {
    if (!sunMat) return;
    const k = wingFinds.pulse(t);
    sunMat.color.setRGB(sunColour[0] * k, sunColour[1] * k, sunColour[2] * k);
  };
  paintSun(0);
  // beauty pass 3: the day's light by the clock (`now`, else the device's), and a rainy day (`rain` true or false from the picture page; null: about one day in four, by the date).
  // Indoors the walk rolls no weather (indoor.js), so the house keeps its own.
  const glowLive = P === OLD_HOUSE_PLAN && !!house.glow;
  const LIT = new THREE.Color();
  const clockNow = () => (now ? now() : new Date());
  const part = ST.story.dayPart(12);
  let partIn = 0;
  const rainy = rain !== null && rain !== undefined ? !!rain : (() => { const d = clockNow(); return hash01(d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate(), 5, 0x4a11) < 0.25; })();
  const rainK = rainy ? 1 : 0;
  // the real lights take the day's colour too (the walk's own sun and fill, put back at dispose); a dusk walk keeps its own look
  const envBase = scene.environmentIntensity;
  const lights = !dusk && glowLive ? [sun, fill].filter(Boolean).map((l) => ({ l, c: l.color.clone(), g: l.groundColor ? l.groundColor.clone() : null })) : [];
  const retone = () => {
    const d = clockNow();
    ST.story.dayPart(d.getHours() + d.getMinutes() / 60, part);
    if (lights.length && typeof envBase === 'number') scene.environmentIntensity = envBase * part.env;
    for (const x of lights) { x.l.color.copy(x.c).multiply(LIT.fromArray(part.lit)); if (x.g) x.l.groundColor.copy(x.g).multiply(LIT); }
    air.setTone?.(part.sun, dusk ? 1 : part.sunK * (1 - 0.5 * rainK));
  };
  const WOOD = new Set(['hall', 'library', 'parlour', 'bedroom', 'attic', 'livingroom', 'kids']);
  const sound = ST.story.createHouseSound(audio, {
    wood: P === OLD_HOUSE_PLAN ? P.rooms.filter((r) => WOOD.has(r.id)) : null,
    rain: rainy && P === OLD_HOUSE_PLAN,
    part: P === OLD_HOUSE_PLAN && !dusk ? part : null,
    clock: (P === OLD_HOUSE_PLAN ? HOUSE_FINDS : house.finds ?? []).find((f) => f.id === 'clock') ?? null,
    stairs: P.stairs,
    attic: P.rooms.find((r) => r.id === 'attic') ?? null,
    fire: P === OLD_HOUSE_PLAN ? { x: ST.story.FIRE.x, z: ST.story.FIRE.z } : null,
  });
  const air = ST.story.createHouseAir(scene, { windows: P.windows, rooms: P.rooms, levels: house.levels, dusk: !!dusk, reducedMotion });
  retone();
  // beauty pass 2 (houseglow.js): the light, firelight, curtains and garden sway are one shader patch on the house's material; LOW and LITE hold the flicker and sway still
  const glow = house.glow ?? null;
  const low = !!tier && (tier.name === 'low' || tier.name === 'lite' || tier.shadows === false || (tier.rung ?? 0) >= 3);
  // beauty pass 4 (housestories.js): the season by the date, and the rare surprises (the music box, the cuckoo, the old house's ghost cat)
  const day0 = clockNow();
  const surprises = glowLive ? ST.story.createSurprises({ scene, audio, reducedMotion, low, dayKey: day0.getFullYear() * 400 + day0.getMonth() * 31 + day0.getDate(), floorY: (x, z) => floor.y(x, z) }) : null;
  const glowOpts = { still: reducedMotion, dusk: !!dusk, low, part: dusk ? null : part, rain: rainK, burst: 0, energy: 0, season: ST.story.seasonOf(day0), box: 0, cuckoo: 0 };
  let ex = 0, ez = 0, eSeen = false, energy = 0; // her walking, as a smoothed 0..1 (the paws' dust and the curtains' swell)
  const guards = createLedgeGuards(colliders, floor);
  const frontDoor = createFrontDoor(house.parts?.frontDoor ?? null, reducedMotion, P.frontDoor);
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
      const stop = toyStop(ballX, ballZ, p.x, p.z, DOORS[finds.open ? 1 : 0][wingFinds.open ? 1 : 0]);
      // set down on the floor under the stop (toy.setPosition lifts it onto any ledge): the
      // cellar and its stair are below the lawn, so a height of 0 had it fall from up there
      if (stop) { stop.y = floorY(stop); toy.setPosition(stop); }
    }
    ballSeen = true;
    ballX = p.x;
    ballZ = p.z;
  }

  const at2 = (p) => { pos2.x = p.x; pos2.y = floorY(p); pos2.z = p.z; return pos2; };
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
        p.visible = f >= SINK.paneHide && (paneZone[i][k] === null || drawing.full.has(paneZone[i][k]));
        p.scale.y = f;
        p.position.y = bases[i] + (paneRest[i][k] - bases[i]) * f;
      }
    }
    for (let i = 0; i < lidMeshes.length; i++) lidMeshes[i].visible = lid.shown;
  }

  function settle(catPos, camera, two = null) {
    settled = true;
    makeView(catPos, camera.position, CAT_LOOK_Y, view);
    const v2 = two ? makeView(two, camera.position, CAT_LOOK_Y, view2) : null;
    lid?.look(view, v2);
    sink.settle(view, v2);
    lid?.settle(sink);
    drawing.settle(floorY(catPos), catPos.x, catPos.z, camera.position.x, camera.position.z, two && at2(two));
    write();
    air.update(0, 0, drawing.full);
    glow?.update(0, catPos, glowOpts);
    holdFades(catPos, camera.position);
    guard(catPos);
    frontDoor.settle(catPos);
  }

  return {
    sink,
    drawing,
    lid,
    finds,
    wingFinds,
    settle,
    get frontDoorOpen() { return frontDoor.open; },
    /** a surprise on demand (the picture page and tests): 'box', 'cuckoo' or 'ghost', `age` seconds in. */
    surprise(which, age = 0) { return surprises ? surprises.start(which, age) : false; },
    get surprising() { return surprises ? surprises.active : null; },
    /** her pace now as a share of her walk: the crinkly tunnel slows her (avatar.js reads it). */
    get pace() { return wingFinds.pace; },
    update(dt, t, catPos, camera, session) {
      const partners = session?.remotes?.list ?? NONE;
      tags(partners);
      const two = second(partners);
      if (!settled) { settle(catPos, camera, two); return; }
      makeView(catPos, camera.position, CAT_LOOK_Y, view);
      const v2 = two ? makeView(two, camera.position, CAT_LOOK_Y, view2) : null; // couch play: the walls sink, and the levels draw, for BOTH cats
      lid?.look(view, v2);
      sink.update(dt, view, v2);
      lid?.update(dt, sink);
      drawing.update(floorY(catPos), catPos.x, catPos.z, camera.position.x, camera.position.z, two && at2(two));
      write();
      const stepM = eSeen ? Math.hypot(catPos.x - ex, catPos.z - ez) : 0;
      ex = catPos.x; ez = catPos.z; eSeen = true;
      energy += ((dt > 0 && stepM < 3 ? Math.min(1, stepM / dt / 3.5) : 0) - energy) * Math.min(1, dt * 6);
      glowOpts.energy = low || reducedMotion ? 0 : energy;
      glowOpts.burst = sound.burst;
      partIn -= dt;
      if (partIn <= 0) { partIn = 5; retone(); }
      air.update(dt, t, drawing.full, catPos, glowOpts.energy);
      if (surprises) { const o = surprises.update(dt, catPos, drawing.full); glowOpts.box = o.box; glowOpts.cuckoo = o.cuckoo; }
      glow?.update(t, catPos, glowOpts);
      finds.update(dt, t, catPos, camera.position, partners); // after the camera's move: the bookcase's fade hold
      wingFinds.update(dt, t, catPos, partners, camera.position);
      if (lightUnder) lightUnder.visible = dusk && !wingFinds.open && drawing.full.has('kids') && Math.hypot(catPos.x - SECRET_WARDROBE.x, catPos.z - SECRET_WARDROBE.z) < 12; // the faint light under the shut wardrobe's doors
      air.setCalm?.(wingFinds.calm);
      paintSun(t);
      holdFades(catPos, camera.position);
      sound.update(dt, t, catPos, wingFinds.calm);
      keepBall(dt);
      guard(catPos);
      frontDoor.update(dt, catPos, partners);
    },
    guards,
    dispose() {
      tagRest.forEach((r, g) => { g.material.depthTest = r[0]; g.renderOrder = r[1]; });
      frontDoor.dispose();
      if (lights.length && typeof envBase === 'number') scene.environmentIntensity = envBase;
      for (const x of lights) { x.l.color.copy(x.c); if (x.g) x.l.groundColor.copy(x.g); }
      guards.dispose();
      finds.dispose();
      wingFinds.dispose();
      sound.dispose();
      surprises?.dispose();
      air.dispose();
      for (const p of fading) p.obj.userData.fadeHold = false;
      for (const m of lidMeshes) m.visible = true;
      if (lightUnder) lightUnder.visible = false;
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
