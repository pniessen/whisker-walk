// THE OLD HOUSE'S LIFE (Old House step 1): every frame, the walls between the
// camera and the cat sink (housewalls.js), and the levels are drawn for where she
// stands (houselevels.js). house.js hands it to the walk as areaData.life; main.js
// calls update(dt, t, cat.position, camera) after player.update, so the sink sees
// this frame's camera.
//
// A section mesh's origin is at its base (houseparts.js sectionMesh), so scale.y is
// its standing fraction. At 0 (a lintel sunk to nothing) the mesh is hidden: a
// scale of 0 would leave a flat dark sheet over the doorway (ruling R11). A pane
// shows only while its section stands at least SINK.paneHide (ruling H1).
// update allocates nothing.

import { makeView, createWallSink, SINK } from '../housewalls.js';
import { createLevelDrawing } from '../houselevels.js';
import { CAT_LOOK_Y } from '../cat/model.js';

const NO_PANES = Object.freeze([]);

export function createHouseLife(scene, house, { reducedMotion = false } = {}) {
  const { sections, sectionMeshes, panes } = house;
  const sink = createWallSink(sections, { reducedMotion });
  const drawing = createLevelDrawing(scene, { levels: house.levels, links: house.links, start: house.start });
  const ids = sections.map((s) => s.id);
  const meshes = ids.map((id) => sectionMeshes.get(id) ?? null);
  const paneLists = ids.map((id) => panes.get(id) ?? NO_PANES);
  const view = {};

  return {
    sink,
    drawing,
    update(dt, t, catPos, camera) {
      makeView(catPos, camera.position, CAT_LOOK_Y, view);
      sink.update(dt, view);
      for (let i = 0; i < ids.length; i++) {
        const f = sink.fraction(ids[i]);
        const m = meshes[i];
        if (m) {
          m.scale.y = f;
          m.visible = f > 0;
        }
        const list = paneLists[i];
        for (let k = 0; k < list.length; k++) list[k].visible = f >= SINK.paneHide;
      }
      drawing.update(catPos.y);
    },
    dispose() {
      for (const m of meshes) {
        if (!m) continue;
        m.scale.y = 1;
        m.visible = true;
      }
      for (const list of paneLists) for (const p of list) p.visible = true;
      scene.traverse((o) => {
        if (o.userData.houseDetail || o.userData.houseSimple) o.visible = true;
      });
    },
  };
}
