# Builder scars (design, built 2026-11-27)

Playtester ask (2026-11-21): in the cat builder a child can give her cat a Warrior Cats style scar.

## Choices (defaults chosen)
A new "Scar" row of big pills in the builder, after Fur: **No scar** (default), **Nose scratch**, **Over the eye**, **Cheek scratch**, **Nicked ear**, **Torn ear tip**. Five scars, free, one at a time. Plain words, so both word sets use them as they are.

## Looks
Gentle and healed, never gory: one thin pale-pink stroke (the fight scars' healed pink, a near-white blush on a reddish coat, so it reads on every coat). Always on the cat's right. The ear marks sit on the back of the right ear (seen from the walk camera behind her); the face marks on the skull.

## Saved field
`look.scar`, an additive sub-key of a custom cat's look (`sanitizeLook`). "none" and anything unknown are dropped, so an unscarred cat saves byte-identically. It rides `customCats` whole through `MERGE_RULES` and the cloud merge (cats compare by name, personality and look), the wire (`accessories.look`, re-sanitised by `wireLook`) and `lookKey`.

## Drawing
One extra mesh `marks` (at most 8 triangles, 10 vertices, no shadow) on a cat that has one, built by the fight scars' own strip code (`scarmesh.js`) and fitted with it every frame, so it rides the head or ear. Its code is `src/cat/scarmark.js`, loaded on first use (`userData.markReady` is the promise), keeping start-up growth at +0.44 kB. A fight scar clearing never wipes it; they sit side by side. Ready-made and clan cats have none; Hagrid never.
