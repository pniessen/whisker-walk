# Echo Deep: device checklist (iPad 7 and iPhone, with a child)

One page for the owner. The Deep is behind a switch and is not offered to anyone yet.

## Switch it on
- Browser: open the game with `?deep=1` on the end of the address (for example `https://whiskerwalk.org/?deep=1`). Add `&crystal=1` to start a solo walk straight in the Crystal Cave.
- The story opens only for a save that has told the first Crystal story, learned all three tunes in the singing chamber, and found at least two of Lumi's rubbings. Use the child's real cat, or one that is already that far.
- Reduced motion: switch it on in the device's Accessibility settings (Reduce Motion) before opening the page. LOW: leave Quality on Auto, or set it to Low in Settings.

## The walk, step by step
1. Walk to the singing chamber (the middle of the cave). The wall at its south end hums: the prompt says **Hum back to the wall**. Line: "The wall hums a tiny tune. Step on the glowing stones in the same order." Five pads light in turn; step them in that order. Wrong step or a wait only fades the pads and plays it again. Expect: "The wall slides open, and a warm glow spills out." The slab slides away over about 2.5 s (at once with reduced motion).
2. Walk the short passage south into the hall (a ring of rocks and crystals, one opening). Expect three prism stands with the three faces on each (rose, blue, gold; circle, diamond, star) and a door-crystal at the far end.
3. At each stand press the button, prompt **Turn the prism**. Each press turns it to the next face. Match the door's pattern. Expect "That one fits, and it glows." per stand, then "The three prisms agree, and the door-crystal lights up!" Nothing can fail.
4. Say hello to Tink (he sleeps in the nest by the door): "Tink peeps softly and flutters along beside you. Walk him to his hanging crystals above the Rose hall." He follows, shy; leave the cave, teleport or end the walk with him and nothing is lost: next walk he is back in his nest.
5. Walk him to the nook (a stone gate with a pedestal; the guide arrow leads there). Expect "Tink flutters up to his hanging crystals and sings three little chimes. Thank you!", then "Tink left you a Prism Charm to wear." 40 paws once, and the charm in the dressing room (neck).
6. Next walk: Tink has an errand of the day (tune on the chime bars, set three prisms to match gems, carry a moss pad to the nest, or peek in a ring of glints). Pays 25 paws once a walk and a new Chime Charm for the album of twelve.
7. Two cats in a room: one cat's step (wall, prisms, Tink found, Tink home, errand) credits the other once. Try it with the second device.

## What to look at
- **Frame time** on the iPad 7 and the iPhone: stand in the hall, the passage and at the nook, turn slowly, then watch with Tink following. Smooth means no visible stutter turning in the hall. Report the fps if the device shows it, and when it drops (hall, nook, passage, chime bars playing).
- **LOW**: same places. Half the rocks and crystals are gone by design, the pad and stand glow halos are smaller. Report anything missing, flickering surfaces (z-fighting), too dark to read, or the hall opening being hard to find.
- **Reduced motion**: nothing in the Deep should bob or breathe. The wall is simply open, the prisms jump to the new face, Tink sits still, the door glow is steady. Chime bars only change colour. Report anything that still moves.
- Heat and battery after ten minutes in the hall.

## What to report
Device, iOS version, quality tier, reduced motion on or off; for each step above: worked, stuck or confusing, and where (a screenshot helps); fps and where it dips; what the child said or tried first; any line that read oddly or any name the child wants to change (Tink, the Echo Deep and Prism Charm are placeholders in `src/world/crystaldeepnames.js`).

Automated results for the same ground: `docs/pictures/crystal-c8/` (LOW and HIGH pictures, reduced-motion pair), `test/crystaldeepreduced.test.js`, `tools/verify/verify-crystal-deep.html`.
