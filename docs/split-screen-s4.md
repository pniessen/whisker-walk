# Split screen, S4: a camera control for each pad (`?split=1`)

Builds on S1. Without `?split=1` nothing changes (start-up stays 678.3 kB gzipped; the coop chunk 20.3 kB, ceiling 25).

## Mapping
The control mapping follows the picture through a latch (`src/coop/padsplit.js`, pure): it becomes `split` only when the slide into the split has finished (`t >= 1`) and goes back to `shared` only when the split picture is gone, so mid-slide (either way) the previous mapping stays and nothing lurches.

| Control | shared (as today) | split |
|---|---|---|
| Pad one right stick | taken out (couch view) | orbits cat one's camera (the walk's own `addOrbit`, same feel and limits) |
| Pad one L1 / R1 | taken out; turn the shared heading a quarter | zoom out / in cat one's camera (the walk's zoom control, saved as the setting) |
| Pad two right stick | nothing | `mover.player.addOrbit` on cat two's camera (same player code, so the same limits) |
| Pad two L1 / R1 | turn the shared heading a quarter | cat two's own zoom step (clamped to the place's cap; not saved) |
| Start, Select, D-pad Down, menus | unchanged | unchanged |

Dead zone and frame-rate independence come from `stepPad` / `orbitDelta` (0.18 dead zone, per-second speed).

## Hand-over
- Into split: cat two's camera starts at cat one's current zoom step; both cats keep their yaw (it was the shared heading).
- Back to shared: the shared heading starts at cat one's camera yaw and eases to the nearest quarter; a stick held through it keeps its world direction (`setInputYaw`, as a quarter turn does). Orbit is delta-driven, so a pad that vanishes mid-split leaves nothing running; cat two leaving resets the latch.
- Camera pop on the way into the split (S1 gap): while sliding in, cat one's camera is eased from the last shared pose to its own (smoothstep over the 400 ms slide). The merge direction has no such ease (the shared pose is only known once it is back).

## Code touched
`src/coop/padsplit.js` (new), `src/coop/index.js` (latch, orbit and zoom routing, hand-over), `src/coop/padhub.js` (`padForWalk(pad, engaged, split)`), `src/coop/splitview.js` (S2 shares it): `coop.splitRes = res` after `rule.step` and the reset beside the no-cam2 path; the `poseFrom` capture and the blend/restore around the render loop (about 13 lines, all marked `S4`).

## Try it
`npm run dev`, `/?coop=1&tv=1&split=1`, two pads. Walk apart on the open street until it splits, then push each right stick and press L1 / R1; walk back together and watch the camera hand back.

## Not verified
Real DualSense pads and the TV. Gaps: cat two ignores the "invert Y" setting (the setting lives in main.js); pitch left tilted by an orbit stays in that cat's own camera for the next split; no ease on the merge.
