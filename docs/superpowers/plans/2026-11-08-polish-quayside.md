# polish-quayside (Pass 8, build 8-6)

Survey 8 ranked #6, #7, #8 and broken #4, #5, #6: the Docks skyline sheds and
barges, the neighbourhood car, the Park fountain glare, the Seaside huts at
dusk, and the pink wedge at the Docks quay on the phone.

Rules held: render-only, flat trace unchanged, waterlooks BUILD_DRAWS unchanged
(every new mesh, geometry and material is made inside withLocalUuids; the
shipped constructor calls stay in their shipped order and only get their
geometry swapped), bounding boxes of the car and the barge unchanged to the
millimetre (contact shadows and caster classes), caps held.

## Tasks
1. **Skyline sheds** (docksdressing.js `warehouseParts`, `windows`): walls in
   0.6 m brick courses by vertex colour, a darker plinth (cut round the door
   and the culvert), string courses between floors, a cornice band, framed
   windows with a glazing bar and a sill, a planked loading door in one of the
   quay warehouses' door paints under a proud lintel, a gutter and a
   downpipe. Door capped at 2.7 m so the string course clears it.
2. **The fish shed's door** (builder.js `warehouse()`, two lines; and
   warehouselook.js's cornice cut, one line): a 1.8 m shed had a 2.2 m door
   and lintel standing past its roof. The door is squashed to h - 0.4 (scale,
   no new box) and the cornice runs over it whole.
3. **Barges** (builder.js `barge()`): a lofted hull with a bluff round bow and
   a round stern, a rubbing strake, a deck, a cream coachline, a wheelhouse
   with windows on the cabin's aft end, cabin windows, red roofs, life rings,
   a foredeck rail and bollards; the stack moves forward onto the cabin roof.
4. **The car** (builder.js `car()`): an extruded, bevelled side profile
   (nose, bonnet, waist, boot, two wheel arches), a glass greenhouse with
   pillars and a roof, mirrors, bumpers and grille, headlamps and tail lamps;
   paint a little rougher (0.5) so the bonnet stops blooming white. The roof
   stays flat at 1.425 from z 0.45 to -0.95, because the car roof is a perch
   and the knockable cup stands on it. +1 draw per car (tyres and trim merge).
5. **Fountain** (parkfountain.js `FOUNTAIN_STONE`, `fountainWaterMaterial`,
   used by park.js): the stone a warm mid grey 0x9e978c at roughness 0.95
   instead of near-white 0xb8b8c0 at 0.8; both pools' water a
   MeshPhysicalMaterial with specularIntensity 0.3. The white blaze was the
   sun's grazing-angle reflection on the basin water spread by bloom (a
   rougher water only made it wider). No geometry, one material per mesh.
6. **Seaside huts at dusk** (seaside.js; render/dusk.js gains an opt-in
   per-mesh `userData.duskLawnTint`): the band's edge dressing (huts, chair,
   marram) takes a greyer, darker, cooler dusk tint.
7. **The pink wedge** (race.js, three lines): it is the race ring's candy hoop
   at the camera. The near fade measured the camera to the ring's centre, so a
   camera 2 m from the centre and a hand's breadth from the rim kept the hoop
   solid. It now takes the nearer of the centre and the hoop.

Tests: car/barge bounding boxes, skyline detail, fountain stone, dusk
per-mesh tint, race rim fade; full suite + build; flat trace sha.
