# Lifelike people: a jointed figure for every Twoleg (design, 2026-11-20)

## Intent

The owner, playtesting the Fairground on 2026-11-20: "can we make the humans
more lifelike (very blocky now)". Every person in the game is one box-and-ball
figure, `buildTwolegFigure` in `src/critters.js`. The cats beside them are now
quite lifelike (`src/cat/`), so the people look like a different, older game.

This build gives every person a body like the cats have: shaped limbs with
elbows and knees, a neck, rounded shoulders, hands, hair and a simple face,
built in code, moving on joints. Standing people shift their weight and turn
to look at the cat; walking people stride and swing their arms; a wave is a
real wave. Each person is someone different: their spot in the world decides
their age, height, clothes and hair.

Players: a girl of 11 (she loves Warrior Cats) and a boy of 9, and soon the
public. In the Clan Edition these people are "Twolegs"; this work is about
looks and movement only and changes no words.

## The owner's decisions (2026-11-20)

1. **Real proportions.** Proper legs and arms with elbows and knees, rounded
   shoulders, a neck, hands, hair and simple faces, still low-poly. They should
   come closest to the cats. They walk with a real stride and swing their arms
   wherever they walk today.
2. **A jointed figure built in code, like the cats.** Shaped limbs; shoulder,
   elbow, hip and knee joints; hands, hair and faces. Small idle movements:
   weight shifts, turning to look at the cat, a real wave. Simpler built faces
   for distant people, so old iPads stay smooth. Each person gets age, height,
   clothes and hair from their spot, so crowds vary.

## Pictures

The prototype (commit `eb24235b` on branch `people`, marked PROTOTYPE) is a
picture sheet, `verify-people.html`, drawing `prototype/people-figure.js` next
to today's figure with the game's own sun, fill, image light, shadows and
dusk. It is throwaway: nothing in the game imports it and no test covers it.
The pictures are in the session scratchpad,
`/private/tmp/claude-501/-Users-pniessen--claude-spares-spare-gcns3j/e37e3895-a9b0-4a89-9360-a15387ffb2e4/scratchpad/people/`.
Re-make them with the dev server on 5398:

```
npx vite --port 5398 --strictPort
node scripts/record-page.mjs --url "http://localhost:5398/verify-people.html" --out <dir> --shots lineup-day,lineup-cateye-day,stride-day,wave-cateye-day,crouch-cateye-day,lineup-sunset,wave-cateye-sunset,stride-sunset,far-day,lod-close,faces-day,back-day,crowd-spots
node scripts/record-page.mjs --url "http://localhost:5398/verify-people.html?scene=fair&fig=new" --out <dir>/fair-new --shots fair-day,fair-dusk,fair-close
node scripts/record-page.mjs --url "http://localhost:5398/verify-people.html?scene=fair&fig=old" --out <dir>/fair-old --shots fair-day,fair-dusk,fair-close
```

