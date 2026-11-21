# Task 6 report: Two players on the Rooftops

Status: DONE. No code fix was needed; T1 holds.

Tests written (new file test/roofsgame.test.js, 4 tests, all pass; also run with test/remotecats.test.js, all pass):
- A partner on plank-1 (driven headless with the real player and traversal runtime on roofsArea()), mid-plank over the back yard: perchY equals rail height minus ground (to 1e-9); liftForState gives h within 0.01; a remote cat on the Rooftops' ground, fed that state, is drawn within 0.02 m of the rail height. The rail is more than 2 m above the yard under her.
- Mid-leap (return-1-east): every frame with perchY above 0.3 m, perchY matches the height above the ground, and (sampled) the remote is drawn within 0.02 m of the arc's height; peak above 0.5 m.
- decideWalkOnHave for town-roofs: one member not answered = wait (all stay); a member who cannot = no; host not ready = wait; all ready = go.
- A guest without the Rooftops: walkOnMove 'override' (guest or not), pickOnCrossing never buys (false, points and unlocks unchanged).

Files changed: test/roofsgame.test.js (new). Nothing in src.
Concern: the remote draw is run with a fake scene (no WebGL needed); only the numbers (position.y) are checked, not pixels.
