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
// handoff), never stopped. `colliders` is the walk's own live list (the bookcase's
// row swaps in it); `log`, `hud`, `audio` and `toy` are the walk's.

import { makeView, createWallSink, createCellarLid, SINK } from '../housewalls.js';
import { createLevelDrawing } from '../houselevels.js';
import { CAT_LOOK_Y } from '../cat/model.js';
import { createHouseFinds } from './housefinds.js';
import { toyStop } from './housethings.js';

const NO_PANES = Object.freeze([]);
const TELEPORT = 25; // m/s: no ball rolls this fast
const OPEN = Object.freeze({ secretOpen: true });
const SHUT = Object.freeze({ secretOpen: false });

export function createHouseLife(scene, house, {
  reducedMotion = false, log = null, hud = null, audio = null, toy = null, colliders = [], now,
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
    finds: house.finds ?? [], secret: house.secret, colliders, parts: house.parts, log, hud, audio, reducedMotion, now,
  });
  let ballX = 0, ballZ = 0, ballSeen = false;

  // The yarn ball, after toy.update (main.js): stopped at a wall it rolled into since last frame.
  function keepBall(dt) {
    if (!toy?.active || toy.held) { ballSeen = false; return; }
    const p = toy.mesh.position;
    if (ballSeen && Math.hypot(p.x - ballX, p.z - ballZ) <= TELEPORT * Math.max(dt, 1 / 60)) {
      const stop = toyStop(ballX, ballZ, p.x, p.z, finds.open ? OPEN : SHUT);
      if (stop) toy.setPosition({ x: stop.x, y: 0, z: stop.z });
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
  }

  return {
    sink,
    drawing,
    lid,
    finds,
    settle,
    update(dt, t, catPos, camera) {
      if (!settled) { settle(catPos, camera); return; }
      makeView(catPos, camera.position, CAT_LOOK_Y, view);
      lid?.look(view);
      sink.update(dt, view);
      lid?.update(dt, sink);
      write();
      drawing.update(floorY(catPos));
      finds.update(dt, t, catPos);
      keepBall(dt);
    },
    dispose() {
      finds.dispose();
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