| Picture | What it shows |
|---|---|
| `lineup-day.png` | Today's figure, then a man (1.80 m), a woman (1.66 m), a child (1.30 m) and an older man (1.70 m), at the walk's normal camera, a tabby for scale |
| `lineup-cateye-day.png` | The same from her eye height (0.3 m); the people look down at her |
| `stride-day.png`, `stride-sunset.png` | Mid-stride, both steps, three-quarter view |
| `wave-cateye-day.png`, `wave-cateye-sunset.png` | The wave, from her eye height |
| `crouch-cateye-day.png` | The Fairground's hello as a kneel (today's figure squashes) |
| `lineup-sunset.png` | The walk's dusk light |
| `far-day.png`, `lod-close.png` | The far build, at 14 m and side by side with the near build |
| `faces-day.png` | Faces close up (closer than the game's camera comes) |
| `back-day.png` | From behind: hair, coats |
| `crowd-spots.png` | Eight people dressed only from their spawn spots |
| `fair-new/fair-day.png` vs `fair-old/fair-day.png` | The real Fairground midway with its visitors and the juggler, new figure and today's, day; also `fair-dusk.png` and `fair-close.png` (her eye height) |

## Recon: every person in the game today

`buildTwolegFigure(def)` makes a Group of three merged, vertex-coloured,
flat-shaded meshes: the body (legs, shoes, coat, scarf, the far arm), the head
(neck, head, two box eyes, a bobble hat, flat cap or hair) and the waving arm
on a shoulder pivot. 428 to 484 triangles, three draws, three materials. Its
look comes from `twolegLook(def)`, a hash of the spawn spot: coat, scarf,
trousers, skin, hat or hair. Every figure is the same height and shape.

| Where | Who, how many | Where they stand | What they do |
|---|---|---|---|
| Neighborhood | 2 villagers | (-16, 12), (14, 34) | Stand still. Wave when the cat is within 5 m, or for 1.5 s after a meow within range or something knocked over within 8 m (`dismayNear`). "E: get head scratches" within 2.2 m (purr, no movement). The first villager is the quest giver (`walk.js` 970). Journal entry "villager". |
| Park | 2 villagers | (4, 27) standing off to (5.5, 25.6); (-8, -22) | As above |
| Docks | 2 villagers | (14, 7), (-10, -8) | As above |
| Seaside | 2 villagers | (18, 16), (32, -10) | As above |
| Fairground | 8 visitors on the high tier (5, 3, never fewer than 2: `visitorCount(tier.strays)`), and the juggler | The midway and plaza loop (`visitorLoop`), 8 watch spots by the rides; the juggler behind the tents | Stroll (bob and an arm swing off `v.walked`), stop to watch a ride, give way to the cat, walk round her, say hello to a meow within 5 m by waving or crouching (`scale.y` squash). The juggler juggles three balls and drops one when she watches. |
| Farm, Rooftops, the six territories, the den | none | | The farmer is offstage (only his hat is in the game). |
| Market Square (designed, not built) | stallholders | | Will reuse the figure. |

There are no human riders on the Fairground rides; "riders" in the code are the
cat.

### What today's people cost

The ceilings in `test/budget.test.js` count each place's static build only;
critters and Fairground visitors are added by the walk and are not in those
numbers, so this build does not move them.

| | Draws per person | Triangles per person | Place total (draws, main + shadow) |
|---|---|---|---|
| Street villager (casts a shadow: the whole group is tall enough for `castsFromBox`) | 3 + 3 | 428-484 | 2 people: 6 + 6 draws, about 900 triangles a pass |
| Fairground visitor or juggler (cast none, contact shadow only) | 3 + 0 | 428-484 | 9 people: up to 27 draws, about 4,100 triangles |

## Goals

- At the walk's normal camera, a person reads as a person: legs that bend,
  arms that swing, a head on a neck, hair, and a face that is clearly friendly.
- From her eye height the people are tall, kind and calm.
- Crowds vary: tall and short, young and old, coats and t-shirts, bobs and
  ponytails, without a single roll.
- Fewer draws than today in every place, and the Fairground's busiest spot no
  heavier than today plus a few thousand triangles.

## Non-goals

- New behaviour: people do what they do today, only better. No new
  wandering, no new places for people.
- Words. "Twoleg", "villager" and the journal stay as they are.
- Clothing physics, cloth, hair that moves, fingers.
- A detailed human face, realistic skin, or eye whites.
- Changing the Fairground's visitor simulation (`src/fairvisitors.js`), its
  counts or its rules.

## Anti-goals

- **Nothing creepy.** No uncanny faces: no eye whites, no staring irises, no
  teeth, no realistic noses or lips. Dark dot eyes, taller than wide, with one
  small catchlight; soft brows whose outer ends dip a little; a small closed
  smile. The far build drops everything but the eyes.
- **Nothing that scares a 9-year-old.** No sudden moves, no fast turns of the
  head (turns ease over about half a second), no looming: a person never leans
  over the cat or reaches over her. No frowns, no angry poses; "dismay" is a
  surprised "oh!", never a scold.
- **No people at cat height crowding her.** People never stand where the cat
  is, never push her and never follow her (the Fairground's rule, kept). The
  kneel is a hello at their own spot: it reaches a hand out low and still and
  never brings the body nearer. No crouching child-height crowd around her.
- Nothing that makes the game slower on an old iPad.

## Constraints

- **The Math.random contract.** The real `Math.random` draws are pinned:
  building a villager takes exactly 41 (`test/critters.test.js`): one for its
  idle phase (`motionRng`, which falls back to `Math.random`), four for the
  critter's own Group's uuid, and 36 for the figure's nine uuid'd objects
  outside `withLocalUuids` (three meshes, three materials, three merged
  geometries). The area build counts elsewhere count them too.
- **The gameplay trace.** `test/fixtures/flat-trace.gameplay.json` records each
  critter Group's position and rotation (`pr(c.group)`), and must not move.
  The group never moves today; the figure inside it is placed only by
  `def.standOff`. The contact shadow decal follows the figure
  (`flat-trace.render.json`, re-recordable).
- **The look comes from the spot, never a roll.** Two co-walkers see the same
  person on the same spot.
- **The start-up script** is 896.3 of 900 kB gzip on main today. The figure
  code is about 7 kB gzip as the prototype stands (minified), more with the
  poses, LOD and look controller. The F6 build (branch `f6-lazy`, plan
  `docs/superpowers/plans/2026-11-20-f6-lazy-areas.md` there) makes each area
  a "pack" loaded before its walk (`src/world/areas.js`, `AREA_LOADERS` and
  `AREA_ENTRY_MODULES`; `src/game/areaload.js`; `startWalkWhenReady`), and
  measures start-up at about 640 kB, with a ceiling of about 100 kB per
  place's pack. F6's numbers are the baseline this build plans against.
- **The Fairground's own pins.** `test/fairgames.test.js` caps the show (people,
  balls, balloon, wisp) at 6,000 triangles (today 4,554 on the high tier) and
  the place plus the show at 75,000 (the place alone is 66,692). These hold
  (see "Performance").
- **Old iPads.** The scene is draw-call bound (`test/budget.test.js`'s notes):
  draws are the scarce thing, triangles nearly free.

## Approaches considered

| | How | Trade-off | |
|---|---|---|---|
| **A** | **A jointed figure built in code: shaped rigid parts (lathed limbs with rounded ends that overlap at elbow and knee, a lathed torso, a shaped head), each bound wholly to one of 17 joints, drawn as ONE rigidly skinned mesh per person** | Like the cats: built in code, tunable, no art pipeline. One draw per person whatever the pose. Joints read clearly at elbow and knee. Needs a little care where parts meet (the seat and thighs, the shoulders). | **chosen** (owner, decision 2) |
| B | A smooth skinned figure: one continuous skin with blended weights, modelled in a 3D tool or as a generated mesh, loaded as glTF | Smoothest bends; but a modelled asset and an import path the game has never had, weights to paint, larger downloads, and smooth, realistic humans are where the uncanny valley starts | not chosen |
| C | Shape only: a better-proportioned static figure with today's three-mesh rig (one arm moves) | Cheapest; but no knees, no stride, no real wave, no turning to look. Fails decision 1. | not chosen |

How A is drawn was its own choice:

| | How | Draws per person | |
|---|---|---|---|
| A1 | One mesh per part in a Group hierarchy (as the cat's parts are) | about 17 | too many: 9 people would add over 140 draws at the Fairground |
| **A2** | **Rigid skinning: one `SkinnedMesh`, every vertex weight 1 to one bone** | **1 (+1 shadow where people cast)** | **chosen**: fewer than today's 3 |
| A3 | One `InstancedMesh` per part kind across the whole place | about 14 per place, whatever the crowd | worse than A2 below 14 people; per-instance colour only, so multi-coloured parts split; revisit only if a place ever draws more than about 15 people at once |

## The figure (from the prototype; the builder may rebuild, the look is what is approved)

### Joints

`root` (feet, the figure's origin), `pelvis`, `chest`, `neck`, `head`, and per
side `upperArm`, `forearm`, `hand`, `thigh`, `shin`, `foot`: 17 bones, one
`Skeleton`. Pelvis, chest, neck and head turn in `YXZ` order so a look is a
yaw then a nod.

### Body, by kind

Heights: man 1.72-1.85 m, woman 1.60-1.73 m, child 1.16-1.42 m, older man
1.66-1.78 m, older woman 1.55-1.67 m; girth 0.94-1.08. Joints are fractions
of height (adult: knee 0.285, hip 0.525, waist 0.615, shoulder 0.815, chin
0.866; a child's head is a larger share, about one sixth of the height, and
the eyes sit lower in the face). Limb girths are a real person's (a thigh
about 55 cm round, a calf 37, an upper arm 30) plus a little for clothes:
thinner read as spindly beside the cats (the first pictures showed it).
Women are a little narrower at the shoulder and wider at the hip, with a
softly fuller chest; nothing more.

### Parts

Lathed limbs with rounded caps; a lathed pelvis (its seat tucked inside the
thighs' outer edge, or it reads as a nappy) and chest (rounded over the
shoulders to the neck); small deltoids; a neck; mitten hands with a thumb
(near build); rounded shoes, flat underneath; an egg-shaped head with a
softer jaw and ears (near build). Sleeves and shorts are separate short tubes
so their edges are crisp (vertex colours blur across a ring).

### Clothes and hair

Tops: t-shirt, jumper, coat (a flare to mid-thigh), dress (women). Bottoms:
trousers, shorts (children), skirt (knee length; longer for older women).
Flares are sized from the thighs' outer edge so a leg never pokes through.
Hair is a shell over the head whose hairline is held above the brows (hair
never covers the eyes, as today's test demands), from short, crop, bob, long,
ponytail, bun, pigtails, to a bald crown with a fringe round the back. Hats:
bobble, flat cap, sun hat. Glasses for most older people.

### The face

Near build: two dark eyes, taller than wide, each with a small white
catchlight; soft brows in a darker shade of the hair; a small nose a shade
darker than the skin; a small closed smile. Children's eyes are a little
larger and lower. Far build: the two eyes only. No eye whites, irises, teeth
or eyelids. Faces never change expression.

### Palettes

Five skin tones from light to dark brown; hair dark, black, brown, auburn,
blond (grey or white for older people); muted tops and bottoms for adults,
bright ones for children.

### Movement

- **Standing:** a slow weight shift (about every 6 s for adults; quicker and
  bigger for children, smaller for older people): the hips slide and tilt to
  the standing leg, the other knee softens, the chest counter-tilts; a
  breath; arms hang a little out and a little bent.
- **Looking at the cat:** when she is within 8 m, the head (45%), neck (37%)
  and chest (18%) share a turn of up to 75 degrees and a nod down toward her,
  eased; beyond that they look ahead.
- **Walking:** a stride driven by metres walked (one cycle is two steps of
  0.8 leg lengths, so feet do not skate); thighs swing 0.4 rad (0.3 for older
  people, 0.46 for children); the knee folds in the swing; feet roll heel to
  toe; arms swing against the legs; hips and chest counter-turn. The hips are
  lowered each frame until the lower foot (or a knee) is on the ground, so no
  foot floats.
- **Waving:** the right arm up and out, the elbow bent so the forearm stands
  up, the palm toward her, the forearm swinging from the elbow; the head tips
  a little.
- **The Fairground's crouch hello** becomes a kneel on one knee with one hand
  held out low and still, palm down, at the visitor's own spot.
- **The juggler:** both forearms forward, hands rising and falling with the
  balls.
- **Older people** stoop a little and stride shorter.

## Behaviour details (settled in the builder check; all my calls)

- **Who owns what.** `src/people/index.js` exports `createPeopleKit({ camera,
  reducedMotion, lodNear })`: one shared material, every person it builds, the
  LOD switch, and `dispose()` (both geometries of every person, the skeletons
  and their bone textures, the material). `createCritters` makes one kit per
  walk from `opts.people` and disposes it in a new `dispose()` the walk's end
  calls; `createFairShow` makes its own and disposes it in its `dispose()`.
  `opts.camera` is new on `createCritters`, as `createFairShow` already has it.
- **The LOD switch** reads the live rung each frame through `lodNear()` (12 m,
  7 m on the LOW rung and below, so reduced motion, which resolves to LOW, gets
  7 m). People outside the camera's view are not posed: each `SkinnedMesh` gets
  a fixed `boundingSphere` (centre at half height, radius 0.75 of the height)
  set on the mesh itself, which three's culling uses, and the kit tests the
  same sphere against the frustum. An off-screen person's shadow keeps its last
  pose; accepted.
- **Pose priority** (one wins, the change eases over 0.3 s): head-scratch kneel,
  then dismay "oh!", then the wave, then standing; walking (Fairground) is its
  own branch, and a visitor's hello stops its stride first. The look turn adds
  on top of whatever pose is on.
- **The head-scratch kneel** has its own timer: `critters.scratchHello(c)`
  (new) sets `c.kneelT = 2.5`, called where `interactions.js` handles the
  'scratch' prompt. The hand is held out at most 0.55 m in front of the
  person's own middle, low (0.35 m), palm down; it never moves toward her and
  never goes above her. Older people bow instead: the chest leans at most
  0.35 rad and the hand stays inside their own toes' line.
- **Dismay** gets its own field, `c.dismayT = 1.5`, set beside `meowWaveT` in
  `dismayNear`; `meowWaveT` keeps its timing, so nothing that plays changes.
- **The Fairground kneel** reaches at most 0.55 m in front of the visitor's
  middle; with `KEEP` 1.0 m the hand stays at least 0.45 m from her middle.
- **Looking at her:** villagers look at the local cat when she is within 8 m
  (never a co-walker's cat). The turn is clamped at 75 degrees; if she is more
  than 110 degrees round, the head eases back to ahead. Fairground visitors
  look at her only when stopped (watching or saying hello), never while
  walking.
- **Reduced motion:** no weight shift, no breathing, no wave swing (the arm
  stays up), look turns ease twice as slowly; walking keeps its stride (it is
  movement across the ground, as the Fairground's own reduced motion only
  stills the bob). `createCritters` gains `opts.reducedMotion`.
- **The juggler** is dressed by hand at a fixed 1.76 m; the balls keep today's
  paths; each hand's height follows the nearest ball in the cascade.
- **No allocation per frame** in the pose and LOD code (scratch vectors at
  module level), with a test that counts `Vector3` and `Matrix4` made during
  100 frames of posing.
- **The contact shadow** registers the figure in its rest pose (built standing,
  before the first `pose()`), so the decal's size is the same on every device.
- **Shadows of children:** a child villager below 1.3 m does not pass
  `castsFromBox` and casts no sun shadow; it keeps its contact shadow.
  Accepted.
- **The quest marker** sits 0.35 m above the giver's head
  (`look.height + 0.35`), not at a fixed 2.1 m. The quest giver is always an
  adult: if the first villager's spot gives a child, the giver is the first
  adult villager (every street place has one today; a test checks).
- **The crowd mix** is whatever the hash gives on today's spots; a test pins
  each street villager's kind and the Fairground's eight, so a change to the
  hash is seen. No minimum variety is forced.
- **The journal's villager picture** is left alone.

## My calls (change freely)

- **My call: rigid skinning, one draw per person (A2).** Fewer draws than
  today in every place.
- **My call: near and far builds as two geometries on the one skinned mesh**
  (the prototype has two meshes; one mesh with a geometry swap keeps the scene
  graph to one mesh per person). Switch at 12 m from the camera, with 1 m of
  hysteresis (to far beyond 13 m, back to near inside 11 m). On the LOW rung
  and below (`LOW_RUNG` in `src/render/quality.js`) the switch is at 7 m.
- **My call: targets of at most 2,800 triangles near and 600 far, pinned by
  a test over every kind, sex, hair, hat, top and bottom (by override) and the
  hand-dressed juggler.** The prototype measures 2,364-2,788 near and 700-860
  far. The hair shell's collapsed rim makes zero-area triangles; dropping them
  is the builder's first trim, then fewer sides on the far head, hair and
  shoes. The far target is what keeps the Fairground's pins (below).
- **My call: a person is built at its far geometry** and the near one is
  swapped in each frame when it is within the switch distance, so a static
  count (the Fairground's pins, `test/budget.test.js`) sees the far build.
- **My call: one shared material per place** for all people (vertex colours),
  `MeshStandardMaterial`, roughness 0.86, smooth shading (today's figure is
  flat-shaded; smooth reads softer and nearer the cats).
- **My call: no new collider, no change to who moves where.** Villagers stand,
  visitors stroll, exactly as today.
- **My call: villagers turn to look by bones only** (chest, neck, head). The
  figure child is never rotated and the critter group never moves, so neither
  trace fixture moves.
- **My call: idle timing from the spot hash** (a salt of the same hash), never
  `motionRng` or any other stream.
- **My call: shadows.** Villagers keep casting as today (now 1 shadow draw, not
  3); the Fairground's people still cast none.
- **My call: a head scratch shows.** When she takes "E: get head scratches"
  the villager kneels and holds a hand out low toward her for the purr's 2.5 s.
  The hand does not reach her (she is up to 2.2 m away): it is a kind gesture,
  not a touch (see the owner's question 3).
- **My call: dismay is a surprised "oh!"** (hands come up, palms out, a small
  lean back of the chest), not a wave, when something is knocked over near a
  villager. A meow still gets a wave. Same timers, so nothing that plays
  changes.
- **My call: older people do not kneel**; their hello is a bend at the waist
  with a hand out.
- **My call: the mix.** About 18% children, 18% older people, the rest adults,
  half men and half women; the Fairground's visitors and the juggler are
  dressed from their `look` spots as today. The juggler may be dressed by hand
  (a bright t-shirt), since he is one fixed person.
- **My call: skin tones** run through five shades from light to dark brown,
  picked by the spot hash with equal weight.
- **My call: where the code goes.** A new folder `src/people/` (figure.js
  builds, pose.js poses, look.js dresses, index.js the kit), carried in the
  place packs F6 makes. See "Download" below.

## Performance, per place

Measured in the prototype's harness (`verify-people.html`), 1280 x 720,
renderer.info including shadow passes. The harness builds the place without
the walk's own changes to it (merging, grass, and so on), so its totals are
higher than the game's; the differences are what carry over.

### Per person

| | Draws (main + shadow) | Triangles |
|---|---|---|
| Today's figure | 3 + 3 (streets), 3 + 0 (Fairground) | 428-484 |
| New, near (within 12 m) | 1 + 1 (streets), 1 + 0 (Fairground) | 2,364-2,788 |
| New, far | same | 700-860 in the prototype; target at most 600 |

### Per place

| Place | People | Today | New |
|---|---|---|---|
| Neighborhood, Park, Docks, Seaside | 2 villagers each | 12 draws, about 1,800 triangles (both passes) | 4 draws; at most about 11,000 triangles (both near, both passes), usually one far: about 7,000 |
| Fairground, high tier | 8 visitors + juggler | up to 27 draws, about 4,100 triangles | up to 9 draws; 5,400 (all far, at the 600 target) to 25,200 (all near) triangles |
| Fairground, lower tiers | 5, 3 or 2 visitors + juggler | 18, 12 or 9 draws | 6, 4 or 3 draws |
| Farm, Rooftops, territories, den | none | | |

The Fairground's busiest view in the harness (the cat on the midway at
(3.4, 25.5), the walk's normal camera, six people in view, four of them near):

| | Draws | Triangles |
|---|---|---|
| No people | 219 | 117,692 |
| Today's figure | 237 (+18) | 120,476 (+2,784) |
| New figure, LOD as planned | 225 (+6) | 126,044 (+8,352) |
| New figure, all near | 225 | 133,108 (+15,416) |
| New figure, all far | 225 | 122,332 (+4,640) |

From her eye height at the same spot: today 179 draws / 100,806 triangles, new
167 / 106,374.

Applied to the game's own worst-spot measure at the Fairground (152 draws,
about 102k triangles): about 140 draws and 108k triangles, and about 123k in
the worst case of all nine people near and in view. Draws fall, which is what
the scene is bound by. The CPU cost is 17 bone matrices and two foot checks a
person a frame; people out of view skip posing.

### The Fairground's test pins

People are built at the far geometry, so the show's static count is 9 people
at no more than 600 triangles plus today's balls, balloon and wisp (406):
at most 5,806, under the 6,000 cap; the place plus the show at most 72,498,
under 75,000. No ceiling is raised. (At the prototype's 700-860 far, the show
would be about 7,400 and break the 6,000 cap: hence the 600 target.)

### Instancing and LOD plan

- LOD: near and far builds as above, every place, every tier; the switch at
  12 m, or 7 m from the LOW rung down.
- No instancing now: one draw a person is already fewer than today, and no
  place draws more than nine. If the Market Square ever shows more than about
  15 people at once, the builder measures A3 (instancing per part) or a
  shader-baked walk before building it.
- People out of the camera's view are not posed (their last pose stands).

## How determinism is kept

- **The look:** `personFor(def)` reads only the spot (`def.x`, `def.z`, to the
  centimetre) through today's hash with new salts. Kind, sex, height, girth,
  skin, hair, clothes, hat, glasses and the idle phase all come from it. No
  rng, no clock. The Fairground's visitors keep their synthetic `look` spots;
  the juggler keeps (311.5, 77.25).
- **Math.random:** the whole person (bones, skeleton, its bone texture via
  `skeleton.computeBoneTexture()`, geometries, mesh) is built inside
  `withLocalUuids('person')` (one constant key, as today's `'twoleg-body'`
  keys are: a uuid is only a name), then the builder takes exactly 36 real
  `Math.random()` draws, the old figure's nine uuid'd objects, as a named
  constant with a comment (the flat trace's helper has the same kind of burn,
  ruling F33). Making the bone texture at build time matters: three makes it
  on first render otherwise (`WebGLRenderer.js` 2654), and a texture's uuid is
  four real draws, one person at a time, mid-walk. The shared material is made
  once per kit, inside the same local stream. `test/critters.test.js`'s 41 stays the guard, unchanged. On the
  Fairground the figure is already built inside `withLocalUuids('fair-show')`,
  so its burn draws from that local stream and the real count does not move
  there either.
- **The gameplay trace:** the critter group is placed exactly as today and
  never moves; the figure child is placed only by `standOff`; every movement
  is a bone. Looking at the cat reads her position and changes nothing she can
  feel. `flat-trace.gameplay.json` must not move; the builder runs
  `test/flattrace.test.js` after every step. If the render fixture (contact
  shadows) moves, it may be re-recorded with `UPDATE_TRACE=render` as its file
  says, after checking why.
- **The Fairground's simulation** (`src/fairvisitors.js`) is not touched: its
  positions, yaw, `walked`, `moving` and hellos drive the poses.
- **Two players:** nothing here is sent; every device dresses and poses the
  same people from the same spots.

## Download

**My call: the people code rides in the place packs F6 makes, so the wiring
(step 2 on) waits for F6 to merge; step 1 does not.**

- `src/people/` (figure, look, poses, the LOD switch) is imported by the packs
  of the five places that have people: the four street places' loaders in
  `AREA_LOADERS` import `src/people/index.js` alongside their world (the way
  `fair` already loads three modules with `Promise.all`), and `fairshow.js`
  (already in the fair pack) imports it statically. The bundler makes one
  shared chunk; `src/people/index.js` is added to those five places'
  `AREA_ENTRY_MODULES`, so F6's own checks (its lazy-build test, the
  start-up ceiling, the iOS bundle test, the precache list) catch any static
  import of it from start-up code.
- The pack hands it to the walk (`pack.people`), and `startWalk` passes it to
  `createCritters` as `opts.people` (and to `createFairShow`, which has it
  anyway). `createCritters` stays synchronous; without `opts.people` (switch
  off, or a Node test that does not pass it) it builds today's figure.
- A failed fetch is a failed pack: F6's rules apply unchanged (stay home with
  the gentle line, its timeout, "Getting ready…", its reload after two
  failures, its prefetch). There is no separate people fallback, so two
  co-walkers never see different figures, and step 5 can remove today's
  figure with nothing left depending on it.
- Size: about 10 kB gzip into each of the five packs' first download (the
  Fairground's about 65 kB becomes about 75, under its 100 kB).
- The switch: `src/peopleflag.js`, `peopleOn()` read at call time and
  `setPeople(true | false | null)` for tests, like `src/roofsflag.js` and
  `src/grow.js`. `?people=1` turns it on; after step 4 it defaults on and
  `?people=0` turns it off; step 5 removes it.

## Build steps (each ends in pictures for the owner)

1. **The figure on its own** (can start now, before F6 merges; nothing
   imports it yet). `src/people/` (figure, look, poses) replaces
   `prototype/people-figure.js`, which this step deletes; `verify-people.html`
   is rewritten to draw the real module and gains `__tour`/`__frame` for
   step 3's recording. Tests: joint layout and heights per kind; the
   hair-above-eyes rule (the parts are tagged before the merge, so the test
   reads the eye and hair parts by tag); the triangle targets; exactly 36 real
   `Math.random` draws per person (and none at first render: the bone texture
   is made at build time inside `withLocalUuids`); the same look from the same
   spot; `pose()` allocates nothing (the rule `fairshow.js` keeps).
   **Pictures:** the lineup at the normal camera and her eye height, faces
   close, near against far. The branch is rebased onto main once F6 has
   merged, before step 2.
2. **Villagers.** With the switch on and `opts.people` given, `createCritters`
   builds the new figure and `update` poses it: stand, look at her, wave,
   dismay, the head-scratch kneel (see "Behaviour details"). The two 41-draw
   tests get switch-on copies; `test/helpers/flattrace.js` gains a run with the
   switch on and the people module passed, held to the same gameplay fixture
   (the render fixture may be re-recorded after checking why it moved).
   **Pictures:** each of the four street places from the normal camera, with a
   villager waving, and one from her eye height.
3. **The Fairground.** `fairshow.js` poses visitors (stride from `walked`,
   watching, the kneel hello) and the juggler. **Pictures:** the midway crowd
   day and dusk, a kneel from her eye height, the juggler; and a short
   recording of the stride (`record-page.mjs --tour`), so the owner can judge
   the walk in motion.
4. **Performance and the switch on.** Measure every place at its worst spot
   in a real walk (the adaptive quality's readings), the LOW rung's 7 m switch,
   and the owner's iPhone. **Pass (my call):** draws at every worst spot no
   more than today's; triangles no more than today's plus 15,000; the owner's
   iPhone holds 60 fps on HIGH at the Fairground's worst spot; the Fairground's
   test pins unchanged. Then the switch defaults on. **Pictures:** the
   before/after pairs for every place.
5. **Retire today's figure** once the owner has played with the new people:
   `buildTwolegFigure`, `twolegLook`, `twolegHead` and the switch go, and the
   tests that read them are rewritten for the new figure.

Each step: targeted tests while building, the full suite before merge, and
merge and push only with the owner's yes.

## Left to the builder

- Where exactly the seat meets the thighs and the shoulders meet the arms
  (the prototype's weakest places; see `faces-day.png`).
- Dropping the hair shell's zero-area triangles; final segment counts within
  the targets.
- The eased look turn and its dead zone; how the head returns ahead.
- Foot planting: the prototype only lowers the hips; a small foot lock during
  stance, if the recording shows skating.
- The Fairground's crowd at the busiest spot with the real walk running
  (grass, merge, clouds), measured against today.
- Rewriting the figure's look tests in `test/critters.test.js` (three meshes,
  the arm's rotation, the 1.55-1.75 m height, the standOff test's
  `children[2]`, the spawn-look test reading the coat off `children[0]`, the
  hair test slicing `twolegHead`'s parts) and `test/fairgames.test.js`'s
  exact `MEASURED` triangle counts and mesh counts: these test today's look,
  not the contract, and change with it. The 41-draw tests, the 6,000 and
  75,000 caps and the gameplay fixture do not change.

## Builder check (2026-11-20)

A fresh reviewer (opus) read this design as the engineer who must plan from it
and listed 39 questions. Sorted:

- **Answered already** by the design or the code: the mix and the skin tones
  being hash-chosen (in "My calls"); what stays out of scope (non-goals).
- **Minor, settled as my calls** (folded into "Download", "Behaviour details",
  "How determinism is kept", "Performance" and the build steps): which F6
  pack carries the code, how start-up code reaches it, what a failed fetch
  does, the switch's name and values, timeouts and prefetch (F6's), F6's
  numbers as the baseline, F6's checks covering the new module; step 1
  starting before F6; the flat trace running with the new figure; 36 draws per
  person and switch-on copies of the 41 tests; the bone texture made at build
  time; one local-uuid key; the shared material's owner and every disposal;
  the camera and live rung for the LOD switch; culling with a fixed bounding
  sphere; pose priority; the head-scratch timer and reach; dismay's own field;
  the older people's bow; the Fairground kneel's reach; the look clamp;
  reduced motion; the juggler's hands; no allocation per frame; the contact
  shadow's rest pose; child villagers' shadows; the quest marker's height and
  an adult quest giver; pinning the crowd mix; the Fairground's 6,000 and
  75,000 pins (held by a 600-triangle far build counted at creation); the
  step 4 pass line; which tests are rewritten; the picture page and the
  prototype's removal; step 5 with no fallback left; the journal picture.
- **Only the owner can answer:** the four questions below.

## Questions for the owner

1. **Walking through people.** Today the cat walks straight through a villager
   (they have no collider). With real legs that will look wrong. Should she
   step round them like a lamp post? That changes how the game plays and may
   move the frozen gameplay trace, which needs his yes. Until he answers,
   nothing changes.
2. **Children on their own.** About one person in six is a child. May a child
   be a villager standing alone, or stroll the Fairground without a grown-up
   nearby? If not, children wait until a later "families" step, and this
   build has adults and older people only.
3. **A real head scratch?** When she asks for head scratches, should the
   person's hand actually reach her head when she is close enough (they would
   kneel at their spot and she would be within arm's reach), or stay a kind
   gesture from where they are? Today nothing moves.
4. **The faces.** Dot eyes with a small catchlight, soft brows, a small nose
   and a small closed smile (`faces-day.png`, `wave-cateye-day.png`). Right, or
   plainer (no mouth, no nose), or more (eyelids, cheeks)?
