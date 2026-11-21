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

import { makeView, createWallSink, createCellarLid, SINK } from '../housewalls.js';
import { createLevelDrawing } from '../houselevels.js';
import { CAT_LOOK_Y } from '../cat/model.js';

const NO_PANES = Object.freeze([]);

export function createHouseLife(scene, house, { reducedMotion = false } = {}) {
  const { sections, sectionMeshes, panes } = house;
  const lid = house.lid ? createCellarLid(house.lid, sections) : null;
  const lidMeshes = lid ? house.lidMeshes ?? [] : [];
  const sink = createWallSink(sections, { reducedMotion, covers: lid ? lid.covers : null });
  const drawing = createLevelDrawing(scene, { levels: house.levels, links: house.links, start: house.start });
  const ids = sections.map((s) => s.id);
  const meshes = ids.map((id) => sectionMeshes.get(id) ?? null);
  const paneLists = ids.map((id) => panes.get(id) ?? NO_PANES);
  const bases = sections.map((s) => s.base);
  const paneRest = paneLists.map((list) => list.map((p) => p.position.y)); // each pane's standing height
  const view = {};
  let settled = false;

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
    drawing.settle(catPos.y);
  }

  return {
    sink,
    drawing,
    lid,
    settle,
    update(dt, t, catPos, camera) {
      if (!settled) { settle(catPos, camera); return; }
      makeView(catPos, camera.position, CAT_LOOK_Y, view);
      lid?.look(view);
      sink.update(dt, view);
      lid?.update(dt, sink);
      write();
      drawing.update(catPos.y);
    },
    dispose() {
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
