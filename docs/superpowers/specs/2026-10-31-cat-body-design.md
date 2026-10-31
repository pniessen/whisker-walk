# Whisker Walk: A Cat-Shaped Cat (design)

Date: 2026-10-31. Status: design only, no product code. Built against the `woods` branch (main plus the in-progress Clan Edition work). The implementation plan is `docs/superpowers/plans/2026-10-31-cat-body.md`.

Sections marked **For the builder** carry the engineering detail. The rest is written for a parent.

## 1. Why, and the look we are aiming for

Today's cats look like "a baguette with legs": a long, even sausage of a body on short pegs, with three or four flat stripes laid over the top like stickers. The owner and his daughter (11, the one who picked this look) want them **"more realistic, but also cute"**: a real cat's body and posture, with the big-eyed, short-nosed head kept just as it is.

They chose **Version 2** of a turntable sketch (`cat-shapes.html` in the session scratchpad). It is the target. It is a simplified copy of the game's cat in an older Three.js, so it shows the *shape*, not the final code. What it shows:

- **A shorter body on longer legs, with air under the belly.** The body is about 17% shorter and stands about 9 cm higher. The legs are a third longer.
- **A body shaped like a cat's:** a deep chest, a slim waist just behind the middle, round hips, a belly that tucks up toward the back legs, and a back that rises gently toward the hips.
- **A gentle swell over the hips** where the back legs join. A stronger version was tried and turned down.
- **Strong back legs:** a thicker thigh, and the lower leg angled slightly back the way a cat's hock is.
- **A fuller chest under the chin**, so the head joins the body instead of perching on it.
- **Tabby stripes that belong to the fur:** soft, uneven, slightly wavy bands that wrap the body, break up and fade down the sides, with a darker line along the spine. Separate stripe shapes were tried and looked like "bacon strips". The stripes are now painted into the body itself.
- **A tail that grows out of the rump:** it leaves level from the back of the body, then curls up toward the tip. It is thicker at the base, has rounded joints and a rounded tip, and is 15% smaller overall. A tail pushed deep into the body and angled forward looked like "a dorsal fin" and was turned down.
- **The same cute head:** big eyes, short muzzle, the same whiskers. It is 6% bigger and sits higher and a little further forward.

## 2. Goals, non-goals, anti-goals

**Goals**
- Every cat in the game uses the new body: the kids' cats, the family cats, strays, rival cats, co-walk partners, ghosts, kittens and the colony den.
- Every coat is still recognisable at a glance: tabby, Siamese, Persian, black, calico, Maine Coon, and the family cats Zeetoo, Robbie, D2 and Digit.
- The body is built from a few named numbers and a coat description, so the planned cat builder can drive coat colours, pattern, fur, size and eyes without new drawing code (§7).

**Non-goals**
- No change to the head beyond its size and position. The face is the cute part, and she likes it.
- No change to how cats move, play or score. Speed, nose, napping and bravery are all unchanged.
- Hagrid the chicken is built separately and does not change at all.
- No new poses. Existing poses are refitted to the new body, not redesigned.

**Anti-goals (things this must never do)**
- **Add draw calls.** No cat may end up with more separate pieces (meshes) than it has today. Draw calls are the iPhone's budget. In practice every cat ends up with the same number or fewer (§5).
- **Leave an accessory floating or sunk** into the new body: hats, glasses, collars, neck items, sweaters, capes, backpacks, wings.
- **Make a coat unrecognisable.** Robbie keeps his white bib, flanks and blaze. The calico keeps her orange and grey patches. D2 keeps his white shoulder band.
- **Break an animation.** Napping, sitting, stalking, stretching, pouncing, grooming, being scared or cross, and walking must all still work and look right.
- **Stand a cat in or above the ground**, in any pose.
- **Change anything on the wire.** Co-walk partners are drawn from breed and accessories, exactly as now (§6).

## 3. How each part changes

All numbers are in the cat's own units, before the breed size is applied (a Maine Coon is then 1.3×, Digit 0.82×, and so on).

| Part | Today | New |
|---|---|---|
| Body length / width / depth | 1.35 / 0.85 / 0.75 of a 0.32 ball | 1.12 / 0.80 / 0.74 of the same ball, then bent into a cat shape |
| Body centre height | 0.34 | 0.43 |
| Legs | 0.26 long, hips at 0.30, front and back at z −0.30 / +0.28 | 0.35 long, hips at 0.39, front and back at z −0.24 / +0.24; back legs a touch wider apart (±0.12) |
| Back legs | plain tube | thicker thigh, lower leg angled back |
| Head | at (0, 0.56, −0.44), size 1 | at (0, 0.70, −0.40), size 1.06 |
| Chest | none | a rounded chest under the chin, in the belly colour |
| Belly | pale ball under the body | the same idea, reshaped to the shorter body, and now moves with the body |
| Stripes and patches on the body | separate flat pieces lying on the fur | painted into the body's own colours |
| Tail | thin, nearly straight, 17° of curve, pushed into the rump | rooted at the rump, level then curling up 64° at the tip, thicker base, round joints, 85% size |
| Paws | unchanged | unchanged; still exactly on the ground |
| Whiskers | unchanged | unchanged, just carried by the bigger head |

