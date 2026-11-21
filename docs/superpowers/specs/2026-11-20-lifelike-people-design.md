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

After the first pictures (2026-11-20, "Needs changes"):

3. **"The humans need necks."** In the first pictures the heads sat straight
   on the shoulders. Every figure gets a visible neck, near and far: a proper
   length for each age, a slight forward set, and collars that do not swallow
   it; the head-to-body ratio and the shoulder slope are checked against real
   proportions so the neck does not make the head look small or the shoulders
   square. (Done in the prototype, v2: see "The neck and the proportions".)
4. **The cat steps round people.** Each person gets a small soft bump she
   slides round, like posts and benches. (See "The soft bump".)
5. **Children appear only next to a grown-up**: beside an adult in town, and in
   pairs at the Fairground. None stand alone. (See "Pairs".)

After the v2 pictures (2026-11-20, v2 approved, and the build plan asked for):

6. **Faces: more expression.** Bigger smiles, and eyes that follow the cat
   when she is near: the head and eyes turn toward her within a few metres and
   ease back. Keep it friendly, never staring or creepy. Blinks are welcome.
   The details are left to the builder; the new faces are shown in the first
   build step's pictures. (See "Expression".)
7. **Head scratch: a real touch.** They kneel and the hand reaches her head
   when she is within arm's reach; otherwise they hold the hand out and she can
   come closer. The hand must never go through her head or body: it reaches to
   her actual head position on the frame of the touch, and stays there while
   she stays. (See "The head scratch".)

## Pictures

The prototype (commit `eb24235b` on branch `people`, marked PROTOTYPE) is a
picture sheet, `verify-people.html`, drawing `prototype/people-figure.js` next
to today's figure with the game's own sun, fill, image light, shadows and
dusk. It is throwaway: nothing in the game imports it and no test covers it.
The pictures are in the session scratchpad: the first set in
`/private/tmp/claude-501/-Users-pniessen--claude-spares-spare-gcns3j/e37e3895-a9b0-4a89-9360-a15387ffb2e4/scratchpad/people/`,
the second (v2: necks, pairs) in its `v2/` folder.
Re-make them with the dev server on 5398:

```
npx vite --port 5398 --strictPort
node scripts/record-page.mjs --url "http://localhost:5398/verify-people.html" --out <dir> --shots lineup-day,lineup-cateye-day,stride-day,wave-cateye-day,crouch-cateye-day,lineup-sunset,wave-cateye-sunset,stride-sunset,far-day,lod-close,faces-day,faces-front-day,neck-side-day,neck-far-day,back-day,crowd-spots
node scripts/record-page.mjs --url "http://localhost:5398/verify-people.html?scene=fair&fig=new" --out <dir>/fair-new --shots fair-day,fair-dusk,fair-close
node scripts/record-page.mjs --url "http://localhost:5398/verify-people.html?scene=fair&fig=old" --out <dir>/fair-old --shots fair-day,fair-dusk,fair-close
```

| Picture | What it shows |
|---|---|
| `lineup-day.png` | Today's figure, then a man (1.80 m), a woman (1.66 m) with a child (1.30 m) at her side, and an older man (1.70 m), at the walk's normal camera, a tabby for scale |
| `lineup-cateye-day.png` | The same from her eye height (0.3 m); the people look down at her |
| `stride-day.png`, `stride-sunset.png` | Mid-stride, both steps, three-quarter view |
| `wave-cateye-day.png`, `wave-cateye-sunset.png` | The wave, from her eye height |
| `crouch-cateye-day.png` | The Fairground's hello as a kneel (today's figure squashes) |
| `lineup-sunset.png` | The walk's dusk light |
| `far-day.png`, `lod-close.png` | The far build, at 14 m and side by side with the near build |
| `faces-day.png` | Faces close up (closer than the game's camera comes), looking down at the cat |
| `faces-front-day.png` (v2) | Faces straight on, looking at us: for judging the faces |
| `neck-side-day.png`, `neck-far-day.png` (v2) | Side view: the neck from root to jaw, its forward set, the shoulders sloping up to it; near and far build |
| `back-day.png` | From behind: hair, coats |
| `crowd-spots.png` | The eight street villager spots dressed only from their spots; in v2 three of them are a grown-up with a child |
| `fair-new/fair-day.png` vs `fair-old/fair-day.png` | The real Fairground midway with its visitors and the juggler, new figure and today's, day; also `fair-dusk.png` and `fair-close.png` (her eye height). In v2 a child walks beside a grown-up on the left of the midway. |

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
  teeth, no realistic noses or lips, no open mouth. Dark dot eyes, taller than
  wide, with one small catchlight; soft brows whose outer ends dip a little; a
  closed smile. Eyes that follow her glance away and blink (decision 6), so
  they never stare. The far build drops everything but the eyes.
- **Nothing that scares a 9-year-old.** No sudden moves, no fast turns of the
  head (turns ease over about half a second), no looming: a person's body
  never leans over the cat. The one touch is the head scratch she asks for
  (decision 7): only the hand comes to her, slowly, from in front and above,
  and it rests on her head; it never passes through her. No frowns, no angry poses; "dismay" is a
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
  the place plus the show at 75,000 (the place alone is 66,692). The 75,000
  holds; the show's own 6,000 rises to 8,000 because pairs add people (my
  call, see "The Fairground's test pins").
