# polish-home3 plan (overnight, 2026-11-06)

Items: phone Today's walk card shows the whole name; welcome bubble off the cat's face; stage rests at 3/4 with a side key light and a rug; den tile picture; fresh place pictures; no hole in the desktop menu grid; Settings switches gold, not pink.

1. Place pictures (public/places/*.jpg, den.jpg, verify-places.html Seaside view): sonnet subagent, done first.
2. Stage (src/ui/catstage.js): STAGE_REST -1.25, warm key + cool rim, rug disc; update the REST constant in test/catstage.test.js. Sonnet-level, checked live.
3. Bubble (src/ui/homebase.js showWelcome, style.css): stage corner placement, data-side="corner"; test updated.
4. CSS: phone columns .9/1.1fr, name wraps at 15px; menu tiles on a 6-column grid (3+2 -> 2+2+2 / 3+3); switch gold; den tile image.
5. Verify: vitest, build, before/after pairs (desk and 390 phone), review.

Rulings: no "frame low" shift (the framing tests require full fit; the rug grounds the cat); the Menu and Change place sheets keep their column width.