**The body shape.** The body is still one ball, but each point on it is moved: the front underside drops lower (deep chest), the sides pull in just behind the middle (waist), the back end widens (round hips) with a small extra swell where the thighs join, the underside behind the middle lifts (tucked belly), and the top of the back rises a little toward the hips. These are the sketch's exact numbers. Painting the coat onto this same piece is what lets the stripes follow every curve.

**The poses.** Every pose (nap, sit, stalk and so on) was written for the old, lower body. Rather than rewrite them all, the new cat is treated the way Digit's long legs already are: when a pose folds the legs, the body comes down by the extra leg length, and each folded leg lands its paw where the old leg's would have. So the new cat sits, naps and stalks at the same height above the ground as before, just with a better shape. The tail's new curl is softened in the lying-down poses, so a napping cat's tail wraps round it instead of standing up.

**Accessories.** Hats, glasses, the eye patch and collars ride on the head as now and simply come along. Neck items (bandana, tie, bow tie, scarf, streamer scarf) and collar charms move forward so they sit on the new chest instead of inside it. Sweaters, hoodies and raincoats are reshaped to the new body and move with it. Sweater stripes are painted on, so a sweater takes one piece instead of four. Backpacks, jetpacks, wings and capes are re-placed on the new back and rump using the same "how far from the fur" each had before.

**Things around the cat that know how tall it is.** The cat is about 14 cm taller at the head, so these are re-measured off the built cat: the camera's aim point, name tags and chat bubbles, the "+points" pop-up, the whisker shimmer, the dressing-room stage's fallback aim, the shop thumbnails, the kitten tags and "cat in a box" height in the colony den, and the gap a cat walks through under hedge arches and gate flaps. Carrying, contact shadows, kittens' sizes and perches already measure the cat for themselves.

## 4. How each coat maps onto the new body

The body is now **one piece with its own colours**, the way the sketch's tabby is. Each coat is painted into it. Marks on the head (the tabby "M", Robbie's blaze, the calico's head patch, Digit's white chin) stay as they are today.

| Coat | Body today | Body on the new shape |
|---|---|---|
| **Tabby, Zeetoo** | 4 flat stripes | Painted mackerel bands (the sketch's pattern), darker spine line, fading before the belly |
| **Digit** | 4 bold flat stripes, narrow body | The same painted bands on his narrower body; the "M", white chin, white socks and tag collar unchanged |
| **D2** | stripes + a white shoulder band | Painted bands with the white band painted over the shoulders on top of them (no stripe needs to be dropped any more) |
| **Siamese (points)** | plain cream | Plain cream. The dark face, ears, legs, paws and tail tip still carry the "points" |
| **Calico** | an orange and a grey patch | The same two patches, same places and sizes, painted with soft edges; the orange head patch unchanged |
| **Robbie (cow)** | white flank patches and bib | White flanks and bib painted on; the new chest is his white chest; blaze unchanged |
| **Black** | plain | Plain, the exact same colour as today |
| **Persian, Maine Coon (fluffy)** | a ruff ring at the neck | The ruff moves up with the head and joins the chest. Tufts unchanged |
| **Socks, white legs** | white paws / white leg tubes | Unchanged |

Painted marks have soft edges, so there is no "sticker" edge and no flicker where two marks overlap.

## 5. Pieces per cat (draw calls)

Counted today on `woods` by building every preset. "Simple" is the cheaper version used for strays, rival cats, co-walk partners and ghosts.

| Preset | Today: full / simple | New: full / simple | Why it goes down |
|---|---|---|---|
| Tabby | 31 / 25 | 30 / 24 | stripes painted |
| Siamese | 30 / 24 | 30 / 24 | – |
| Persian | 31 / 25 | 30 / 24 | ruff joins the chest piece |
| Black | 30 / 24 | 30 / 24 | – |
| Calico | 33 / 27 | 31 / 25 | two body patches painted |
| Maine Coon | 31 / 25 | 30 / 24 | ruff joins the chest piece |
| Zeetoo | 31 / 25 | 30 / 24 | stripes painted |
| Robbie | 32 / 26 | 31 / 25 | flanks and bib painted |
| D2 | 34 / 28 | 31 / 25 | stripes, band painted; ruff joins chest |
| Digit | 35 / 29 | 34 / 28 | stripes painted |
| Hagrid | 19 / 19 | 19 / 19 | unchanged |

The new chest, the thighs, the tail's root, joints and tip are all merged into pieces that already exist (the belly, the back legs and the tail links), so they cost no extra draw calls. A sweater drops from 4 pieces to 1.

The new body has more triangles: a smoother torso to paint stripes on, plus the merged thighs, chest and rounded tail joints. A full tabby goes from about 3,700 to about 7,000 triangles, and a simple one from about 3,400 to about 5,000. The game is draw-call bound, not triangle bound (VISUAL-PASS.md section 0), but tests cap these numbers (8,000 full, 5,500 simple) and the iPhone reading is repeated (§8).

## 6. Co-walks

Nothing on the wire changes. Each phone already builds its partner's cat from the partner's breed and accessories, so both phones draw the new body as soon as both have updated. If one phone is still on the old build, each phone draws the partner its own way for a while. That is purely cosmetic: positions, poses and the shared world don't depend on the cat's shape, and the body uses no randomness.

## 7. What's left to the cat builder

The builder (design on branch `cat-builder-design`) feeds a STYLE-row-shaped coat into `buildCat` through `lookToStyle(look)`. This design keeps that contract and makes the builder's job smaller.

**For the builder**
- **Coat painting is one function**, `paintCoat(geometry, coat)` in `src/cat/coat.js`, driven by `coatFromStyle(styleRow)`. A coat is `{ base, belly, accent, stripes, stripeStrength, patches: [{ at, halfX, halfZ, colour }], chest }` (Task 4 of the plan has the exact shape). The builder's "Patches in the markings colour alone" means passing its own colour into `patches`. The calico's orange and grey stay in her STYLE row.
- **Pattern costs change in the builder's favour.** Body stripes, body patches and the socks bib are now painted, so they cost **0** meshes. The worst custom cat is **31 full / 25 simple** (plain body 30, plus one head mark: the "M", the head patch, or the chin). The builder design's ceilings of 33 / 27 should come down to 31 / 25.
- **The bib** becomes the chest piece's colour: `coat.chest` (white for the builder's White socks pattern, `belly` otherwise). It is no longer a body patch.
- **Fur:** Fluffy still means the ruff, which is now part of the chest piece (no extra mesh). Long-haired's `tailFluff` multiplies the new tail's root radius `TAIL_R` (0.078).
- **Size** is still `g.scale`. **Eyes** are still a head colour (`s.eyes ?? EYE_COLORS[breed]`), untouched here.
- **Body proportions are named constants** in `src/cat/torso.js` (`TORSO`), with Digit's `body: [fx, fy, fz]` factors still applied on top. A future "slender / sturdy" choice would be a new factor row, not new code.
- **Determinism:** the paint uses a fixed hash, not `Math.random`, so the same look always paints the same.