- **Old iPads.** The scene is draw-call bound (`test/budget.test.js`'s notes):
  draws are the scarce thing, triangles nearly free.

## Approaches considered

| | How | Trade-off | |
|---|---|---|---|
| **A** | **A jointed figure built in code: shaped rigid parts (lathed limbs with rounded ends that overlap at elbow and knee, a lathed torso, a shaped head), each bound wholly to one of 20 joints, drawn as ONE rigidly skinned mesh per person** | Like the cats: built in code, tunable, no art pipeline. One draw per person whatever the pose. Joints read clearly at elbow and knee. Needs a little care where parts meet (the seat and thighs, the shoulders). | **chosen** (owner, decision 2) |
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
side `upperArm`, `forearm`, `hand`, `thigh`, `shin`, `foot`; and on the head
`eyeL`, `eyeR` and `mouth` (decision 6): 20 bones, one `Skeleton`. Pelvis, chest, neck and head turn in `YXZ` order so a look is a
yaw then a nod.

### Body, by kind

Heights: man 1.72-1.85 m, woman 1.60-1.73 m, child 1.16-1.42 m, older man
1.66-1.78 m, older woman 1.55-1.67 m; girth 0.94-1.08. Joints are fractions
of height (adult: knee 0.285, hip 0.525, waist 0.615, shoulder joint 0.818,
neck root 0.845 (0.842 for women), chin 0.872; child: shoulder 0.785, neck
root 0.808, chin 0.846; a child's eyes sit lower in the face). See "The neck
and the proportions" for why. Limb girths are a real person's (a thigh
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

### The neck and the proportions (owner's decision 3; prototype v2)

What was wrong in v1: the neck was a thin stub (radius 4.6 cm on a 1.75 m
man) centred under the head, and the head was an egg whose lower back reached
down to chin height all round, so from every side the head sat on the
shoulders. The shoulders also ran nearly flat into the head.

What v2 does, checked against adult and child body measurements:

| | v1 | v2 | Real (adult man about 1.75-1.80 m; a child of about eight) |
|---|---|---|---|
| Head height (chin to crown) | 0.134 H (1/7.5) | 0.128 H (1/7.8): 23 cm on a 1.80 m man; child 0.154 H (1/6.5): 20 cm at 1.30 m | 22-24 cm, 1/7.5-1/8; child about 1/6-1/6.5 |
| Head width / height | 0.74 | 0.71 (child 0.77) | about 0.67; a touch wider here because hair sits on top, and narrower read as a small head once the neck showed |
| Head depth / height | 0.86 | 0.85 | about 0.85 |
| Neck girth (round) | 29 cm | 38 cm on a 1.80 m man, 30 on a 1.66 m woman, 26 on a 1.30 m child (with girth) | 37-40, 31-33, about 26 |
| Neck, chin to the notch between the collarbones (front) | hidden | about 8 cm on a 1.80 m man, about 7 cm on a 1.30 m child | 8-9 cm; a child's is shorter |
| Neck set | upright, under the head's middle | leans 0.23 rad (13 degrees) forward from its root; the head's middle sits 0.22 of its depth forward of the neck's top | the neck leans forward 10-15 degrees; the skull balances forward of the spine |
| Shoulder slope (shoulder top to the neck's root) | about 9 degrees, with the arm's rounded top standing above it | about 20 degrees | 15-25 degrees |

How it is built:

- The neck is its own tube from inside the chest to inside the head behind the
  jaw, leaning forward; one `neckFrame(d)` gives the neck's root, top and the
  head's centre, shared by the parts and the joints (the neck and head bones
  sit on it), so turning and nodding pivot where a real neck does.
- The back of the skull is drawn in below the head's middle (`occiputTuck`),
  the hair shell with it, so the neck shows behind the jaw from the side.
- The chest's top slopes about 20 degrees from each shoulder up to the neck's
  root (the trapezius), and its neckline dips at the front to the collarbone
  notch (`necklineDip`), so the front of the neck runs longer than the sides,
  as a real one does.
- The upper arm's rounded top and the deltoid are lowered and flattened so the
  shoulder line runs on from the neck into the arm instead of standing up in a
  square bump.
- Collars: a low crew collar (1.6 cm; a coat's 2 cm and a little fuller) at
  the neck's root, dipping with the neckline. It never climbs the neck.
- The far build keeps the neck, the collar and the slope (`neck-far-day.png`).
- Older people's stoop brings the head forward on the same neck; their neck
  reads a little shorter, as it does.

Cost: the collar is the only new part. Per figure, near +80 triangles and far
+48 (measured on the four sheet figures and 200 spawn spots: the same +80 and
+48 on every one). The neck tube and the head moved, their segment counts did
not.

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
darker than the skin; a smile (bigger since decision 6, see "Expression").
Children's eyes are a little larger and lower. Far build: the two eyes only
(they blink and follow her too). No eye whites, irises, teeth or eyelids.

### Expression (owner's decision 6; the details are my calls)

Three more joints, children of `head`: `eyeL`, `eyeR` (each pivots at its
eyeball's centre, 0.6 of the eye's depth inside the face, so the dot slides
over the face as a real eye turns) and `mouth`. 20 joints in all. Every
vertex is still bound to one joint.

- **A bigger smile.** The closed smile is 0.42 of the head's width (it was
  0.34), its arc 0.8 of a half turn, its line 1.4 times as thick, the corners
  turned up; the cheeks under the eyes are a shade warmer (vertex colour).
  When she is near and looked at, the `mouth` joint widens it a further 15%
  (scale x 1.15, y 1.1) over 0.4 s, and back as she goes. Still closed: no
  teeth, no open mouth.
- **Eyes and head follow her within a few metres.** She is "near" within 4 m
  (my call), and stops being near beyond 5 m. When she comes near, the eyes
  lead (they turn toward her over 0.15 s, up to 0.3 rad), and the head, neck
  and chest follow over 0.6 s (the turn of "Movement", up to 75 degrees);
  when she goes, the head eases back to ahead over 0.8 s and the eyes with it.
  Beyond 110 degrees round, they do not turn.
- **Never staring.** After 4 s of looking at her, a person glances away (the
  eyes and a little of the head, 0.25 rad, to the side the hash picks) for
  1.2 s and comes back. Gaze shifts start with a blink.
- **Blinks.** Each eye joint scales to 0.1 in y and back over 0.12 s, every
  2.5-5.5 s, the interval from the spot hash and the walk clock (never a
  roll), and on every gaze shift. Both eyes together.
- **Fairground visitors** follow her only when stopped (watching or saying
  hello), as before.
- **Reduced motion:** blinks stay; the glance away does not happen; turns ease
  twice as slowly.
- **Far build:** the eyes follow and blink (they are on the same joints); no
  mouth.

### Palettes

Five skin tones from light to dark brown; hair dark, black, brown, auburn,
blond (grey or white for older people); muted tops and bottoms for adults,
bright ones for children.

### Movement

- **Standing:** a slow weight shift (about every 6 s for adults; quicker and
  bigger for children, smaller for older people): the hips slide and tilt to
  the standing leg, the other knee softens, the chest counter-tilts; a
  breath; arms hang a little out and a little bent.
- **Looking at the cat:** when she is within 4 m (decision 6; "Expression"),
  the eyes lead and the head (45%), neck (37%) and chest (18%) share a turn of
  up to 75 degrees and a nod down toward her, eased; beyond 5 m they look
  ahead.
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
- **The head scratch** is a real touch (decision 7): see "The head scratch".
  It starts through `critters.scratchHello(c)` (new), called where
  `interactions.js` handles the 'scratch' prompt.
- **Dismay** gets its own field, `c.dismayT = 1.5`, set beside `meowWaveT` in
  `dismayNear`; `meowWaveT` keeps its timing, so nothing that plays changes.
- **The Fairground kneel** reaches at most 0.55 m in front of the visitor's
  middle; with `KEEP` 1.0 m the hand stays at least 0.45 m from her middle.
- **Looking at her:** villagers look at the local cat when she is within 4 m
  (never a co-walker's cat; "Expression"). The turn is clamped at 75 degrees; if she is more
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
- **Shadows of children:** a child is always in its adult's critter group, and
  `castsFromBox` judges the whole group (tall enough), so a child casts a sun
  shadow like its grown-up.
- **The quest marker** sits 0.35 m above the giver's head
  (`look.height + 0.35`), not at a fixed 2.1 m. The giver is always a grown-up:
  a pair's quest giver is its adult (children never stand alone, decision 5).
- **The crowd mix** is whatever the hash gives on today's spots; a test pins
  each street villager's kind (and which are pairs) and the Fairground's
  eight, so a change to the hash is seen. No minimum variety is forced. On
  today's spots the prototype's hash gives three pairs among the eight street
  villagers ((14, 34) in the Neighborhood, (-8, -22) in the Park, (-10, -8) at
  the Docks) and three among the Fairground's eight visitors.
- **The journal's villager picture** is left alone.

## The head scratch (owner's decision 7; the details are my calls)

She asks with E at a villager ("E: get head scratches", within 2.2 m;
`interactions.js` as today: the award, the purr and its haptic are unchanged).

- **The kneel.** The villager kneels at their own spot (an adult on one knee;
  an older person bends at the waist instead, chest at most 0.5 rad), turned
  toward her by the body's own joints (the critter group and the figure child
  never turn). The kneel lasts while she stays within 2.5 m, at least 2.5 s,
  and they stand up 0.6 s after she leaves.
- **Within arm's reach: the touch.** Each frame, the target is her head as it
  is on that frame: the world position of her cat's head part
  (`cat.userData.parts.head`, passed in by the walk) plus its top
  (`headTopOffset`, from her cat's own head size), plus 0.01 m. The right arm
  reaches it by a two-joint solve (shoulder and elbow) with the palm down;
  "within reach" means the solve reaches the target with the chest leaning at
  most 0.5 rad. The hand travels from held-out to the target over 0.7 s by way
  of a point 0.12 m above her head (it comes from in front and above, never
  through her), and while she stays it rests there, following her head each
  frame, with a slow stroke (±0.02 m along her head's front-to-back line, 1.5
  strokes a second) that keeps the clearance.
- **Out of reach:** the hand is held out, palm down, low, toward her, at most
  0.55 m in front of the person's middle, and she can come closer (the soft
  bump lets her middle come to 0.57 m of theirs).
- **She moves away** out of reach: the hand eases back to held-out over 0.4 s,
  rising first.
- **Never through her.** A test sweeps her head and body (spheres and a capsule
  from her cat's own size, `catDims`) over a grid of positions and headings
  inside and around the reach, for each cat shape, and holds every arm and
  hand sample of the approach, the rest and the stroke at least 0.005 m clear
  of them.
- **Two players.** Only her own cat is touched on her screen; the partner sees
  the person kneel and reach toward her partner's cat on their own screen
  (each device poses its own villagers from its own cat).
- **The Fairground** has no head scratch; its kneel hello holds the hand out
  as before, and `KEEP` keeps her beyond reach.

## The soft bump (owner's decision 4)

Each person gets a small circle the cat is pushed out of, exactly as she is by
a post or a bench (`player.js`'s collider push: she slides round it).

- **Size (my call):** 0.22 m for an adult, 0.18 m for a child (a body and
  arms' half width), plus the cat's own `CAT_RADIUS` 0.35 as for every collider:
  her middle stays at least 0.57 m from an adult's middle.
- **Its own list, not `area.colliders` (my call).** The bumps live in a
  persistent array of `{ x, z, r }` (one per person, a pair's adult and child
  each have one), passed to `player.update` as a new last argument and pushed
  after the colliders, with the same perched-cat exemption. Nothing else reads
  it: strays, clan cats, intruders, ghosts, the Fairground's own simulation
  (which tests its visitors against `area.colliders` and would otherwise
  collide with itself), `keepout.js`'s `standSpot`, gold mice and finds keep
  seeing today's world. Villagers' bumps are fixed at the walk's start;
  Fairground visitors' bumps are moved in place each frame from the
  simulation (no allocation). Only the local cat is pushed; a co-walker's cat
  is placed by her own device, which has the same bumps from the same spots.
- **The Fairground:** visitors already keep 1.0 m from her middle (`KEEP`),
  more than 0.57, so there the bump only matters if she runs into someone
  faster than they give way.
- **Gameplay trace impact.** `flat-trace.gameplay.json` traces the four street
  places with villagers (Neighborhood, Park, Docks, Seaside; the Fairground is
  not traced). Measured from the fixture: the scripted cat never comes nearer
  than 13.4 m to any villager spot (Neighborhood 14.8, Park 13.4, Docks 28.1,
  Seaside 18.2 m), against a bump reach of at most 0.57 m plus a pair's 0.66 m
  offset. Because nothing else reads the bump list, no other traced system
  can change either. So the fixture must not move, and it is not re-recorded:
  `test/helpers/flattrace.js` passes the bumps to `player.update` (so the
  trace runs the new code) and `test/flattrace.test.js` holds it to the
  frozen file. If it moves, that is a bug to find, not a re-record.
- **Placements (my call):** a test checks that every place a cat must reach
  in the four street places (gold mice, find spots, yarn spots, quest targets,
  pois, the spawn) is at least the bump's reach plus 0.1 m from every person.
  Spots that fail move, not the people.

## Pairs (owner's decision 5)

Children appear only next to a grown-up.

- **In town:** a villager spot whose hash says "child" is a pair. The critter
  is still one villager (one id, one spawn, one group that never moves, one
  quest giver, one wave): its figure is the adult, standing where today's
  figure stands (`standOff` as today), and the child is a second figure in the
  same group, 0.65 m to the adult's side. The side is the one clear of the
  area's colliders by the child's bump, picked at build time from the spot
  (never a roll). Ranges (wave, dismay, scratch, quest) still measure from the
  adult (`villagerPos`). The child waves when the adult waves and looks at the
  cat when the adult does.
- **At the Fairground:** a visitor whose `look` spot says "child" is a pair: one
  simulated visitor (the count, `visitorCount`, is unchanged) drawn as two.
  `src/fairvisitors.js` gains a pair's width: its own radius becomes 0.65 m
  and `KEEP` is measured to the nearer of the two, so neither comes within
  1.0 m of her middle; the child's spot is stepped in the simulation (beside
  the adult where the way is at least 1.6 m clear, a step behind where it is
  not), so the rules are tested on both. The child takes its own stride from
  the same metres walked (shorter legs, more steps). The Fairground is not in
  the gameplay trace; its own tests change with this and are extended to the
  child.
- **Draws:** a pair is two people: +1 draw (+1 shadow draw in town).
- **Math.random:** a pair's child is built inside the same `withLocalUuids`
  call as its adult and takes no real draws; the critter still pays exactly 36
  (the 41-draw test is unchanged, and gets a pair case).
- No child is ever a separate critter, a separate visitor, or a quest giver.

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
  hand-dressed juggler.** The prototype measures (v2, with the collar) 2,444-
  2,900 near and 748-908 far on the sheet's four, and at most 3,068 near and
  976 far over 200 spawn spots (long hair and hats are the heaviest). The hair shell's collapsed rim makes zero-area triangles; dropping them
  is the builder's first trim, then fewer sides on the far head, hair and
  shoes. The far target is what keeps the Fairground's pins (below).
- **My call: a person is built at its far geometry** and the near one is
  swapped in each frame when it is within the switch distance, so a static
  count (the Fairground's pins, `test/budget.test.js`) sees the far build.
- **My call: one shared material per place** for all people (vertex colours),
  `MeshStandardMaterial`, roughness 0.86, smooth shading (today's figure is
  flat-shaded; smooth reads softer and nearer the cats).
- **My call: no change to who moves where.** Villagers stand, visitors
  stroll, exactly as today. (The owner's soft bump, decision 4, is below.)
- **My call: villagers turn to look by bones only** (chest, neck, head). The
  figure child is never rotated and the critter group never moves, so neither
  trace fixture moves.
- **My call: idle timing from the spot hash** (a salt of the same hash), never
  `motionRng` or any other stream.
- **My call: shadows.** Villagers keep casting as today (now 1 shadow draw, not
  3); the Fairground's people still cast none.
- **A head scratch is a real touch** (the owner's decision 7; the details in
  "The head scratch" are my calls).
- **My call: dismay is a surprised "oh!"** (hands come up, palms out, a small
  lean back of the chest), not a wave, when something is knocked over near a
  villager. A meow still gets a wave. Same timers, so nothing that plays
  changes.
- **My call: older people do not kneel**; their hello is a bend at the waist
  with a hand out.
- **My call: the mix.** A spot's hash picks child (about 18%), older (18%) or
  adult, and half men and half women; a "child" spot is a pair (owner's
  decision 5, see "Pairs"). The Fairground's visitors and the juggler are
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
| New, near (within 12 m) | 1 + 1 (streets), 1 + 0 (Fairground) | v1 2,364-2,788; v2 (collar) 2,444-2,900 (up to 3,068 over 200 spots); target at most 2,800 |
| New, far | same | v1 700-860; v2 748-976; target at most 600 |

### Per place

| Place | People | Today | New |
|---|---|---|---|
| Neighborhood, Park, Docks, Seaside | 2 villagers each | 12 draws, about 1,800 triangles (both passes) | 4 draws, 6 with a pair (on today's spots: Neighborhood, Park and Docks have one pair each); at most about 17,000 triangles (a pair and a single, all near, both passes) |
| Fairground, high tier | 8 visitors + juggler | up to 27 draws, about 4,100 triangles | 8 visitors (3 of them pairs on today's spots) + juggler = 12 people: up to 12 draws; 7,200 (all far, at the 600 target) to 34,600 (all near) triangles |
| Fairground, lower tiers | 5, 3 or 2 visitors + juggler | 18, 12 or 9 draws | one draw a person, pairs counted as two |
| Farm, Rooftops, territories, den | none | | |

The Fairground's busiest view in the harness (the cat on the midway at
(3.4, 25.5), the walk's normal camera):

| | Draws | Triangles |
|---|---|---|
| No people | 219 | 117,692 |
| Today's figure (6 people in view) | 237 (+18) | 120,476 (+2,784) |
| v1 new figure, LOD as planned (6 in view) | 225 (+6) | 126,044 (+8,352) |
| v1 new figure, all near / all far | 225 | 133,108 (+15,416) / 122,332 (+4,640) |
| v2 (necks, pairs: 8 people in view), LOD as planned | 227 (+8) | 129,888 (+12,196) |
| v2 all near / all far | 227 | 138,908 (+21,216) / 124,268 (+6,576) |

From her eye height at the same spot: today 179 draws / 100,806 triangles, v1
167 / 106,374, v2 169 / 110,218.

Applied to the game's own worst-spot measure at the Fairground (152 draws,
about 102k triangles), v2: about 142 draws and about 114k triangles, about
128k in the worst case of everyone near and in view. Draws still fall. Draws fall, which is what
the scene is bound by. The CPU cost is 20 bone matrices and two foot checks a
person a frame; people out of view skip posing.

### The Fairground's test pins

People are built at the far geometry, so the show's static count is 12 people
on today's spots (8 visitors, 3 of them pairs, and the juggler) at no more
than 600 triangles, plus today's balls, balloon and wisp (406): at most 7,606.
The place plus the show is at most 74,298, under the Fairground's 75,000
(the owner's ceiling, unchanged). **My call:** the show's own 6,000 cap in
`test/fairgames.test.js` (a comparison with the Farm's animals, not one of
the owner's budgets) rises to 8,000 because pairs add people; its mesh count
falls (16 meshes against today's 31). (Before pairs, 9 people at 600 fitted
under 6,000.) The prototype's far build is 748-976 triangles in v2, so the
600 target stands and the hair shell's trim matters.

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
   The soft bumps (their own list into `player.update`) and the town pairs
   land here, with the placement test and the flat trace run with bumps on.
   **Pictures:** each of the four street places from the normal camera, with a
   villager waving, a pair, and one from her eye height; a short recording of
   the cat sliding round a villager.
3. **The Fairground.** `fairshow.js` poses visitors (stride from `walked`,
   watching, the kneel hello) and the juggler; `fairvisitors.js` gains pairs
   (the width, `KEEP` to both, the child's spot) and moves the visitors' bumps. **Pictures:** the midway crowd
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
- **Only the owner can answer:** four questions; he answered all four on 2026-11-20 (decisions 4-7).

## Questions for the owner

All answered on 2026-11-20 and recorded above as his decisions 3-7: necks,
the cat stepping round people, children only next to a grown-up, more
expression, and a real head scratch. None are open.
