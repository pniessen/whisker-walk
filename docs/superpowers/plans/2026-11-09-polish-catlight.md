# polish-catlight (Pass 10, item 10-2)

Goal: walking cats get a soft sky rim so the black cat stops reading as a
silhouette; the leaf/flower wreath gains side-on height. Body shape,
proportions and the wrap-around stripes are untouched.

1. `src/cat/rimlight.js` (new): `addCatRim(materials, { dark })` patches
   MeshStandardMaterials with a Fresnel rim `pow(1 - saturate(N·V), 3)`, tinted
   by the scene's own `hemisphereLights[0].skyColor` (normalised by
   HEMI_INTENSITY), weighted toward the sky, screened onto the lit colour and
   capped at 0.4, so it never blooms. Strength 0.18 light coats / 0.30 darkFace (tuned down from the survey's 0.25/0.45 after the first live shot turned the black cat grey-blue), tail links x0.55, tint 30% toward grey.
   No hemisphere light (home stage, dressing room) = no rim, so the stage keeps
   its look. One shared program key. 0 triangles, 0 draws.
2. `src/cat/model.js`: at the end of buildCat, give the fur materials the rim
   (torso, underside, skull, muzzle, cheeks, ears, limbs, paws, tail links, head
   markings). Not eyes, nose, inner ears, whiskers or accessories. Hagrid's
   shared painted material gets the light rim.
3. `src/game/walk.js`: one hook after the dusk block, `setCatRimLight({ dusk })`:
   dusk rim x0.6 and pulled 35% toward a cool blue.
4. `src/cat/hats.js` (wreath only): laurel leaves curl higher and tilt their far
   edge up; flower petals cup up at their tips. 0 extra triangles.
5. Tests: test/catrim.test.js (which materials, strengths, stage gate via
   NUM_HEMI_LIGHTS, dusk state); wreath side height. Full suite, build, flat
   trace af079017…b83a. Before/after pairs in snaps-polish-catlight/pairs.