## 8. Risks

1. **Poses written for the old body.** Napping, sitting, stalking and stretching might hover or sink on a taller cat with a deeper chest. *Mitigation:* the long-leg refit Digit already uses now applies to every cat; tests record every preset's lowest point in every pose **before** the change and hold the new body to within 1 cm sinking and 2 cm hovering of it. Screenshots of every pose in the live check.
2. **Accessories on a new surface.** The chest now fills the space where neck items and collar charms used to hang, and shells and back items were fitted by eye to the old ellipsoid. *Mitigation:* items touching the body are re-placed by a rule that keeps each one's distance from the fur, not by hand; tests measure each against the real body surface; screenshots of every slot.
3. **Coats losing their identity when painted.** Soft painted edges on a finite mesh can blur a small patch, and the cheaper "simple" body has fewer points to paint on. Colours could drift if painted values aren't in the same colour space as today's materials. *Mitigation:* tests read the painted colours back (Robbie's bib, the calico's two flanks, black stays exactly black); side-by-side screenshots of every preset, full and simple.
4. **Phone performance.** About 3,300 more triangles per full cat and about 1,600 per stray or co-walk partner, drawn twice (the cat and its shadow). *Mitigation:* the counts are pinned in tests; the live check repeats the Stream 4 iPhone reading in the busiest area. The fallback is a lower segment count for simple cats, not a different shape.
5. **The tail changes owner.** Its curl moves from fixed positions to a bend the animator applies each frame, so lying-down poses can soften it. Hagrid's tail must stay exactly as it is. *Mitigation:* Hagrid's golden fingerprint must not change in any task; animator tests pin the new curl.

## 9. Decisions for the owner to check

1. **Digit's legs.** He keeps "1.35× longer legs" on top of the new, longer standard leg (0.47 instead of 0.35). That may read as stilts. The live check shows 1.35 against 1.2; he chooses.
2. **Name tags rise about 14 cm**, so they stay clear of the taller head and ears. This also changes how co-walk partners' tags sit.
3. **Hedge arches and gate flaps:** the clearance over the cat goes from 1.0 m to 1.1 m, so a standard cat's ears still pass under them. Maine Coons already brush through today.
4. **Siamese stays plain cream on the body.** A faint darker shading over the hips is possible at no cost if he wants it.
5. **The family cats' painted stripes** (Zeetoo, D2, Digit) use the same soft mackerel pattern as the tabby. Compare them to their photos in the live check.
